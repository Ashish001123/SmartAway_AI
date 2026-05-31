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
<body style="margin:0;padding:0;background-color:#0f0f1a;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#0f0f1a;padding:40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background-color:#1a1a2e;border-radius:16px;overflow:hidden;box-shadow:0 20px 60px rgba(124,58,237,0.15);">
          
          <!-- Header with gradient -->
          <tr>
            <td style="background:linear-gradient(135deg,#7c3aed 0%,#a855f7 50%,#7c3aed 100%);padding:40px 40px 30px;text-align:center;">
              <div style="font-size:36px;font-weight:800;color:#ffffff;letter-spacing:-1px;">
                💬 ChatApp
              </div>
              <div style="font-size:14px;color:rgba(255,255,255,0.8);margin-top:8px;letter-spacing:2px;text-transform:uppercase;">
                Connect • Chat • Share
              </div>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <h1 style="color:#ffffff;font-size:28px;margin:0 0 8px;font-weight:700;">
                Welcome aboard, ${fullName}! 🎉
              </h1>
              <p style="color:#a0a0b8;font-size:16px;line-height:1.7;margin:0 0 24px;">
                We're thrilled to have you join the ChatApp community. Your account is all set up and ready to go!
              </p>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:24px 0;">
                <tr>
                  <td style="background-color:#252540;border-radius:12px;padding:20px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td width="40" style="vertical-align:top;padding-right:12px;font-size:24px;">🚀</td>
                        <td>
                          <div style="color:#e0e0f0;font-weight:600;font-size:15px;">Real-time messaging</div>
                          <div style="color:#8888a8;font-size:13px;margin-top:4px;">Instant delivery with read receipts</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr><td style="height:8px;"></td></tr>
                <tr>
                  <td style="background-color:#252540;border-radius:12px;padding:20px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td width="40" style="vertical-align:top;padding-right:12px;font-size:24px;">📸</td>
                        <td>
                          <div style="color:#e0e0f0;font-weight:600;font-size:15px;">Share photos</div>
                          <div style="color:#8888a8;font-size:13px;margin-top:4px;">Send images and moments with friends</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr><td style="height:8px;"></td></tr>
                <tr>
                  <td style="background-color:#252540;border-radius:12px;padding:20px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td width="40" style="vertical-align:top;padding-right:12px;font-size:24px;">🟢</td>
                        <td>
                          <div style="color:#e0e0f0;font-weight:600;font-size:15px;">Online presence</div>
                          <div style="color:#8888a8;font-size:13px;margin-top:4px;">See who's online and available to chat</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:32px 0 16px;">
                <tr>
                  <td align="center">
                    <a href="${process.env.NODE_ENV === "production" ? process.env.CLIENT_URL || "https://smartaway-chat-app-zvpr.onrender.com" : "http://localhost:5173"}" 
                       style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#a855f7);color:#ffffff;text-decoration:none;padding:16px 48px;border-radius:12px;font-size:16px;font-weight:700;letter-spacing:0.5px;box-shadow:0 8px 24px rgba(124,58,237,0.4);">
                      Start Chatting →
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px;border-top:1px solid #252540;text-align:center;">
              <p style="color:#6b6b80;font-size:12px;margin:0;line-height:1.6;">
                You're receiving this email because you signed up at ChatApp.<br>
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
      subject: "Welcome to ChatApp! 🎉 Your account is ready",
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
