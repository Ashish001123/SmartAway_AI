

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
    image: String,
    isRead: { type: Boolean, default: false },
    isAutoReply: { type: Boolean, default: false },

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