# Clinic AI

A lightweight MVP for a Dental Clinic AI assistant.

## Features
1. Missed call detection (Twilio webhook)
2. WhatsApp conversation handling (Twilio WhatsApp API)
3. OpenAI integration for natural conversations & function calling
4. Appointment scheduling with a simple JSON database

## Prerequisites
- Node.js (v14 or higher)
- Twilio Account (with WhatsApp Sandbox or verified WhatsApp number)
- OpenAI API Key

## Local Setup Instructions

1. **Install dependencies**
   \`\`\`bash
   npm install
   \`\`\`

2. **Configure Environment Variables**
   Open the \`.env\` file and add your actual Twilio and OpenAI credentials.

3. **Start the Server**
   \`\`\`bash
   npm start
   \`\`\`
   The server will start on port \`3000\`.

4. **Expose Local Server**
   To receive webhooks from Twilio, you need to expose your local server to the internet using a tool like ngrok.
   \`\`\`bash
   ngrok http 3000
   \`\`\`

5. **Configure Twilio Webhooks**
   - For phone calls, set your Twilio phone number's "A CALL COMES IN" webhook to \`https://<your-ngrok-url>/api/calls/incoming\`
   - For WhatsApp, set your Twilio WhatsApp sender's "WHEN A MESSAGE COMES IN" webhook to \`https://<your-ngrok-url>/api/whatsapp/incoming\`
