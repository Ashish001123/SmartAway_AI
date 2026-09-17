

import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    senderId: {
      type: mongoose.Schema.Types.Mixed, 
      required: true,
    },
    receiverId: {
      type: mongoose.Schema.Types.Mixed, 
      required: true,
    },
    text: String,
    encryptedText: String,          // ciphertext encrypted with receiver's public key
    encryptedTextForSender: String, // ciphertext encrypted with sender's public key (so sender can re-read)
    image: String,
    // 2 = encrypted with the two users' ECDH keys; missing = legacy encryption or plaintext
    encVersion: Number,
    // The public keys used, so either side can still decrypt after the other resets keys
    encKeys: {
      sender: String,
      receiver: String,
    },
    // Plaintext copy shared with the receiver's AI assistant because they were busy
    agentText: String,
    isRead: { type: Boolean, default: false },
    isAutoReply: { type: Boolean, default: false },
    ownerNotified: { type: Boolean, default: false }, // auto-reply that notified the busy owner
    // Free times the busy agent offered for a callback
    callbackSlots: {
      type: [{ _id: false, start: Date, end: Date }],
      default: undefined,
    },
    callbackId: { type: mongoose.Schema.Types.ObjectId, ref: "Callback" }, // message about a booked callback

    deletedFor: {
      type: [mongoose.Schema.Types.ObjectId], 
      default: [],
    },
    reactions: [
      {
        userId: { type: String, required: true },
        emoji: { type: String, required: true },
      },
    ],
  },
  { timestamps: true }
);

const Message =
  mongoose.models.Message ||
  mongoose.model("Message", messageSchema);

export default Message;