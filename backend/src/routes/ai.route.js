import express from "express";
import Message from "../models/message.model.js";
import User, { PUBLIC_USER_FIELDS } from "../models/user.model.js";
const router = express.Router();
import mongoose from "mongoose";
import { sendMessage as mainSendMessage } from "../controllers/message.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js"
import { callAIService } from "../lib/ai.js";

const AI_USER_ID = "ai_assistant";
const HISTORY_FOR_CONTEXT = 20;

const aiConversation = (userId) => ({
  $or: [
    { senderId: userId, receiverId: AI_USER_ID },
    { senderId: AI_USER_ID, receiverId: userId },
  ],
});

router.post("/", protectRoute, async (req, res) => {
  try {
    const message = req.body.text?.trim();
    if (!message) {
      return res.status(400).json({ error: "Message text is required" });
    }
    const userId = req.user._id.toString(); 

    const recent = await Message.find(aiConversation(userId))
      .sort({ createdAt: -1 })
      .limit(HISTORY_FOR_CONTEXT)
      .lean();

    const history = recent.reverse().filter((m) => m.text).map((m) => ({
      role: m.senderId === AI_USER_ID ? "assistant" : "user",
      content: m.text,
    }));

    let reply;
    try {
      const data = await callAIService("/chat", { message, userId, history });
      reply = data?.result;
      if (!reply) throw new Error("empty reply");
    } catch (error) {
      // Log the real cause server-side; don't store a failed exchange in the chat history
      console.error("AI assistant request failed:", error.message);
      return res.status(502).json({ error: "The AI assistant is unavailable right now. Please try again in a moment." });
    }

    await Message.create({
      senderId: userId,
      receiverId: AI_USER_ID,
      text: message,
    });

    await Message.create({
      senderId: AI_USER_ID,
      receiverId: userId,
      text: reply,
    });

    res.json({ reply });

  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "AI failed" });
  }
});

router.get("/history", protectRoute, async (req, res) => {
  try {
    const messages = await Message.find(aiConversation(req.user._id.toString()))
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    res.json(messages.reverse().map((m) => ({
      role: m.senderId === AI_USER_ID ? "assistant" : "user",
      content: m.text,
      createdAt: m.createdAt,
    })));
  } catch (e) {
    console.error("AI history error", e);
    res.status(500).json({ error: "failed" });
  }
});

router.delete("/history", protectRoute, async (req, res) => {
  try {
    await Message.deleteMany(aiConversation(req.user._id.toString()));
    res.json({ success: true });
  } catch (e) {
    console.error("AI history delete error", e);
    res.status(500).json({ error: "failed" });
  }
});

router.get("/user", protectRoute, async (req, res) => {
  try {
    const users = await User.find().select(PUBLIC_USER_FIELDS);
    res.json(users);
  } catch (e) {
    console.error("AI users error", e);
    res.status(500).json({ error: "failed" });
  }
});

router.get("/online", protectRoute, async (req, res) => {
  try {
    const onlineUsers = await User.find({ isOnline: true }).select(PUBLIC_USER_FIELDS);
    res.json(onlineUsers);
  } catch (e) {
    console.error("AI online users error", e);
    res.status(500).json({ error: "failed" });
  }
});

router.post("/send", protectRoute, async (req, res) => {
  try {
    const { toUserId, text } = req.body;
    if (!mongoose.isValidObjectId(toUserId)) {
      return res.status(400).json({ error: "Invalid receiver" });
    }

    // Always send as the logged-in user, never as a sender named in the request body
    const sendReq = {
      user: req.user,
      params: { id: toUserId },
      body: { text },
    };

    await mainSendMessage(sendReq, res);
  } catch (e) {
    console.error("AI send error", e);
    res.status(500).json({ error: "send failed" });
  }
});

router.get("/search", protectRoute, async (req, res) => {
  try {
    // Escape user input so it's matched literally, not run as a regex
    const q = String(req.query.q || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const users = await User.find({
      fullName: { $regex: q, $options: "i" },
    }).select("_id fullName");

    res.json(users);
  } catch (e) {
    console.error("AI search error", e);
    res.status(500).json({ error: "failed" });
  }
});

export default router;
