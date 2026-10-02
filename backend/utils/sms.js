// Sends the forgot-password PIN by SMS through any HTTP SMS gateway
// (Semaphore, Twilio-compatible proxies, etc.) — configure SMS_API_URL /
// SMS_API_KEY in backend/.env. Falls back to logging the PIN to the
// server console when unconfigured, so the flow still works in local dev.
async function sendPinSms(toPhone, pin) {
  const { SMS_API_URL, SMS_API_KEY, SMS_SENDER_NAME } = process.env;
  if (!SMS_API_URL || !SMS_API_KEY) {
    console.log(`[DEV SMS] RESCOM password reset PIN for ${toPhone}: ${pin}`);
    return { delivered: false, dev: true, pin };
  }
  try {
    const res = await fetch(SMS_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apikey: SMS_API_KEY,
        number: toPhone,
        sendername: SMS_SENDER_NAME || 'RESCOM',
        message: `Your RESCOM password reset PIN is ${pin}. It expires in 10 minutes.`
      })
    });
    if (!res.ok) throw new Error(`SMS gateway returned ${res.status}`);
    return { delivered: true, dev: false };
  } catch (err) {
    console.error('sendPinSms failed, falling back to console:', err.message);
    console.log(`[DEV SMS] RESCOM password reset PIN for ${toPhone}: ${pin}`);
    return { delivered: false, dev: true, pin, error: err.message };
  }
}

module.exports = { sendPinSms };
