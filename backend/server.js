require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const rateLimit = require('express-rate-limit');
const twilio = require('twilio');
const { createClient } = require('@supabase/supabase-js');

const callRoutes = require('./routes/calls');
const whatsappRoutes = require('./routes/whatsapp');

const app = express();

// ── Security Headers ──────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com", "https://unpkg.com", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdn.tailwindcss.com"],
      imgSrc: ["'self'", "data:", "https://*", "http://*"],
      connectSrc: ["'self'", "https://*.supabase.co", "wss://*.supabase.co", "https://api.geojs.io", "https://get.geojs.io", "https://api.vapi.ai", "https://unpkg.com", "https://cdn.jsdelivr.net"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://fonts.googleapis.com"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
}));

// ── Core Middleware ────────────────────────────────────────────────────────────
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ── CORS ──────────────────────────────────────────────────────────────────────
const allowedOrigins = [
  'https://catch-ai.onrender.com',
  'https://catch-ai.com'
];
if (process.env.NODE_ENV !== 'production') {
  allowedOrigins.push('http://localhost:3000', 'http://localhost:5173');
}
app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true
}));

// ── Rate Limiting ─────────────────────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  message: { error: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(globalLimiter);

// Strict limiters for expensive/sensitive endpoints
const webhookLimiter = rateLimit({ windowMs: 60 * 1000, max: 30, message: 'Rate limit exceeded for webhooks' });
const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 10, message: 'Rate limit exceeded for API' });
const callLimiter = rateLimit({ windowMs: 60 * 1000, max: 3, message: 'Rate limit exceeded for outbound calls' });
const paymentLimiter = rateLimit({ windowMs: 60 * 1000, max: 5, message: 'Rate limit exceeded' });

// ── Serve static files ────────────────────────────────────────────────────────
app.use(express.static('frontend'));

// ── Twilio Webhook Signature Validation Middleware ────────────────────────────
function validateTwilioWebhook(req, res, next) {
  // Skip validation in development if no auth token is set
  if (!process.env.TWILIO_AUTH_TOKEN) {
    console.warn('[Security] TWILIO_AUTH_TOKEN not set — skipping webhook validation');
    return next();
  }

  const twilioSignature = req.headers['x-twilio-signature'];
  if (!twilioSignature) {
    console.warn('[Security] Rejected request: Missing X-Twilio-Signature header');
    return res.status(403).send('Forbidden: Missing Twilio signature');
  }

  // Build the full URL Twilio used to sign
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const url = `${protocol}://${req.get('host')}${req.originalUrl}`;

  const isValid = twilio.validateRequest(
    process.env.TWILIO_AUTH_TOKEN,
    twilioSignature,
    url,
    req.body
  );

  if (!isValid) {
    console.warn('[Security] Rejected request: Invalid Twilio signature for', url);
    return res.status(403).send('Forbidden: Invalid Twilio signature');
  }

  next();
}

// ── Supabase JWT Verification Middleware ──────────────────────────────────────
async function verifySupabaseToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Missing or invalid token' });
  }

  const token = authHeader.split(' ')[1];
  if (!token || token.length < 10) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Malformed token' });
  }

  try {
    const sb = createClient(
      process.env.SUPABASE_URL || 'https://wbibehdgvmcrpgzaxkvu.supabase.co',
      process.env.SUPABASE_ANON_KEY || ''
    );
    const { data: { user }, error } = await sb.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ success: false, error: 'Unauthorized: Invalid or expired token' });
    }

    req.user = user; // Attach verified user to request
    next();
  } catch (err) {
    console.error('[Auth] Token verification error:', err.message);
    return res.status(401).json({ success: false, error: 'Unauthorized: Token verification failed' });
  }
}

// ── Input Sanitization Helper ─────────────────────────────────────────────────
function sanitizePhone(phone) {
  if (!phone || typeof phone !== 'string') return null;
  // Strip everything except digits, +, and spaces
  const cleaned = phone.replace(/[^\d+\s\-()]/g, '').trim();
  // Must be between 8 and 20 chars and start with + or digit
  if (cleaned.length < 8 || cleaned.length > 20) return null;
  return cleaned;
}

// ── Routes ────────────────────────────────────────────────────────────────────

// Twilio webhooks — validated with Twilio signature
app.use('/call', webhookLimiter, validateTwilioWebhook, callRoutes);
app.use('/api/whatsapp', webhookLimiter, validateTwilioWebhook, whatsappRoutes);

// ── Simulation endpoint (Dashboard) ──────────────────────────────────────────
app.post('/simulate-call', apiLimiter, verifySupabaseToken, async (req, res) => {
  const rawPhone = req.body.phoneNumber;
  const phoneNumber = sanitizePhone(rawPhone);

  if (!phoneNumber) {
    return res.status(400).json({ success: false, error: 'Invalid phone number format' });
  }

  const { sendWhatsAppMessage } = require('./services/whatsappService');
  const message = "Hi! We missed your call at the Dental Clinic. How can we help you today? Would you like to book an appointment?";

  try {
    // Log to Supabase only (removed insecure JSON file fallback)
    try {
      const sb = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
      );
      await sb.from('call_logs').insert([{
        user_id: req.user.id,
        from_number: phoneNumber,
        caller_number: phoneNumber,
        call_status: 'simulated',
        whatsapp_sent: true,
        created_at: new Date().toISOString()
      }]);
    } catch (dbErr) {
      console.warn('[DB] Simulation log failed:', dbErr.message);
    }

    await sendWhatsAppMessage(phoneNumber, message);
    res.json({ success: true, message: 'Simulation triggered' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── Vapi Proxy Endpoint ──────────────────────────────────────────────────────
app.post('/api/vapi/call', callLimiter, verifySupabaseToken, async (req, res) => {
  const rawPhone = req.body.phoneNumber;
  const phoneNumber = sanitizePhone(rawPhone);
  const VAPI_KEY = process.env.VAPI_KEY;

  if (!phoneNumber) {
    return res.status(400).json({ success: false, error: 'Valid phone number is required' });
  }

  if (!VAPI_KEY) {
    return res.status(503).json({ success: false, error: 'Vapi service not configured' });
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

// ── Server-Side Payment Verification Endpoint ────────────────────────────────
// Instead of trusting a URL parameter, verify from the server
app.post('/api/verify-payment', paymentLimiter, verifySupabaseToken, async (req, res) => {
  const { paymentId, planType } = req.body;

  if (!paymentId || !planType) {
    return res.status(400).json({ success: false, error: 'Missing paymentId or planType' });
  }

  if (!['starter', 'pro'].includes(planType)) {
    return res.status(400).json({ success: false, error: 'Invalid plan type' });
  }

  try {
    // TODO: When you set up PayPal API credentials, verify the payment here:
    // const paypalVerified = await verifyPayPalPayment(paymentId);
    // if (!paypalVerified) return res.status(400).json({ error: 'Payment not verified' });

    // For now, log the verification attempt (replace with real PayPal verification)
    console.log(`[Payment] Verification request: user=${req.user.id}, payment=${paymentId}, plan=${planType}`);

    const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const sb = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
    );

    const { data, error } = await sb.from('profiles').upsert({
      id: req.user.id,
      email: req.user.email,
      plan: planType,
      subscription_end: thirtyDaysFromNow,
      payment_id: paymentId,
      updated_at: new Date().toISOString()
    }).select().single();

    if (error) {
      throw new Error(error.message);
    }

    res.json({ success: true, plan: planType, expiresAt: thirtyDaysFromNow });
  } catch (error) {
    console.error('[Payment] Verification error:', error);
    res.status(500).json({ success: false, error: 'Payment verification failed' });
  }
});

// ── Serve landing page at root ────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Start Server ──────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`[Security] Rate limiting: ACTIVE`);
  console.log(`[Security] Twilio webhook validation: ${process.env.TWILIO_AUTH_TOKEN ? 'ACTIVE' : 'DISABLED (no auth token)'}`);
  console.log(`[Security] JWT token verification: ACTIVE`);
});
