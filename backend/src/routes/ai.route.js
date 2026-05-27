import express from "express";
import axios from "axios";
import Message from "../models/message.model.js";
import User from "../models/user.model.js";
const router = express.Router();
import mongoose from "mongoose";
import { sendMessage as mainSendMessage } from "../controllers/message.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js"

router.post("/", protectRoute, async (req, res) => {
  try {
    const { text } = req.body;
    const userId = req.user._id.toString(); 

    const message = text;

    const history = await Message.find({
      $or: [
        { senderId: userId, receiverId: "ai_assistant" },
        { senderId: "ai_assistant", receiverId: userId },
      ],
    })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    const messages = history.reverse().map((m) => ({
      role: m.senderId === "ai_assistant" ? "assistant" : "user",
      content: m.text,
    }));

    messages.push({ role: "user", content: message });

    let AI_URL =
      process.env.NODE_ENV === "production"
        ? process.env.AI_URL_PROD
        : process.env.AI_URL;

    if (AI_URL && !AI_URL.startsWith("http")) {
      AI_URL = `https://${AI_URL}`;
    }
    if (AI_URL && !AI_URL.endsWith("/chat")) {
      AI_URL = `${AI_URL.replace(/\/$/, "")}/chat`;
    }

    const aiRes = await axios.post(AI_URL, {
      message : message,
      userId: userId, 
    });
    console.log("✅ AI RESPONSE:", aiRes.data);

    const reply = aiRes.data.result;

    await Message.create({
      senderId: userId,
      receiverId: "ai_assistant",
      text: message,
    });

    await Message.create({
      senderId: "ai_assistant",
      receiverId: userId,
      text: reply,
    });

    res.json({ reply });

  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "AI failed" });
  }
});

router.get("/user", async (req, res) => {
  try {
    const users = await User.find().select("-password");
    res.json(users);
  } catch (e) {
    console.error("AI users error", e);
    res.status(500).json({ error: "failed" });
  }
});

router.get("/online", async (req, res) => {
  try {
    const onlineUsers = await User.find({ isOnline: true }).select("-password");
    res.json(onlineUsers);
  } catch (e) {
    console.error("AI online users error", e);
    res.status(500).json({ error: "failed" });
  }
});

router.post("/send", async (req, res) => {
  try {
    const { toUserId, text, fromUserId } = req.body;

    const fakeReq = {
      user: { _id: new mongoose.Types.ObjectId(fromUserId) },
      params: { id: new mongoose.Types.ObjectId(toUserId) },
      body: { text },
    };

    const fakeRes = {
      status: (code) => ({
        json: (data) => res.status(code).json(data),
      }),
    };

    await mainSendMessage(fakeReq, fakeRes);
  } catch (e) {
    console.error("AI send error", e);
    res.status(500).json({ error: "send failed" });
  }
});

router.get("/search", async (req, res) => {
  const q = req.query.q;

  const users = await User.find({
    fullName: { $regex: q, $options: "i" },
  }).select("_id fullName");

  res.json(users);
});

export default router;
