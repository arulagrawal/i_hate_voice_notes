"use strict";
const express = require("express");
const axios = require("axios").default;
const FormData = require('form-data');

const whatsapp_token = process.env.WHATSAPP_TOKEN;
const openai_token = process.env.OPENAI_API_KEY;
const verify_token = process.env.VERIFY_TOKEN;

const app = express().use(express.json());

app.listen(process.env.PORT || 1337, () => console.log("webhook is listening"));

const getAudioUrl = async (audio_id) => {
  const response = await axios.get(`https://graph.facebook.com/v13.0/${audio_id}`, {
    headers: { "Authorization": `Bearer ${whatsapp_token}` },
  });
  return response.data.url;
};

const downloadAudio = async (audio_url) => {
  const response = await axios.get(audio_url, {
    headers: { "Authorization": `Bearer ${whatsapp_token}` },
    responseType: 'arraybuffer' // change this from 'stream'
  });

  return Buffer.from(response.data, 'binary'); // This is now a Buffer, not a promise
};

const transcribeAudio = async (audio_buffer) => {
  const form = new FormData();

  form.append('file', audio_buffer, { // Pass the buffer directly and add additional info for the form
    contentType: 'audio/ogg', // This may vary based on the audio file type
    name: 'file',
    filename: 'audio.ogg',
  });

  form.append('model', 'whisper-1');

  const response = await axios.post('https://api.openai.com/v1/audio/transcriptions', form, {
    headers: {
      'Authorization': `Bearer ${openai_token}`,
      ...form.getHeaders(), // Spread the form headers (important for boundary and content-length)
    },
  });

  return response.data.text;
};

const sendMessage = async (phone_number_id, from, text) => {
  const response = await axios.post(
    `https://graph.facebook.com/v12.0/${phone_number_id}/messages?access_token=${whatsapp_token}`,
    {
      messaging_product: "whatsapp",
      to: from,
      text: { body: text },
    },
    {
      headers: { "Content-Type": "application/json" },
    }
  );
  return response.data.messages[0].id;
};

const markAsRead = async (phone_number_id, message_id) => {
  await axios.post(
    `https://graph.facebook.com/v18.0/${phone_number_id}/messages`,
    {
      messaging_product: "whatsapp",
      status: "read",
      message_id: message_id,
    },
    {
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${whatsapp_token}`,
      },
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

      if (phone_number_id && from && audio_id) {
        await markAsRead(phone_number_id, messages.id);

        const audio_url = await getAudioUrl(audio_id);
        const audio = await downloadAudio(audio_url);

        const transcription = await transcribeAudio(audio);
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
