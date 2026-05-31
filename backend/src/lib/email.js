import nodemailer from "nodemailer";
import dns from "dns";

// Force Node to prefer IPv4 over IPv6 when resolving DNS globally.
dns.setDefaultResultOrder("ipv4first");

let transporterInstance = null;

const getTransporter = async () => {
  if (transporterInstance) return transporterInstance;

  let host = "smtp.gmail.com";
  try {
    const ips = await new Promise((resolve, reject) => {
      dns.resolve4("smtp.gmail.com", (err, addresses) => {
        if (err) reject(err);
        else resolve(addresses);
      });
    });
    if (ips && ips.length > 0) {
      host = ips[Math.floor(Math.random() * ips.length)];
      console.log("Resolved smtp.gmail.com to IPv4 for SMTP transport:", host);
    }
  } catch (err) {
    console.error("DNS IPv4 resolution for smtp.gmail.com failed, falling back to hostname:", err.message);
  }

  transporterInstance = nodemailer.createTransport({
    host,
    port: 587,
    secure: false, // Use STARTTLS on port 587
    auth: {
      user: process.env.EMAIL_USER?.trim(),
      pass: process.env.EMAIL_PASS?.trim(),
    },
    tls: {
      servername: "smtp.gmail.com", // Force SNI to match Google's SSL cert
    },
  });

  return transporterInstance;
};

// Helper: Send email via Brevo HTTP API (avoids SMTP port blocks on Render Free Tier)
const sendViaBrevo = async (to, subject, html) => {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  if (!apiKey) throw new Error("BREVO_API_KEY is not configured");

  // Brevo requires a verified sender email address registered in your Brevo account
  const senderEmail = process.env.EMAIL_USER?.trim() || "ashishkhatri006@gmail.com";

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "accept": "application/json",
      "api-key": apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sender: {
        name: "ChatApp",
        email: senderEmail,
      },
      to: [
        {
          email: to,
        },
      ],
      subject,
      htmlContent: html,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Brevo HTTP API returned status ${response.status}: ${errorText}`);
  }

  return await response.json();
};

// Helper: Send email via Resend HTTP API (avoids SMTP port blocks on Render Free Tier)
const sendViaResend = async (to, subject, html) => {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured");

  // Resend free tier default sending address
  const from = process.env.EMAIL_FROM || "onboarding@resend.dev";

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      html,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Resend HTTP API returned status ${response.status}: ${errorText}`);
  }

  return await response.json();
};

// Unified Wrapper: Tries Brevo first, then Resend, else falls back to SMTP
const sendMail = async ({ to, subject, html }) => {
  const brevoKey = process.env.BREVO_API_KEY?.trim();
  const resendKey = process.env.RESEND_API_KEY?.trim();

  if (brevoKey) {
    try {
      await sendViaBrevo(to, subject, html);
      console.log(`Email sent successfully via Brevo API to: ${to}`);
    } catch (error) {
      console.error(`Error sending email via Brevo API: ${error.message}`);
      throw error;
    }
  } else if (resendKey) {
    try {
      await sendViaResend(to, subject, html);
      console.log(`Email sent successfully via Resend API to: ${to}`);
    } catch (error) {
      console.error(`Error sending email via Resend API: ${error.message}`);
      throw error;
    }
  } else {
    try {
      const transporter = await getTransporter();
      await transporter.sendMail({
        from: `"ChatApp" <${process.env.EMAIL_USER?.trim()}>`,
        to,
        subject,
        html,
      });
      console.log(`Email sent successfully via SMTP to: ${to}`);
    } catch (error) {
      console.error(`Error sending email via SMTP: ${error.message}`);
      throw error;
    }
  }
};

/**
 * Send a styled welcome email to a newly registered user.
 */
export const sendWelcomeEmail = async (to, fullName) => {
  try {
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#0d0e15;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#0d0e15;padding:40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background-color:#161722;border-radius:20px;overflow:hidden;box-shadow:0 25px 50px -12px rgba(124,58,237,0.25);border:1px solid #232537;">
          
          <!-- Header with gradient -->
          <tr>
            <td style="background:linear-gradient(135deg,#6366f1 0%,#8b5cf6 50%,#d946ef 100%);padding:45px 40px 35px;text-align:center;">
              <div style="font-size:38px;font-weight:800;color:#ffffff;letter-spacing:-1px;">
                💬 SmartAway AI
              </div>
              <div style="font-size:13px;color:rgba(255,255,255,0.9);margin-top:10px;letter-spacing:3px;text-transform:uppercase;font-weight:600;">
                Secure Chat &bull; Smart AI Agent &bull; Auto-Reply
              </div>
            </td>
          </tr>

          <!-- Body Content -->
          <tr>
            <td style="padding:40px 40px 30px;">
              <h1 style="color:#ffffff;font-size:28px;margin:0 0 12px;font-weight:700;letter-spacing:-0.5px;">
                Welcome aboard, ${fullName}! 🎉
              </h1>
              <p style="color:#94a3b8;font-size:16px;line-height:1.7;margin:0 0 28px;">
                We're excited to have you join us! <strong>SmartAway AI</strong> is more than just a chat application—it is your personal communication assistant. Our built-in AI tools keep your chats moving even when you are busy.
              </p>

              <div style="color:#ffffff;font-size:18px;font-weight:700;margin-bottom:16px;letter-spacing:-0.3px;">
                Explore Core Features:
              </div>

              <!-- Feature 1: E2EE -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:16px;">
                <tr>
                  <td style="background-color:#1e2030;border-radius:14px;padding:18px;border:1px solid #2e3148;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td width="42" style="vertical-align:top;padding-right:14px;font-size:26px;">🔐</td>
                        <td>
                          <div style="color:#f1f5f9;font-weight:600;font-size:15px;margin-bottom:2px;">End-to-End Encryption</div>
                          <div style="color:#94a3b8;font-size:13px;line-height:1.5;">Your direct chats are private and secure, fully encrypted client-side using RSA/AES keys.</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Feature 2: AI Assistant -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:16px;">
                <tr>
                  <td style="background-color:#1e2030;border-radius:14px;padding:18px;border:1px solid #2e3148;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td width="42" style="vertical-align:top;padding-right:14px;font-size:26px;">🤖</td>
                        <td>
                          <div style="color:#f1f5f9;font-weight:600;font-size:15px;margin-bottom:2px;">Built-in AI Assistant</div>
                          <div style="color:#94a3b8;font-size:13px;line-height:1.5;">Click the AI Assistant in your sidebar to chat, brainstorm, ask questions, or write code in real-time.</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Feature 3: Auto-Reply AI Agent -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:16px;">
                <tr>
                  <td style="background-color:#1e2030;border-radius:14px;padding:18px;border:1px solid #2e3148;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td width="42" style="vertical-align:top;padding-right:14px;font-size:26px;">📅</td>
                        <td>
                          <div style="color:#a78bfa;font-weight:700;font-size:15px;margin-bottom:2px;">Auto-Reply AI Scheduler Agent</div>
                          <div style="color:#cbd5e1;font-size:13px;line-height:1.5;">When you toggle **Busy** in your Profile and enable **AI Auto-Reply**, our smart agent handles incoming messages using chat history context!</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Feature 4: Real-time Presence -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:28px;">
                <tr>
                  <td style="background-color:#1e2030;border-radius:14px;padding:18px;border:1px solid #2e3148;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td width="42" style="vertical-align:top;padding-right:14px;font-size:26px;">⚡</td>
                        <td>
                          <div style="color:#f1f5f9;font-weight:600;font-size:15px;margin-bottom:2px;">Real-time Presence & Sharing</div>
                          <div style="color:#94a3b8;font-size:13px;line-height:1.5;">Instantly see online status, typing indicators, and easily share images with your contacts.</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Quick start tip box -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:32px;">
                <tr>
                  <td style="background:linear-gradient(135deg,rgba(99,102,241,0.1),rgba(217,70,239,0.1));border:1px solid rgba(139,92,246,0.3);border-radius:14px;padding:20px;">
                    <div style="color:#a78bfa;font-weight:700;font-size:14px;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">💡 Try the AI Scheduler:</div>
                    <div style="color:#cbd5e1;font-size:13px;line-height:1.6;">
                      Head to your <strong>Profile settings</strong>, toggle your status to <strong>Busy</strong>, enter a busy reason, and switch <strong>Use AI Auto-Reply</strong> to <strong>ON</strong>. Have a friend send you a message—they'll get a response from your AI Agent!
                    </div>
                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:20px;margin-bottom:20px;">
                <tr>
                  <td align="center">
                    <a href="${process.env.NODE_ENV === "production" ? process.env.CLIENT_URL || "https://smartaway-chat-app-zvpr.onrender.com" : "http://localhost:5173"}" 
                       style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#ffffff;text-decoration:none;padding:16px 42px;border-radius:12px;font-size:16px;font-weight:700;letter-spacing:0.5px;box-shadow:0 10px 20px -5px rgba(99,102,241,0.5);">
                      Launch Chat Space &rarr;
                    </a>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:28px 40px;border-top:1px solid #232537;text-align:center;background-color:#12131c;">
              <p style="color:#64748b;font-size:12px;margin:0;line-height:1.6;">
                You're receiving this email because you signed up for an account on SmartAway AI.<br>
                &copy; ${new Date().getFullYear()} SmartAway AI. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    await sendMail({
      to,
      subject: "Welcome to SmartAway AI! 🚀 Your account is ready",
      html,
    });
  } catch (error) {
    console.error("Error sending welcome email:", error.message);
  }
};

/**
 * Send a 6-digit OTP for password reset.
 */
export const sendOTPEmail = async (to, otp) => {
  try {
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#0f0f1a;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#0f0f1a;padding:40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background-color:#1a1a2e;border-radius:16px;overflow:hidden;box-shadow:0 20px 60px rgba(124,58,237,0.15);">
          
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#7c3aed 0%,#a855f7 50%,#7c3aed 100%);padding:40px 40px 30px;text-align:center;">
              <div style="font-size:36px;font-weight:800;color:#ffffff;letter-spacing:-1px;">
                💬 ChatApp
              </div>
              <div style="font-size:14px;color:rgba(255,255,255,0.8);margin-top:8px;letter-spacing:2px;text-transform:uppercase;">
                Password Reset
              </div>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <h1 style="color:#ffffff;font-size:24px;margin:0 0 8px;font-weight:700;">
                Reset Your Password 🔐
              </h1>
              <p style="color:#a0a0b8;font-size:16px;line-height:1.7;margin:0 0 32px;">
                We received a request to reset your password. Use the verification code below to proceed. If you didn't request this, you can safely ignore this email.
              </p>

              <!-- OTP Code -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center">
                    <div style="background-color:#252540;border:2px solid #7c3aed;border-radius:16px;padding:24px 40px;display:inline-block;">
                      <div style="color:#8888a8;font-size:13px;text-transform:uppercase;letter-spacing:2px;margin-bottom:8px;">
                        Verification Code
                      </div>
                      <div style="color:#ffffff;font-size:40px;font-weight:800;letter-spacing:12px;font-family:'Courier New',monospace;">
                        ${otp}
                      </div>
                    </div>
                  </td>
                </tr>
              </table>

              <div style="margin-top:32px;background-color:#252540;border-radius:12px;padding:16px 20px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td width="24" style="vertical-align:top;padding-right:10px;color:#f59e0b;font-size:16px;">⏰</td>
                    <td>
                      <span style="color:#e0e0f0;font-size:14px;">This code expires in <strong style="color:#7c3aed;">15 minutes</strong></span>
                    </td>
                  </tr>
                </table>
              </div>

              <p style="color:#6b6b80;font-size:13px;margin-top:24px;line-height:1.6;">
                If you didn't request a password reset, please ignore this email or contact support if you have concerns about your account security.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px;border-top:1px solid #252540;text-align:center;">
              <p style="color:#6b6b80;font-size:12px;margin:0;line-height:1.6;">
                You're receiving this email because a password reset was requested for your ChatApp account.<br>
                © ${new Date().getFullYear()} ChatApp. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    await sendMail({
      to,
      subject: "ChatApp — Your Password Reset Code",
      html,
    });
  } catch (error) {
    console.error("Error sending OTP email:", error.message);
  }
};

/**
 * Send a 6-digit OTP for email verification.
 */
export const sendVerificationEmail = async (to, otp) => {
  try {
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#0f0f1a;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#0f0f1a;padding:40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background-color:#1a1a2e;border-radius:16px;overflow:hidden;box-shadow:0 20px 60px rgba(124,58,237,0.15);">
          
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#7c3aed 0%,#a855f7 50%,#7c3aed 100%);padding:40px 40px 30px;text-align:center;">
              <div style="font-size:36px;font-weight:800;color:#ffffff;letter-spacing:-1px;">
                💬 ChatApp
              </div>
              <div style="font-size:14px;color:rgba(255,255,255,0.8);margin-top:8px;letter-spacing:2px;text-transform:uppercase;">
                Email Verification
              </div>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <h1 style="color:#ffffff;font-size:24px;margin:0 0 8px;font-weight:700;">
                Verify Your Email Address ✉️
              </h1>
              <p style="color:#a0a0b8;font-size:16px;line-height:1.7;margin:0 0 32px;">
                Thank you for registering! Please use the verification code below to verify your email address and activate your account.
              </p>

              <!-- OTP Code -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center">
                    <div style="background-color:#252540;border:2px solid #7c3aed;border-radius:16px;padding:24px 40px;display:inline-block;">
                      <div style="color:#8888a8;font-size:13px;text-transform:uppercase;letter-spacing:2px;margin-bottom:8px;">
                        Verification Code
                      </div>
                      <div style="color:#ffffff;font-size:40px;font-weight:800;letter-spacing:12px;font-family:'Courier New',monospace;">
                        ${otp}
                      </div>
                    </div>
                  </td>
                </tr>
              </table>

              <div style="margin-top:32px;background-color:#252540;border-radius:12px;padding:16px 20px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td width="24" style="vertical-align:top;padding-right:10px;color:#f59e0b;font-size:16px;">⏰</td>
                    <td>
                      <span style="color:#e0e0f0;font-size:14px;">This code expires in <strong style="color:#7c3aed;">15 minutes</strong></span>
                    </td>
                  </tr>
                </table>
              </div>

              <p style="color:#6b6b80;font-size:13px;margin-top:24px;line-height:1.6;">
                If you did not request this code, you can safely ignore this email.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px;border-top:1px solid #252540;text-align:center;">
              <p style="color:#6b6b80;font-size:12px;margin:0;line-height:1.6;">
                You're receiving this email because you signed up for a ChatApp account.<br>
                © ${new Date().getFullYear()} ChatApp. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    await sendMail({
      to,
      subject: "Verify your ChatApp account 💬",
      html,
    });
  } catch (error) {
    console.error("Error sending verification email:", error.message);
  }
};

/**
 * Send an email notification for a new message received while offline.
 */
export const sendNewMessageEmail = async (to, receiverName, senderName, messagePreview) => {
  try {
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#0d0e15;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#0d0e15;padding:40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background-color:#161722;border-radius:20px;overflow:hidden;box-shadow:0 25px 50px -12px rgba(124,58,237,0.25);border:1px solid #232537;">
          
          <!-- Header with gradient -->
          <tr>
            <td style="background:linear-gradient(135deg,#6366f1 0%,#8b5cf6 50%,#d946ef 100%);padding:30px 40px;text-align:center;">
              <div style="font-size:24px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">
                💬 SmartAway AI Notification
              </div>
            </td>
          </tr>

          <!-- Body Content -->
          <tr>
            <td style="padding:40px 40px 30px;">
              <h2 style="color:#ffffff;font-size:20px;margin:0 0 16px;font-weight:700;letter-spacing:-0.3px;">
                New Message Received 📩
              </h2>
              <p style="color:#94a3b8;font-size:15px;line-height:1.6;margin:0 0 24px;">
                Hello ${receiverName},
              </p>
              <p style="color:#94a3b8;font-size:15px;line-height:1.6;margin:0 0 24px;">
                You received a new message from <strong style="color:#ffffff;">${senderName}</strong> while you were away:
              </p>

              <!-- Message preview block -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:32px;">
                <tr>
                  <td style="background-color:#1e2030;border-left:4px solid #8b5cf6;border-radius:4px 12px 12px 4px;padding:20px;border:1px solid #2e3148;">
                    <div style="color:#cbd5e1;font-size:15px;line-height:1.6;font-style:italic;">
                      "${messagePreview}"
                    </div>
                  </td>
                </tr>
              </table>

              <p style="color:#94a3b8;font-size:14px;line-height:1.6;margin:0 0 28px;">
                Log back in to reply and continue the conversation.
              </p>

              <!-- CTA Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:20px;margin-bottom:20px;">
                <tr>
                  <td align="center">
                    <a href="${process.env.NODE_ENV === "production" ? process.env.CLIENT_URL || "https://smartaway-chat-app-zvpr.onrender.com" : "http://localhost:5173"}" 
                       style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:12px;font-size:15px;font-weight:700;letter-spacing:0.5px;box-shadow:0 8px 16px -4px rgba(99,102,241,0.4);">
                      Open Chat Space &rarr;
                    </a>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px;border-top:1px solid #232537;text-align:center;background-color:#12131c;">
              <p style="color:#64748b;font-size:11px;margin:0;line-height:1.6;">
                You are receiving this email because you registered on SmartAway AI.<br>
                &copy; ${new Date().getFullYear()} SmartAway AI. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    await sendMail({
      to,
      subject: `New message on SmartAway AI from ${senderName} 📩`,
      html,
    });
  } catch (error) {
    console.error("Error sending message notification email:", error.message);
  }
};

