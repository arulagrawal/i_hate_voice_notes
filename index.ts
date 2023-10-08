import { Router } from '@stricjs/router';
import { query } from '@stricjs/utils';

const whatsapp_token = Bun.env.WHATSAPP_TOKEN;
const openai_token = Bun.env.OPENAI_API_KEY;
const verify_token = Bun.env.VERIFY_TOKEN;

const app = new Router({ hostname: "0.0.0.0", port: Bun.env.PORT || 1337 });

const getAudioUrl = async (audio_id: string) => {
	const request = await fetch(`https://graph.facebook.com/v13.0/${audio_id}`, {
		method: "GET",
		headers: { Authorization: `Bearer ${whatsapp_token}` },
	});
	const response = await request.json();
	return response.url;
};

const downloadAudio = async (audio_url: string) => {
	const request = await fetch(audio_url, {
		method: "GET",
		headers: { Authorization: `Bearer ${whatsapp_token}` },
	});
	const response = await request.arrayBuffer();
	return new Blob([response], { type: "audio/ogg" });
};

const transcribeAudio = async (audio_buffer: Blob) => {
	const form = new FormData();

	form.append("file", audio_buffer, "audio.ogg");
	form.append("model", "whisper-1");

	const request = await fetch(
		"https://api.openai.com/v1/audio/transcriptions",
		{
			method: "POST",
			body: form,
			headers: {
				Authorization: `Bearer ${openai_token}`,
			},
		},
	);

	const response = await request.json();
	return response.text;
};

const sendMessage = async (phone_number_id: string, from: string, text: string) => {
	const request = await fetch(
		`https://graph.facebook.com/v12.0/${phone_number_id}/messages`,
		{
			method: "POST",
			body: JSON.stringify({
				messaging_product: "whatsapp",
				to: from,
				text: { body: text },
			}),
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${whatsapp_token}`,
			},
		},
	);
	const response = await request.json();
	return response.messages[0].id;
};

const markAsRead = async (phone_number_id: string, message_id: string) => {
	const request = await fetch(
		`https://graph.facebook.com/v18.0/${phone_number_id}/messages`,
		{
			method: "POST",
			body: JSON.stringify({
				messaging_product: "whatsapp",
				status: "read",
				message_id: message_id,
			}),
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${whatsapp_token}`,
			},
		},
	);
};

app.post("/webhook", async (ctx) => {
	try {
		if (!ctx.data.object) return new Response("Invalid Request", { status: 400 });

		const changes = ctx.data.entry?.[0]?.changes;
		const value = changes?.[0]?.value;
		const messages = value?.messages?.[0];
		if (messages) {
			const metadata = value.metadata;
			const phone_number_id = metadata?.phone_number_id;
			const from = messages.from;
			const audio_id = messages?.audio?.id;

			if (phone_number_id && from && audio_id) {
				await markAsRead(phone_number_id, messages.id);

				const audio_url = await getAudioUrl(audio_id);
				const audio = await downloadAudio(audio_url);

				const transcription = await transcribeAudio(audio);
				await sendMessage(phone_number_id, from, transcription);
			}
		}
		return new Response("EVENT_RECEIVED", { status: 200 });
	} catch (error) {
		console.error("An error occurred:", error);
		return new Response("An error occurred", { status: 500 });
	}
}, { body: 'json' });

app.get("/webhook", (ctx) => {
	const parsed = query(ctx.url.substring(ctx.query + 1));
	const mode = parsed["hub.mode"];
	const token = parsed["hub.verify_token"];
	const challenge = parsed["hub.challenge"];

	if (mode && token && mode === "subscribe" && token === verify_token) {
		console.log("WEBHOOK_VERIFIED");
		return new Response(challenge, { status: 200 });
	} else {
		return new Response("Invalid Request", { status: 403 });
	}
});

app.listen();