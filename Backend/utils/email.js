const nodemailer = require('nodemailer');

let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
  return transporter;
}

async function sendMail({ to, subject, html, text }) {
  if (!process.env.SMTP_HOST) return false;
  try {
    const info = await getTransporter().sendMail({
      from: process.env.FROM_EMAIL,
      to,
      subject,
      text,
      html
    });
    return info;
  } catch (e) {
    console.error('sendMail error', e);
    return false;
  }
}

module.exports = { sendMail };
