require('dotenv').config();
const twilio = require('twilio');
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

(async () => {
  console.log('--- Last 5 Twilio Call Logs ---');
  const calls = await client.calls.list({ limit: 5 });
  
  if (calls.length === 0) {
    console.log('No calls found. Twilio never received the call.');
    return;
  }

  calls.forEach(call => {
    console.log(`\nFrom: ${call.from}`);
    console.log(`To: ${call.to}`);
    console.log(`Status: ${call.status}`);
    console.log(`Duration: ${call.duration}s`);
    console.log(`Direction: ${call.direction}`);
    console.log(`Time: ${call.startTime}`);
  });
})();
