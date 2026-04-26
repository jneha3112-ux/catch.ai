require('dotenv').config();
const twilio = require('twilio');
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

(async () => {
  console.log('--- Twilio Account Info ---');
  
  // Check account type
  const account = await client.api.accounts(process.env.TWILIO_ACCOUNT_SID).fetch();
  console.log('Account Status:', account.status);
  console.log('Account Type:', account.type);

  // Check verified numbers
  console.log('\n--- Verified Caller IDs ---');
  const verified = await client.validationRequests.create ? [] : [];
  const outgoing = await client.outgoingCallerIds.list();
  outgoing.forEach(n => console.log(' Verified:', n.phoneNumber));

  // Check Twilio number webhook
  console.log('\n--- Your Twilio Number Config ---');
  const numbers = await client.incomingPhoneNumbers.list({ limit: 5 });
  numbers.forEach(n => {
    console.log(`Number: ${n.phoneNumber}`);
    console.log(`Voice URL: ${n.voiceUrl}`);
    console.log(`Voice Method: ${n.voiceMethod}`);
    console.log(`Status: ${n.status}`);
  });
})();
