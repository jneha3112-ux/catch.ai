const express = require('express');
const router = express.Router();
const { sendWhatsAppMessage } = require('../services/whatsappService');

// This webhook is triggered by Twilio when a call comes in or completes (StatusCallback)
router.post('/', async (req, res) => {
  // Extracting exact payload properties from Twilio Webhook
  const { CallStatus, DialCallStatus, From, To, Direction } = req.body;

  // Twilio sends 'no-answer' either in CallStatus (if the call itself wasn't answered)
  // or DialCallStatus (if a <Dial> wasn't answered).
  const status = DialCallStatus || CallStatus;

  try {
    // Detect missed call (no-answer, busy, or canceled)
    if (status === 'no-answer' || status === 'busy' || status === 'canceled') {
      const message = "Hi! We missed your call at the Dental Clinic. How can we help you today? Would you like to book an appointment?";
      
      // Ensure the 'From' number is formatted properly for WhatsApp
      const to = From.startsWith('+') ? From : `+${From}`;
      
      // Log missed call to DB for dashboard
      const { readDB, writeDB } = require('../config/db');
      const db = await readDB();
      db.missed_calls.push({ 
        phoneNumber: to, 
        timestamp: new Date().toISOString(),
        status: 'recovered'
      });
      await writeDB(db);

      // Send WhatsApp message using our modular Twilio service
      await sendWhatsAppMessage(to, message);
      
      return res.status(200).send('Missed call detected. WhatsApp message sent.');
    }

    // If it's an initial incoming call (e.g., CallStatus is 'ringing' or 'in-progress')
    // We can provide TwiML to Dial the clinic or play a message
    res.type('text/xml');
    res.send(`
      <Response>
        <Say>Welcome to the Dental Clinic. Please hold while we try to connect you.</Say>
        <Dial action="/call">
           <Number>+1234567890</Number>
        </Dial>
      </Response>
    `);
  } catch (error) {
    console.error('Error handling missed call webhook:', error);
    res.status(500).send('Error processing call webhook');
  }
});

module.exports = router;
