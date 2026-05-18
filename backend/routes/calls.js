const express = require('express');
const router = express.Router();
const { sendWhatsAppMessage } = require('../services/whatsappService');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://wbibehdgvmcrpgzaxkvu.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || '';

// This webhook is triggered by Twilio when a call comes in or completes (StatusCallback)
// Note: Twilio signature validation is handled by middleware in server.js
router.post('/', async (req, res) => {
  const { CallStatus, DialCallStatus, From, To, Direction, CallSid } = req.body;

  const status = DialCallStatus || CallStatus;

  try {
    // Detect missed call (no-answer, busy, or canceled)
    if (status === 'no-answer' || status === 'busy' || status === 'canceled') {
      const message = "Hi! We missed your call at the Dental Clinic. How can we help you today? Would you like to book an appointment?";
      
      // Sanitize the phone number
      const to = From && From.startsWith('+') ? From : `+${From || ''}`;
      if (!to || to.length < 9) {
        console.warn('[Call] Invalid From number:', From);
        return res.status(400).send('Invalid phone number');
      }

      // ── Log to Supabase call_logs ──
      try {
        const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
        
        // Look up which user owns this "To" phone number
        const { data: profile } = await sb
          .from('profiles')
          .select('id')
          .ilike('twilio_number', To)
          .single();

        const userId = profile?.id || null;

        await sb.from('call_logs').insert([{
          user_id: userId,
          from_number: to,
          caller_number: to,
          to_number: To,
          call_sid: CallSid || null,
          booking_status: 'pending',
          call_status: status,
          whatsapp_sent: true,
          created_at: new Date().toISOString()
        }]);

        console.log(`[Supabase] Logged missed call from ${to} for user ${userId}`);
      } catch (supaErr) {
        console.warn('[Supabase] call_logs write failed:', supaErr.message);
      }

      // Send WhatsApp message using our modular Twilio service
      await sendWhatsAppMessage(to, message);
      
      return res.status(200).send('Missed call detected. WhatsApp message sent.');
    }

    // If it's an initial incoming call, play a message
    // The clinic's actual number should come from the user's profile/config
    res.type('text/xml');
    res.send(`
      <Response>
        <Say>Welcome to the clinic. We're sorry we can't take your call right now. You'll receive a WhatsApp message shortly to help you book an appointment. Thank you!</Say>
      </Response>
    `);
  } catch (error) {
    console.error('Error handling missed call webhook:', error);
    res.status(500).send('Error processing call webhook');
  }
});

module.exports = router;
