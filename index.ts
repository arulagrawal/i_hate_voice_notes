import { Router } from "@stricjs/router";
import { query } from "@stricjs/utils";

const whatsapp_token = Bun.env.WHATSAPP_TOKEN;
const openai_token = Bun.env.OPENAI_API_KEY;
const verify_token = Bun.env.VERIFY_TOKEN;

if (!whatsapp_token) {
	throw new Error("WHATSAPP_TOKEN is missing from the environment variables");
}
if (!openai_token) {
	throw new Error("OPENAI_API_KEY is missing from the environment variables");
}
if (!verify_token) {
	throw new Error("VERIFY_TOKEN is missing from the environment variables");
}

const app = new Router({ hostname: "0.0.0.0", port: Bun.env.PORT || 1337 });

const getAudioUrl = async (audio_id: string) => {
	const request = await fetch(`https://graph.facebook.com/v18.0/${audio_id}`, {
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

	if (!request.ok) {
		console.error("An error occurred:", request);
		return;
	}
	const response = await request.json();
	return response.text;
};

const sendMessage = async (phone_number_id: string, from: string, text: string) => {
	const request = await fetch(
		`https://graph.facebook.com/v18.0/${phone_number_id}/messages`,
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

	if (!request.ok) {
		console.error("An error occurred:", request);
	}

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

interface Task {
	message_id: string;
	phone_number_id: string;
	from: string;
	audio_id: string;
	transcription?: string;
}

class Queue {
	tasks: Task[] = [];

	async addTask(task: Task) {
		const index = this.tasks.push(task) - 1;
		console.log("Task added to queue: ", index);
		console.log("audio id: ", task.audio_id);
		console.log();
		await this.getTranscription(task);
		console.log(`task : ${index}`, task);
		console.log(`task : ${index} attempting to send message`);
		await this.attemptSendAll();
	}

	async getTranscription(task: Task) {
		const { phone_number_id, message_id, audio_id } = task;

		const audio_url = await getAudioUrl(audio_id);
		const audio = await downloadAudio(audio_url);
		const transcription = await transcribeAudio(audio);
		await markAsRead(phone_number_id, message_id);

		task.transcription = transcription;
	}

	async attemptSendAll() {
		while (this.tasks.length > 0) {
			const task = this.tasks[0];
			if (task) {
				if (task.transcription) {
					this.tasks.shift();
					console.log("sending message with audio id: ", task.audio_id);
					const { phone_number_id, from, transcription } = task;
					await sendMessage(phone_number_id, from, transcription);
				} else {
					return;
				}
			}
		}
	}
}

const queue = new Queue();

app.post(
	"/webhook",
	async (ctx) => {
		try {
			if (!ctx.data.object)
				return new Response("Invalid Request", { status: 400 });

			const changes = ctx.data.entry?.[0]?.changes;
			const value = changes?.[0]?.value;
			const messages = value?.messages?.[0];
			if (messages) {
				const metadata = value.metadata;
				const phone_number_id = metadata?.phone_number_id;
				const from = messages.from;
				const audio_id = messages?.audio?.id;

				if (phone_number_id && from && audio_id) {
					const task = {
						message_id: messages.id,
						phone_number_id,
						from,
						audio_id,
					};
					queue.addTask(task);
				}
			}
			return new Response("EVENT_RECEIVED", { status: 200 });
		} catch (error) {
			console.error("An error occurred:", error);
			return new Response("An error occurred", { status: 500 });
		}
	},
	{ body: "json" },
);

app.get("/webhook", (ctx) => {
	const parsed = query(ctx.url.substring(ctx.query + 1));
	const mode = parsed["hub.mode"];
	const token = parsed["hub.verify_token"];
	const challenge = parsed["hub.challenge"];

	if (mode && token && mode === "subscribe" && token === verify_token) {
		console.log("WEBHOOK_VERIFIED");
		return new Response(challenge.toString(), { status: 200 });
	} else {
		return new Response("Invalid Request", { status: 403 });
	}
});

app.listen();
