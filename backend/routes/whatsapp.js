const express = require('express');
const router = express.Router();
const { readDB, writeDB } = require('../config/db');
const { sendWhatsAppMessage } = require('../services/whatsappService');
const { generateResponse } = require('../services/aiService');

router.post('/incoming', async (req, res) => {
  // Twilio sends the WhatsApp numbers with a 'whatsapp:' prefix
  const from = req.body.From ? req.body.From.replace('whatsapp:', '') : 'unknown';
  const body = req.body.Body;

  if (from === 'unknown') {
    return res.status(400).send('Invalid sender');
  }

  try {
    const db = await readDB();
    
    if (!db.users[from]) {
      db.users[from] = { conversationHistory: [], state: 'chatting' };
    }
    
    const history = db.users[from].conversationHistory;

    // Get AI Response
    const aiResponse = await generateResponse(from, body, history);
    
    // Update history
    history.push({ role: "user", content: body });
    history.push({ role: "assistant", content: aiResponse });
    await writeDB(db);

    // Send the reply back via WhatsApp
    await sendWhatsAppMessage(from, aiResponse);
    
    res.status(200).send('Message processed');
  } catch (error) {
    console.error('Error in WhatsApp route:', error);
    res.status(500).send('Error processing WhatsApp message');
  }
});

module.exports = router;
