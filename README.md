## I hate voice notes

A Whatsapp bot which replies with text transcripts of audio you send it.

The intended workflow is to forward voice notes your "friends" send you to the bot, and it will reply with the text transcript.

### Setup
You need to set 3 environment variables.

`WHATSAPP_TOKEN` your token for your app from Meta.

`VERIFY_TOKEN` your custom verify token that you give Meta.

`OPENAI_API_KEY` your api key for openai in order to use Whisper.

### Problems

 - [x] The bot gives you no indication it's working until you either get or don't get a transcript.
 - [x] The code downloads the audio to a file then uploads that file again. It should be possible to do this in memory.
 - [ ] create a docker image
