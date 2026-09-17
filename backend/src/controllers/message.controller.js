import User, { PUBLIC_USER_FIELDS } from "../models/user.model.js";
import Message from "../models/message.model.js";
import mongoose from "mongoose";

import cloudinary from "../lib/cloudinary.js";
import { getReceiverSocketId, io } from "../lib/socket.js";
import { sendNewMessageEmail } from "../lib/email.js";
import { decryptText } from "../lib/e2ee.js";
import { handleMessageToBusyUser, requestNotificationFromSender } from "../lib/busyAgent.js";
import { isUserBusy } from "../lib/availability.js";
import { ensureCalendarFresh, isCalendarConnected, nextCalendarBlock } from "../lib/calendar.js";

export const getUsersForSidebar = async (req, res) => {
  try {
    const loggedInUserId = req.user._id;

    const users = await User.find({
      _id: { $ne: loggedInUserId },
    }).select(`${PUBLIC_USER_FIELDS} googleCalendar.refreshToken googleCalendar.autoBusy googleCalendar.events`);
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

    const usersWithUnread = users.map((user) => {
      // Share only when a calendar makes the contact busy, never event titles or tokens
      const { googleCalendar, ...publicFields } = user.toObject();
      const block = nextCalendarBlock(user);
      return {
        ...publicFields,
        calendarBusyFrom: block?.start || null,
        calendarBusyUntil: block?.end || null,
        unreadCount: unreadMap[user._id.toString()] || 0,
      };
    });

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

const MAX_AGENT_TEXT_LENGTH = 5000;

export const sendMessage = async (req, res) => {
  try {
    const { text, image, encryptedText, encryptedTextForSender, encVersion, encKeys, agentText } = req.body;
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

    if (!mongoose.isValidObjectId(receiverId)) {
      return res.status(400).json({ message: "Invalid receiver" });
    }
    const receiver = await User.findById(receiverId);
    if (!receiver) {
      return res.status(404).json({ message: "User not found" });
    }

    const isV2 = encVersion === 2;
    if (isV2) {
      if (!encryptedText || typeof encKeys?.sender !== "string" || typeof encKeys?.receiver !== "string") {
        return res.status(400).json({ message: "Invalid encrypted message" });
      }
      // Encrypting to an outdated key would make the message unreadable for the receiver
      if (encKeys.sender !== req.user.publicKey || encKeys.receiver !== receiver.publicKey) {
        return res.status(409).json({
          code: "STALE_PUBLIC_KEY",
          message: "Encryption keys changed. Please try again.",
          receiverPublicKey: receiver.publicKey,
        });
      }
    }

    // Calendar-driven busy is re-checked after a fresh sync inside the agent
    const calendarMayBeBusy = isCalendarConnected(receiver) && receiver.googleCalendar.autoBusy;
    const receiverMayBeBusy = isUserBusy(receiver) || calendarMayBeBusy;
    // Only keep a readable copy when the receiver's assistant may actually need it
    const sharedWithAgent =
      receiverMayBeBusy && typeof agentText === "string" && agentText.trim()
        ? agentText.slice(0, MAX_AGENT_TEXT_LENGTH)
        : undefined;

    let imageUrl = null;
    if (image) {
      const upload = await cloudinary.uploader.upload(image);
      imageUrl = upload.secure_url;
    }

    const newMessage = new Message({
      senderId,
      receiverId,
      // If client sent encrypted ciphertexts, store them and leave text empty
      text: encryptedText ? "" : (text || ""),
      encryptedText: encryptedText || null,
      encryptedTextForSender: encryptedTextForSender || null,
      encVersion: isV2 ? 2 : undefined,
      encKeys: isV2 ? { sender: encKeys.sender, receiver: encKeys.receiver } : undefined,
      agentText: sharedWithAgent,
      image: imageUrl,
      isRead: false,
    });

    await newMessage.save();

    const receiverSocketId = getReceiverSocketId(receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("newMessage", newMessage);
    } else {
      // Receiver is offline! Send email notification asynchronously
      (async () => {
        try {
          if (receiver.email) {
            // Count unread messages from this sender to receiver to prevent notification spam
            const unreadCount = await Message.countDocuments({
              senderId,
              receiverId,
              isRead: false,
            });
            // Send the notification email only for the first unread message in this offline session
            if (unreadCount === 1) {
              let preview = "Sent a secure encrypted message (open the app to decrypt)";
              if (image) {
                preview = "Sent an image 🖼️";
              } else if (encryptedText && !isV2) {
                const decrypted = decryptText(encryptedText, senderId, receiverId);
                if (decrypted) {
                  preview = decrypted.length > 100 ? `${decrypted.substring(0, 100)}...` : decrypted;
                }
              } else if (text && !encryptedText) {
                preview = text.length > 100 ? `${text.substring(0, 100)}...` : text;
              }
              const senderName = req.user.fullName || "A user";
              sendNewMessageEmail(receiver.email, receiver.fullName, senderName, preview);
            }
          }
        } catch (emailErr) {
          console.error("Error triggering offline message email notification:", emailErr);
        }
      })();
    }

    if (receiverMayBeBusy) {
      handleMessageToBusyUser(receiverId, senderId);
    }

    res.status(201).json(newMessage);
  } catch (error) {
    console.log("Error in sendMessage:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// The sender asks a busy user's AI assistant to notify them
export const requestOwnerNotification = async (req, res) => {
  try {
    const { id: ownerId } = req.params;

    if (!mongoose.isValidObjectId(ownerId) || ownerId === req.user._id.toString()) {
      return res.status(400).json({ message: "Invalid user" });
    }

    const owner = await User.findById(ownerId);
    if (!owner) {
      return res.status(404).json({ message: "User not found" });
    }
    await ensureCalendarFresh(owner);
    if (!isUserBusy(owner)) {
      return res.status(409).json({ message: `${owner.fullName} is available now, just send them a message.` });
    }

    const result = await requestNotificationFromSender(req.user, owner);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error in requestOwnerNotification:", error.message);
    res.status(500).json({ message: "Internal server error" });
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
