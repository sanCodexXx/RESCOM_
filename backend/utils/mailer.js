// Sends the forgot-password PIN by email.
//
// Transport priority:
//   1) Brevo HTTPS API  (BREVO_API_KEY)  - works on hosts that block SMTP
//      ports, such as Render's free tier (it blocks 25/465/587).
//   2) SMTP / nodemailer (SMTP_HOST + SMTP_USER + SMTP_PASS) - works on a VM
//      or local machine (Gmail App Password, etc.).
//   3) Nothing configured -> the PIN is logged to the server console, and in
//      development only the route returns it to the UI. See auth.routes.js.
const nodemailer = require('nodemailer');

let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 465,
    secure: Number(process.env.SMTP_PORT) !== 587,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
  return transporter;
}

const subject = 'RESCOM password reset PIN';
const textBody = (pin) =>
  `Your RESCOM password reset PIN is ${pin}. It expires in 10 minutes. If you didn't request this, ignore this email.`;
const htmlBody = (pin) =>
  `<p>Your RESCOM password reset PIN is:</p><p style="font-size:28px;font-weight:700;letter-spacing:4px">${pin}</p><p>It expires in 10 minutes. If you didn't request this, ignore this email.</p>`;

async function sendViaBrevo(toEmail, pin) {
  const senderEmail = process.env.MAIL_FROM_EMAIL;
  if (!senderEmail) throw new Error('MAIL_FROM_EMAIL (a sender verified in Brevo) is not set');
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': process.env.BREVO_API_KEY,
      'Content-Type': 'application/json',
      accept: 'application/json'
    },
    body: JSON.stringify({
      sender: { name: process.env.MAIL_FROM_NAME || 'RESCOM', email: senderEmail },
      to: [{ email: toEmail }],
      subject,
      textContent: textBody(pin),
      htmlContent: htmlBody(pin)
    })
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Brevo API returned ${res.status} ${detail.slice(0, 200)}`);
  }
}

async function sendPinEmail(toEmail, pin) {
  // 1) Brevo over HTTPS
  if (process.env.BREVO_API_KEY) {
    try {
      await sendViaBrevo(toEmail, pin);
      return { delivered: true, dev: false };
    } catch (err) {
      console.error('sendPinEmail (Brevo) failed:', err.message);
      console.log(`[DEV EMAIL FALLBACK] RESCOM password reset PIN for ${toEmail}: ${pin}`);
      return { delivered: false, dev: true, pin, error: err.message };
    }
  }

  // 2) SMTP
  const t = getTransporter();
  if (!t) {
    console.log(`[DEV EMAIL] RESCOM password reset PIN for ${toEmail}: ${pin}`);
    return { delivered: false, dev: true, pin };
  }
  try {
    await t.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: toEmail,
      subject,
      text: textBody(pin),
      html: htmlBody(pin)
    });
    return { delivered: true, dev: false };
  } catch (err) {
    console.error('sendPinEmail (SMTP) failed:', err.message);
    console.log(`[DEV EMAIL FALLBACK] RESCOM password reset PIN for ${toEmail}: ${pin}`);
    return { delivered: false, dev: true, pin, error: err.message };
  }
}

module.exports = { sendPinEmail };
