import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
    },
    fullName: {
      type: String,
      required: true,
    },
    password: {
      type: String,
      minlength: 6,
      // Not required — Google OAuth users won't have a password
    },
    profilePic: {
      type: String,
      default: "",
    },
    isBusy: {
      type: Boolean,
      default: false,
    },
    busyMessage: {
      type: String,
      default: "",
    },
    busyStart: {
      type: Date,
      default: null,
    },
    busyEnd: {
      type: Date,
      default: null,
    },
    useAI: {
      type: Boolean,
      default: true,
    },
    publicKey: {
      type: String,
      default: null,
    },
    // Google OAuth fields
    googleId: {
      type: String,
      default: null,
      sparse: true,
    },
    authProvider: {
      type: String,
      enum: ["local", "google"],
      default: "local",
    },
    // Forgot password OTP fields
    passwordResetOTP: {
      type: String,
      default: null,
    },
    passwordResetOTPExpiry: {
      type: Date,
      default: null,
    },
    // Email verification fields
    isVerified: {
      type: Boolean,
      default: false,
    },
    verificationOTP: {
      type: String,
      default: null,
    },
    verificationOTPExpiry: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// Sparse unique index on googleId (only indexes non-null values)
userSchema.index({ googleId: 1 }, { unique: true, sparse: true });

const User = mongoose.model("User", userSchema);

export default User;
