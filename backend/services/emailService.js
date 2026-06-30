const nodemailer = require("nodemailer");

/*
 Builds a transporter from env vars. Uses the recruiter's own email account
 (e.g. Gmail with an App Password) as required by the assignment constraints.
 Required env vars:
   SMTP_HOST (e.g. smtp.gmail.com)
   SMTP_PORT (e.g. 587)
   SMTP_USER (your email)
   SMTP_PASS (app password, NOT your normal password)
 */
function buildTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: parseInt(process.env.SMTP_PORT || "587", 10),
    secure: process.env.SMTP_PORT === "465",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

async function sendTestLinkEmail({ to, name, testLink, jobTitle }) {
  const transporter = buildTransporter();
  const fromName = process.env.SMTP_FROM_NAME || "Recruitment Team";

  const html = `
    <p>Hi ${name},</p>
    <p>Thank you for applying for the <strong>${jobTitle || "open"}</strong> role. Based on our initial
    screening, we'd like to invite you to take the next step.</p>
    <p>Please complete your assessment using the link below:</p>
    <p><a href="${testLink}" target="_blank">${testLink}</a></p>
    <p>Best of luck!</p>
    <p>${fromName}</p>
  `;

  const info = await transporter.sendMail({
    from: `"${fromName}" <${process.env.SMTP_USER}>`,
    to,
    subject: `Next Step: Assessment Link for ${jobTitle || "your application"}`,
    html,
  });

  return info;
}

async function sendInterviewInviteEmail({ to, name, meetLink, scheduledAt, jobTitle }) {
  const transporter = buildTransporter();
  const fromName = process.env.SMTP_FROM_NAME || "Recruitment Team";
  const formattedTime = new Date(scheduledAt).toLocaleString("en-IN", {
    dateStyle: "full",
    timeStyle: "short",
  });

  const html = `
    <p>Hi ${name},</p>
    <p>Congratulations! You've been shortlisted for an interview for the <strong>${jobTitle || "role"}</strong>.</p>
    <p><strong>Date & Time:</strong> ${formattedTime}</p>
    <p><strong>Google Meet link:</strong> <a href="${meetLink}" target="_blank">${meetLink}</a></p>
    <p>We've also sent a calendar invite to this email address.</p>
    <p>Looking forward to speaking with you!</p>
    <p>${fromName}</p>
  `;

  const info = await transporter.sendMail({
    from: `"${fromName}" <${process.env.SMTP_USER}>`,
    to,
    subject: `Interview Invitation: ${jobTitle || "Your Application"}`,
    html,
  });

  return info;
}

module.exports = { sendTestLinkEmail, sendInterviewInviteEmail };
