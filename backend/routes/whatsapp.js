const express = require('express');
const router = express.Router();
const { sendWhatsAppMessage } = require('../services/whatsappService');
const { generateResponse } = require('../services/aiService');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://wbibehdgvmcrpgzaxkvu.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || '';

// Note: Twilio signature validation is handled by middleware in server.js
router.post('/incoming', async (req, res) => {
  // Twilio sends the WhatsApp numbers with a 'whatsapp:' prefix
  const from = req.body.From ? req.body.From.replace('whatsapp:', '') : 'unknown';
  const body = req.body.Body;

  if (from === 'unknown' || !from || from.length < 8) {
    return res.status(400).send('Invalid sender');
  }

  // Sanitize user message — strip control characters, limit length
  const sanitizedBody = (body || '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // strip control chars
    .substring(0, 1000); // max 1000 chars

  if (!sanitizedBody.trim()) {
    return res.status(400).send('Empty message');
  }

  try {
    // Use Supabase for conversation storage instead of JSON file
    const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

    // Try to get existing conversation from Supabase
    let conversationHistory = [];
    try {
      const { data } = await sb
        .from('conversations')
        .select('history')
        .eq('phone', from)
        .single();
      if (data?.history) {
        conversationHistory = data.history;
      }
    } catch (e) {
      // No existing conversation — start fresh
    }

    // Get AI Response
    const aiResponse = await generateResponse(from, sanitizedBody, conversationHistory);
    
    // Update history (keep last 20 messages to avoid token overflow)
    conversationHistory.push({ role: "user", content: sanitizedBody });
    conversationHistory.push({ role: "assistant", content: aiResponse });
    if (conversationHistory.length > 20) {
      conversationHistory = conversationHistory.slice(-20);
    }

    // Store updated conversation
    try {
      await sb.from('conversations').upsert({
        phone: from,
        history: conversationHistory,
        updated_at: new Date().toISOString()
      });
    } catch (e) {
      console.warn('[DB] Conversation save failed:', e.message);
    }

    // Send the reply back via WhatsApp
    await sendWhatsAppMessage(from, aiResponse);
    
    res.status(200).send('Message processed');
  } catch (error) {
    console.error('Error in WhatsApp route:', error);
    res.status(500).send('Error processing WhatsApp message');
  }
});

module.exports = router;
