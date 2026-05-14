require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

const callRoutes = require('./routes/calls');
const whatsappRoutes = require('./routes/whatsapp');

const app = express();

// Security Headers
app.use(helmet());

// Middleware to parse URL-encoded bodies (which Twilio sends)
app.use(express.urlencoded({ extended: true }));
// Middleware to parse JSON
app.use(express.json());
// Enable strict CORS
app.use(cors({
  origin: [
    'https://catch-ai.onrender.com', 
    'https://catch-ai.com', 
    'http://localhost:3000', 
    'http://127.0.0.1:3000'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true
}));
// Serve static files from the frontend folder
app.use(express.static('frontend'));

// Routes
app.use('/call', callRoutes);
app.use('/api/whatsapp', whatsappRoutes);

// Simulation endpoint for the Demo Dashboard
app.post('/simulate-call', async (req, res) => {
  const { phoneNumber } = req.body;
  const { sendWhatsAppMessage } = require('./services/whatsappService');
  const { readDB, writeDB } = require('./config/db');
  const message = "Hi! We missed your call at the Dental Clinic. How can we help you today? Would you like to book an appointment?";
  try {
    // Log to DB
    const db = await readDB();
    db.missed_calls.push({ 
      phoneNumber, 
      timestamp: new Date().toISOString(),
      status: 'simulated'
    });
    await writeDB(db);

    await sendWhatsAppMessage(phoneNumber, message);
    res.json({ success: true, message: 'Simulation triggered' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Vapi Proxy Endpoint
app.post('/api/vapi/call', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: 'Unauthorized: Missing or invalid token' });
    }

    const { phoneNumber } = req.body;
    const VAPI_KEY = process.env.VAPI_KEY;

    if (!phoneNumber) {
        return res.status(400).json({ success: false, error: 'Phone number is required' });
    }

    try {
        const payload = {
            phoneNumberId: "58504387-bfed-4baf-bb45-1fbae6e2a3ec",
            customer: { number: phoneNumber },
            assistant: {
                firstMessage: "Hello! This is Sarah from Catch AI Dental. I saw you requested a callback on our website. How can I help you today?",
                model: {
                    provider: "openai",
                    model: "gpt-3.5-turbo",
                    messages: [
                        {
                            role: "system",
                            content: "You are Sarah, a highly professional AI receptionist for Catch AI Dental clinic. You are returning a call to a patient who just visited our website. Be extremely warm, ask how you can help them, and attempt to schedule them for a consultation this week. If they ask about pricing, say that it varies but consultations are free. Be concise, polite, and conversational."
                        }
                    ]
                },
                voice: {
                    provider: "openai",
                    voiceId: "alloy"
                }
            }
        };

        const response = await fetch("https://api.vapi.ai/call/phone", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${VAPI_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || data.error || "Failed to initiate call via Vapi");
        }

        res.json({ success: true, data });
    } catch (error) {
        console.error("Vapi Proxy Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Serve landing page at root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
