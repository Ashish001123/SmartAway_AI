import User from "../models/user.model.js";
import Message from "../models/message.model.js";
import mongoose from "mongoose";
import axios from "axios";

import cloudinary from "../lib/cloudinary.js";
import { getReceiverSocketId, io } from "../lib/socket.js";

export const getUsersForSidebar = async (req, res) => {
  try {
    const loggedInUserId = req.user._id;

    const users = await User.find({
      _id: { $ne: loggedInUserId },
    }).select("-password");
    const unreadCounts = await Message.aggregate([
  {
    $match: {
      receiverId: loggedInUserId,
      isRead: false,
    },
  },
  {
    $group: {
      _id: "$senderId",
      count: { $sum: 1 },
    },
  },
]);
    const unreadMap = {};
    unreadCounts.forEach((u) => {
      unreadMap[u._id.toString()] = u.count;
    });

    const usersWithUnread = users.map((user) => ({
      ...user.toObject(),
      unreadCount: unreadMap[user._id.toString()] || 0,
    }));

    res.status(200).json(usersWithUnread);
  } catch (error) {
    console.error("Error in getUsersForSidebar:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getMessages = async (req, res) => {
  try {
    const myId = req.user._id.toString();
    const myObjectId = new mongoose.Types.ObjectId(req.user._id);
    const userToChatId = req.params.id.toString();

    const messages = await Message.find({
      $and: [
        {
          $or: [
            { senderId: myId, receiverId: userToChatId },
            { senderId: userToChatId, receiverId: myId },
          ],
        },
        {
          $or: [
            { deletedFor: { $exists: false } },
            { deletedFor: { $size: 0 } },
            { deletedFor: { $nin: [myObjectId] } },
          ],
        },
      ],
    }).sort({ createdAt: 1 });

    res.status(200).json(messages);
  } catch (error) {
    console.log("Error in getMessages:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

const isUserBusy = (user) => {
  if (!user) return false;
  if (!user.isBusy) return false; 
  if (user.busyStart && user.busyEnd) {
    const now = new Date();
    return now >= new Date(user.busyStart) && now <= new Date(user.busyEnd);
  }
  return true; 
};

const triggerAutoReply = async (senderId, receiverUser, incomingText) => {
  try {
    const receiverId = receiverUser._id.toString();
    const senderIdStr = senderId.toString();

    const lastAutoReply = await Message.findOne({
      senderId: receiverId,
      receiverId: senderIdStr,
      isAutoReply: true,
    }).sort({ createdAt: -1 });

    if (lastAutoReply) {
      const diffSecs = (new Date() - new Date(lastAutoReply.createdAt)) / 1000;
      if (diffSecs < 15) {
        console.log("Auto-reply skipped (duplicate within 15s)");
        return;
      }
    }

    const senderUser = await User.findById(senderIdStr);
    const senderName = senderUser ? senderUser.fullName : "User";
    const receiverName = receiverUser.fullName;

    let replyText = "";
    if (receiverUser.useAI) {
      try {
        
        const history = await Message.find({
          $or: [
            { senderId: senderIdStr, receiverId: receiverId },
            { senderId: receiverId, receiverId: senderIdStr },
          ],
        })
          .sort({ createdAt: -1 })
          .limit(20)
          .lean();

        const chatHistory = history.reverse().map(m => ({
          sender: m.senderId.toString() === senderIdStr ? senderName : receiverName + (m.isAutoReply ? " (AI)" : ""),
          text: m.text || "",
        }));

        let AI_URL = process.env.NODE_ENV === "production"
          ? (process.env.AI_URL_PROD ? process.env.AI_URL_PROD : "http://127.0.0.1:8000/busy-reply")
          : "http://127.0.0.1:8000/busy-reply";

        if (AI_URL && !AI_URL.startsWith("http")) {
          AI_URL = `https://${AI_URL}`;
        }
        if (AI_URL && !AI_URL.endsWith("/busy-reply")) {
          AI_URL = `${AI_URL.replace("/chat", "").replace(/\/$/, "")}/busy-reply`;
        }

        const response = await axios.post(AI_URL, {
          senderName,
          receiverName,
          messageText: incomingText,
          busyMessage: receiverUser.busyMessage || "I'm currently busy.",
          chatHistory
        });

        replyText = response.data?.result || (receiverUser.busyMessage || "I am currently busy. I will get back to you later.");
      } catch (err) {
        console.error("Failed to generate AI auto-reply, falling back to static:", err.message);
        replyText = receiverUser.busyMessage || "I am currently busy. I will get back to you later.";
      }
    } else {
      replyText = receiverUser.busyMessage || "I am currently busy. I will get back to you later.";
    }

    const autoReplyMessage = new Message({
      senderId: receiverId,
      receiverId: senderIdStr,
      text: replyText,
      isAutoReply: true,
      isRead: false,
    });

    await autoReplyMessage.save();

    const senderSocketId = getReceiverSocketId(senderIdStr);
    if (senderSocketId) {
      io.to(senderSocketId).emit("newMessage", autoReplyMessage);
    }

    const receiverSocketId = getReceiverSocketId(receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("newMessage", autoReplyMessage);
    }
  } catch (error) {
    console.error("Error in triggerAutoReply:", error);
  }
};

export const sendMessage = async (req, res) => {
  try {
    const { text, image } = req.body;
    const senderId = req.user._id.toString();
    const receiverId = req.params.id.toString();

    if (receiverId === "ai_assistant") {
      const aiMessage = new Message({
        senderId: "ai_assistant",
        receiverId: senderId,
        text: "Hello 👋 I'm your AI assistant",
        isRead: true,
      });

      await aiMessage.save();
      return res.status(201).json(aiMessage);
    }

    let imageUrl = null;
    if (image) {
      const upload = await cloudinary.uploader.upload(image);
      imageUrl = upload.secure_url;
    }

    const newMessage = new Message({
      senderId,
      receiverId,
      text: text || "",
      image: imageUrl,
      isRead: false,
    });

    await newMessage.save();

    const receiverSocketId = getReceiverSocketId(receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("newMessage", newMessage);
    }

    try {
      const receiver = await User.findById(receiverId);
      if (receiver && isUserBusy(receiver)) {
        
        triggerAutoReply(senderId, receiver, text || "");
      }
    } catch (err) {
      console.error("Error in busy check during sendMessage:", err);
    }

    res.status(201).json(newMessage);
  } catch (error) {
    console.log("Error in sendMessage:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const markMessagesAsRead = async (req, res) => {
  try {
    const myId = req.user._id.toString();
    const { id: senderId } = req.params;

    await Message.updateMany(
      {
        senderId,
        receiverId: myId,
        isRead: false,
      },
      { $set: { isRead: true } }
    );

    // Emit event to the sender so they get the blue tick!
    const senderSocketId = getReceiverSocketId(senderId);
    if (senderSocketId) {
      io.to(senderSocketId).emit("messagesRead", {
        senderId,
        receiverId: myId,
      });
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.log("markMessagesAsRead error:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const deleteChat = async (req, res) => {
  try {
    const myId = req.user._id.toString();
    const myObjectId = new mongoose.Types.ObjectId(req.user._id);
    const { id: otherUserId } = req.params;
    const otherUserIdStr = otherUserId.toString();

    const result = await Message.updateMany(
      {
        $or: [
          { senderId: myId, receiverId: otherUserIdStr },
          { senderId: otherUserIdStr, receiverId: myId },
        ],
      },
      {
        $addToSet: { deletedFor: myObjectId },
      }
    );

    console.log(`Delete chat: matched ${result.matchedCount}, modified ${result.modifiedCount}`);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Delete chat error:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const deleteMessage = async (req, res) => {
  try {
    const myId = req.user._id.toString();
    const myObjectId = new mongoose.Types.ObjectId(req.user._id);
    const { id: messageId } = req.params;

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ error: "Message not found" });
    }

    // Only sender or receiver can delete the message for themselves
    const senderId = message.senderId?.toString();
    const receiverId = message.receiverId?.toString();
    if (senderId !== myId && receiverId !== myId) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    await Message.findByIdAndUpdate(messageId, {
      $addToSet: { deletedFor: myObjectId },
    });

    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Delete message error:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const reactToMessage = async (req, res) => {
  try {
    const myId = req.user._id.toString();
    const { id: messageId } = req.params;
    const { emoji } = req.body;

    if (!emoji) {
      return res.status(400).json({ error: "Emoji is required" });
    }

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ error: "Message not found" });
    }

    const existingReactionIndex = message.reactions.findIndex(
      (r) => r.userId === myId
    );

    if (existingReactionIndex > -1) {
      if (message.reactions[existingReactionIndex].emoji === emoji) {
        // Toggle off if same emoji clicked again
        message.reactions.splice(existingReactionIndex, 1);
      } else {
        // Update emoji
        message.reactions[existingReactionIndex].emoji = emoji;
      }
    } else {
      // Add new reaction
      message.reactions.push({ userId: myId, emoji });
    }

    await message.save();

    // Emit socket event
    const otherUserId = message.senderId.toString() === myId ? message.receiverId.toString() : message.senderId.toString();
    
    const senderSocketId = getReceiverSocketId(myId);
    if (senderSocketId) {
      io.to(senderSocketId).emit("messageReaction", { messageId, reactions: message.reactions });
    }

    const receiverSocketId = getReceiverSocketId(otherUserId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("messageReaction", { messageId, reactions: message.reactions });
    }

    res.status(200).json(message.reactions);
  } catch (error) {
    console.error("React to message error:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};
