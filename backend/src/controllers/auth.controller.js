import { generateToken } from "../lib/utils.js";
import User from "../models/user.model.js";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import cloudinary from "../lib/cloudinary.js";
import { OAuth2Client } from "google-auth-library";
import { sendWelcomeEmail, sendOTPEmail, sendVerificationEmail } from "../lib/email.js";

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// ─── Helper: standard user response shape ────────────────────────────────────
const userResponse = (user) => ({
  _id: user._id,
  fullName: user.fullName,
  email: user.email,
  profilePic: user.profilePic,
  isBusy: user.isBusy,
  busyMessage: user.busyMessage,
  busyStart: user.busyStart,
  busyEnd: user.busyEnd,
  useAI: user.useAI,
});

// ─── SIGNUP (email/password) ─────────────────────────────────────────────────
export const signup = async (req, res) => {
  const { fullName, email, password } = req.body;
  try {
    if (!fullName || !email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    const user = await User.findOne({ email });

    if (user) return res.status(400).json({ message: "Email already exists" });

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Generate 6-digit OTP for email verification
    const otp = crypto.randomInt(100000, 999999).toString();
    const hashedOTP = await bcrypt.hash(otp, salt);

    const newUser = new User({
      fullName,
      email,
      password: hashedPassword,
      isVerified: false,
      verificationOTP: hashedOTP,
      verificationOTPExpiry: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
    });

    if (newUser) {
      await newUser.save();

      // Send verification email (fire-and-forget)
      sendVerificationEmail(email, otp);

      res.status(200).json({ verificationRequired: true, email });
    } else {
      res.status(400).json({ message: "Invalid user data" });
    }
  } catch (error) {
    console.log("Error in signup controller", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// ─── LOGIN (email/password) ─────────────────────────────────────────────────
export const login = async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    // Google-only users can't log in with email/password
    if (!user.password) {
      return res.status(400).json({ message: "This account uses Google sign-in. Please use the Google button." });
    }

    const isPasswordCorrect = await bcrypt.compare(password, user.password);
    if (!isPasswordCorrect) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    // Email verification check
    if (!user.isVerified) {
      const otp = crypto.randomInt(100000, 999999).toString();
      const salt = await bcrypt.genSalt(10);
      const hashedOTP = await bcrypt.hash(otp, salt);

      user.verificationOTP = hashedOTP;
      user.verificationOTPExpiry = new Date(Date.now() + 15 * 60 * 1000);
      await user.save();

      // Send verification email (fire-and-forget)
      sendVerificationEmail(email, otp);

      return res.status(403).json({
        message: "Please verify your email address. A verification code has been sent.",
        needsVerification: true,
        email,
      });
    }

    generateToken(user._id, res);

    res.status(200).json(userResponse(user));
  } catch (error) {
    console.log("Error in login controller", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// ─── GOOGLE AUTH ─────────────────────────────────────────────────────────────
export const googleAuth = async (req, res) => {
  try {
    const { credential } = req.body;

    if (!credential) {
      return res.status(400).json({ message: "Google credential is required" });
    }

    // Verify the Google ID token
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture, email_verified } = payload;

    if (!email_verified) {
      return res.status(401).json({ message: "Google email is not verified" });
    }

    // Check if user already exists by email
    let user = await User.findOne({ email });
    let isNewUser = false;

    if (user) {
      // Existing user — link googleId if not already linked
      let needsSave = false;
      const wasVerifiedBefore = user.isVerified;
      if (!user.googleId) {
        user.googleId = googleId;
        needsSave = true;
      }
      if (!user.isVerified) {
        user.isVerified = true;
        needsSave = true;
      }
      if (needsSave) {
        await user.save();
      }
      // If the user was not verified before and is now verified, trigger the welcome email
      if (!wasVerifiedBefore) {
        isNewUser = true;
      }
    } else {
      // New user — create account
      isNewUser = true;
      user = new User({
        email,
        fullName: name,
        profilePic: picture || "",
        googleId,
        authProvider: "google",
        isVerified: true,
        // No password for Google users
      });
      await user.save();
    }

    generateToken(user._id, res);

    // Send welcome email only for brand-new or newly-verified users
    if (isNewUser) {
      sendWelcomeEmail(email, name);
    }

    res.status(200).json(userResponse(user));
  } catch (error) {
    console.log("Error in googleAuth controller", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// ─── LOGOUT ──────────────────────────────────────────────────────────────────
export const logout = (req, res) => {
  try {
    res.cookie("jwt", "", { maxAge: 0 });
    res.status(200).json({ message: "Logged out successfully" });
  } catch (error) {
    console.log("Error in logout controller", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// ─── UPDATE PROFILE ─────────────────────────────────────────────────────────
export const updateProfile = async (req, res) => {
  try {
    const { profilePic } = req.body;
    const userId = req.user._id;

    if (!profilePic) {
      return res.status(400).json({ message: "Profile pic is required" });
    }

    const uploadResponse = await cloudinary.uploader.upload(profilePic);
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { profilePic: uploadResponse.secure_url },
      { new: true }
    );

    res.status(200).json(updatedUser);
  } catch (error) {
    console.log("error in update profile:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// ─── CHECK AUTH ──────────────────────────────────────────────────────────────
export const checkAuth = (req, res) => {
  try {
    res.status(200).json(req.user);
  } catch (error) {
    console.log("Error in checkAuth controller", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// ─── UPDATE BUSY SETTINGS ───────────────────────────────────────────────────
export const updateBusySettings = async (req, res) => {
  try {
    const { isBusy, busyMessage, busyStart, busyEnd, useAI } = req.body;
    const userId = req.user._id;

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        isBusy,
        busyMessage,
        busyStart: busyStart ? new Date(busyStart) : null,
        busyEnd: busyEnd ? new Date(busyEnd) : null,
        useAI,
      },
      { new: true }
    ).select("-password");

    res.status(200).json(updatedUser);
  } catch (error) {
    console.log("error in update busy settings:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// ─── E2EE: Upload this user's RSA public key ────────────────────────────────
export const updatePublicKey = async (req, res) => {
  try {
    const { publicKey } = req.body;
    if (!publicKey) {
      return res.status(400).json({ message: "publicKey is required" });
    }

    await User.findByIdAndUpdate(req.user._id, { publicKey });
    res.status(200).json({ success: true });
  } catch (error) {
    console.log("error in updatePublicKey:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// ─── E2EE: Fetch another user's RSA public key ──────────────────────────────
export const getUserPublicKey = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("publicKey");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.status(200).json({ publicKey: user.publicKey });
  } catch (error) {
    console.log("error in getUserPublicKey:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// ─── FORGOT PASSWORD ────────────────────────────────────────────────────────
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const user = await User.findOne({ email });

    // Always return success to prevent email enumeration
    if (!user) {
      return res.status(200).json({ message: "If an account exists, an OTP has been sent" });
    }

    // Google-only users can't reset password
    if (user.authProvider === "google" && !user.password) {
      return res.status(400).json({ message: "This account uses Google sign-in. Password reset is not available." });
    }

    // Generate 6-digit OTP
    const otp = crypto.randomInt(100000, 999999).toString();

    // Hash OTP before storing
    const salt = await bcrypt.genSalt(10);
    const hashedOTP = await bcrypt.hash(otp, salt);

    // Store hashed OTP with 15-minute expiry
    user.passwordResetOTP = hashedOTP;
    user.passwordResetOTPExpiry = new Date(Date.now() + 15 * 60 * 1000);
    await user.save();

    // Send OTP email (fire-and-forget)
    sendOTPEmail(email, otp);

    res.status(200).json({ message: "If an account exists, an OTP has been sent" });
  } catch (error) {
    console.log("Error in forgotPassword controller", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// ─── RESET PASSWORD ─────────────────────────────────────────────────────────
export const resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({ message: "Email, OTP, and new password are required" });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    // Check if OTP exists and is not expired
    if (!user.passwordResetOTP || !user.passwordResetOTPExpiry) {
      return res.status(400).json({ message: "No password reset was requested" });
    }

    if (user.passwordResetOTPExpiry < new Date()) {
      // Clear expired OTP
      user.passwordResetOTP = null;
      user.passwordResetOTPExpiry = null;
      await user.save();
      return res.status(400).json({ message: "OTP has expired. Please request a new one." });
    }

    // Verify OTP
    const isOTPValid = await bcrypt.compare(otp, user.passwordResetOTP);
    if (!isOTPValid) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    // Hash new password and save
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    user.password = hashedPassword;
    user.passwordResetOTP = null;
    user.passwordResetOTPExpiry = null;
    await user.save();

    res.status(200).json({ message: "Password reset successfully" });
  } catch (error) {
    console.log("Error in resetPassword controller", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// ─── VERIFY EMAIL ───────────────────────────────────────────────────────────
export const verifyEmail = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ message: "Email and OTP are required" });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({ message: "Invalid verification code or email" });
    }

    if (user.isVerified) {
      return res.status(400).json({ message: "Email is already verified" });
    }

    if (!user.verificationOTP || !user.verificationOTPExpiry) {
      return res.status(400).json({ message: "No verification request found. Please sign up or request a new code." });
    }

    if (user.verificationOTPExpiry < new Date()) {
      user.verificationOTP = null;
      user.verificationOTPExpiry = null;
      await user.save();
      return res.status(400).json({ message: "Verification code has expired. Please request a new one." });
    }

    const isOTPValid = await bcrypt.compare(otp, user.verificationOTP);
    if (!isOTPValid) {
      return res.status(400).json({ message: "Invalid verification code" });
    }

    user.isVerified = true;
    user.verificationOTP = null;
    user.verificationOTPExpiry = null;
    await user.save();

    // Log the user in by generating the JWT token
    generateToken(user._id, res);

    // Send the welcome email (fire-and-forget)
    sendWelcomeEmail(user.email, user.fullName);

    res.status(200).json(userResponse(user));
  } catch (error) {
    console.log("Error in verifyEmail controller", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// ─── RESEND VERIFICATION OTP ─────────────────────────────────────────────────
export const resendVerificationOTP = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.isVerified) {
      return res.status(400).json({ message: "Email is already verified" });
    }

    const otp = crypto.randomInt(100000, 999999).toString();
    const salt = await bcrypt.genSalt(10);
    const hashedOTP = await bcrypt.hash(otp, salt);

    user.verificationOTP = hashedOTP;
    user.verificationOTPExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
    await user.save();

    // Send verification email (fire-and-forget)
    sendVerificationEmail(email, otp);

    res.status(200).json({ message: "Verification code sent to your email" });
  } catch (error) {
    console.log("Error in resendVerificationOTP controller", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

