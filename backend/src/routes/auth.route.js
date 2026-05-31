import express from "express";
import {
  checkAuth,
  login,
  logout,
  signup,
  updateProfile,
  updateBusySettings,
  updatePublicKey,
  getUserPublicKey,
  googleAuth,
  forgotPassword,
  resetPassword,
  verifyEmail,
  resendVerificationOTP,
} from "../controllers/auth.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

router.post("/signup", signup);
router.post("/login", login);
router.post("/logout", logout);

// Google OAuth
router.post("/google", googleAuth);

// Email verification
router.post("/verify-email", verifyEmail);
router.post("/resend-verification", resendVerificationOTP);

// Forgot / Reset password
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

router.put("/update-profile", protectRoute, updateProfile);
router.put("/busy-settings", protectRoute, updateBusySettings);

router.get("/check", protectRoute, checkAuth);

// E2EE key management
router.put("/public-key", protectRoute, updatePublicKey);
router.get("/public-key/:id", protectRoute, getUserPublicKey);

export default router;
