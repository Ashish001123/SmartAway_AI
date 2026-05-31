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
      // Pick a random resolved IPv4 address to balance load
      host = ips[Math.floor(Math.random() * ips.length)];
      console.log("Resolved smtp.gmail.com to IPv4 for SMTP transport:", host);
    }
  } catch (err) {
    console.error("DNS IPv4 resolution for smtp.gmail.com failed, falling back to hostname:", err.message);
  }

  transporterInstance = nodemailer.createTransport({
    host,
    port: 465,
    secure: true,
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

/**
 * Send a styled welcome email to a newly registered user.
 * Fire-and-forget — errors are logged but don't crash the request.
 */
export const sendWelcomeEmail = async (to, fullName) => {
  try {
    const transporter = await getTransporter();
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
                    <a href="${process.env.NODE_ENV === "production" ? process.env.CLIENT_URL || "https://fullstack-chat-app-32t0.onrender.com" : "http://localhost:5173"}" 
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

    await transporter.sendMail({
      from: `"ChatApp" <${process.env.EMAIL_USER}>`,
      to,
      subject: "Welcome to ChatApp! 🎉 Your account is ready",
      html,
    });

    console.log(`Welcome email sent to ${to}`);
  } catch (error) {
    console.error("Error sending welcome email:", error.message);
    // Non-blocking — don't throw
  }
};

/**
 * Send a 6-digit OTP for password reset.
 * Fire-and-forget — errors are logged but don't crash the request.
 */
export const sendOTPEmail = async (to, otp) => {
  try {
    const transporter = await getTransporter();
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

    await transporter.sendMail({
      from: `"ChatApp" <${process.env.EMAIL_USER}>`,
      to,
      subject: "ChatApp — Your Password Reset Code",
      html,
    });

    console.log(`OTP email sent to ${to}`);
  } catch (error) {
    console.error("Error sending OTP email:", error.message);
    // Non-blocking — don't throw
  }
};

/**
 * Send a 6-digit OTP for email verification.
 * Fire-and-forget — errors are logged but don't crash the request.
 */
export const sendVerificationEmail = async (to, otp) => {
  try {
    const transporter = await getTransporter();
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

    await transporter.sendMail({
      from: `"ChatApp" <${process.env.EMAIL_USER?.trim()}>`,
      to,
      subject: "Verify your ChatApp account 💬",
      html,
    });

    console.log(`Verification email sent to ${to}`);
  } catch (error) {
    console.error("Error sending verification email:", error.message);
    // Non-blocking — don't throw
  }
};
