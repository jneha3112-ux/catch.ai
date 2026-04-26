require('dotenv').config();
const express = require('express');

const callRoutes = require('./routes/calls');
const whatsappRoutes = require('./routes/whatsapp');

const app = express();

// Middleware to parse URL-encoded bodies (which Twilio sends)
app.use(express.urlencoded({ extended: true }));
// Middleware to parse JSON
app.use(express.json());
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

// Get stats for dashboard
app.get('/api/stats', async (req, res) => {
  const { readDB } = require('./config/db');
  const db = await readDB();
  res.json({
    totalUsers: Object.keys(db.users).length,
    totalAppointments: db.appointments.length,
    availableSlots: db.slots.length,
    totalMissedCalls: db.missed_calls.length,
    recentEvents: db.missed_calls.slice(-10).reverse()
  });
});

// Health check endpoint
app.get('/', (req, res) => {
  res.send('Clinic AI Backend is running.');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
