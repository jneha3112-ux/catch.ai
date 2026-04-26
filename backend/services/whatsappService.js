const twilio = require('twilio');
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
// Initialize twilio client only if valid credentials exist to avoid crashes during setup
const client = (accountSid && accountSid.startsWith('AC')) ? twilio(accountSid, authToken) : null;

async function sendWhatsAppMessage(to, body) {
  if (!client) {
    console.warn('Twilio client not initialized. Would send:', body);
    return;
  }
  
  try {
    const message = await client.messages.create({
      body: body,
      from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
      to: `whatsapp:${to}` // ensure 'to' doesn't already have 'whatsapp:' prefix if passed directly
    });
    console.log(`WhatsApp message sent to ${to}, SID: ${message.sid}`);
    return message;
  } catch (error) {
    console.error('Error sending WhatsApp message:', error);
    throw error;
  }
}

module.exports = { sendWhatsAppMessage };
