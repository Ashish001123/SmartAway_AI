import mongoose from "mongoose";

// Raised when someone asks a busy user's AI assistant to notify them
const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    fromUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type: {
      type: String,
      enum: ["notify_request", "callback_booked", "callback_cancelled", "callback_reminder"],
      default: "notify_request",
    },
    callbackId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Callback",
    },
    summary: {
      type: String,
      default: "",
    },
    urgency: {
      type: String,
      enum: ["normal", "urgent"],
      default: "normal",
    },
    isRead: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

const Notification = mongoose.model("Notification", notificationSchema);

export default Notification;
