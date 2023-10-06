"use strict";
const express = require("express");
const body_parser = require("body-parser");
const axios = require("axios").default;
const FormData = require('form-data');
const fs = require('fs');

const token = process.env.WHATSAPP_TOKEN;
const openai_token = process.env.OPENAI_API_KEY;
const app = express().use(body_parser.json());

app.listen(process.env.PORT || 1337, () => console.log("webhook is listening"));

const getAudioUrl = async (audio_id) => {
  const response = await axios.get(`https://graph.facebook.com/v13.0/${audio_id}?access_token=${token}`);
  return response.data.url;
};

const downloadAudio = async (audio_url) => {
  const response = await axios.get(audio_url, {
    headers: { "Authorization": `Bearer ${token}` },
    responseType: 'stream',
  });
  const filePath = 'audio.ogg';
  const writer = fs.createWriteStream(filePath);
  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
};

const transcribeAudio = async (filePath) => {
  const form = new FormData();
  form.append('file', fs.createReadStream(filePath));
  form.append('model', 'whisper-1');

  const response = await axios.post('https://api.openai.com/v1/audio/transcriptions', form, {
    headers: {
      'Authorization': `Bearer ${openai_token}`,
      'Content-Type': 'multipart/form-data',
    },
  });

  return response.data.text;
};

const sendMessage = async (phone_number_id, from, text) => {
  await axios.post(
    `https://graph.facebook.com/v12.0/${phone_number_id}/messages?access_token=${token}`,
    {
      messaging_product: "whatsapp",
      to: from,
      text: { body: text },
    },
    {
      headers: { "Content-Type": "application/json" },
    }
  );
};

app.post("/webhook", async (req, res) => {
    try {
        if (!req.body || !req.body.object) return res.sendStatus(404);

        const entry = req.body.entry;
        const changes = entry && entry[0] && entry[0].changes;
        const value = changes && changes[0] && changes[0].value;
        const messages = value && value.messages && value.messages[0];
        if (messages) {
            const metadata = value.metadata;
            const phone_number_id = metadata && metadata.phone_number_id;
            const from = messages.from;
            const audio = messages.audio;
            const audio_id = audio && audio.id;

            if(phone_number_id && from && audio_id) {
                const audio_url = await getAudioUrl(audio_id);
                await downloadAudio(audio_url);

                const transcription = await transcribeAudio('audio.ogg');
                await sendMessage(phone_number_id, from, transcription);
            }
        }
        res.sendStatus(200);
    } catch (error) {
        console.error("An error occurred:", error);
        res.sendStatus(500);
    }
});

app.get("/webhook", (req, res) => {
  const verify_token = process.env.VERIFY_TOKEN;

  let mode = req.query["hub.mode"];
  let token = req.query["hub.verify_token"];
  let challenge = req.query["hub.challenge"];

  if (mode && token && mode === "subscribe" && token === verify_token) {
    console.log("WEBHOOK_VERIFIED");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});
