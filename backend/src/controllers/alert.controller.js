import { deliverAlert } from "../lib/alerts.js";
import { getVapidPublicKey, isPushConfigured, removeSubscription, saveSubscription } from "../lib/push.js";
import {
  createTelegramLink,
  handleTelegramUpdate,
  isTelegramConfigured,
  telegramWebhookSecret,
  unlinkTelegram,
} from "../lib/telegram.js";

// Which optional integrations this server has credentials for
export const getIntegrations = (req, res) => {
  res.status(200).json({
    telegram: isTelegramConfigured(),
    push: isPushConfigured(),
    pushPublicKey: getVapidPublicKey(),
  });
};

export const sendTestAlert = async (req, res) => {
  try {
    await deliverAlert(req.user, {
      title: "🔔 Test alert from SmartWay AI",
      body: "Your alerts are working. You'll hear from your AI assistant here when someone needs you.",
      tag: "test-alert",
    });
    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error in sendTestAlert:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const linkTelegram = async (req, res) => {
  try {
    if (!isTelegramConfigured()) {
      return res.status(503).json({ message: "Telegram alerts aren't set up on this server" });
    }
    const url = await createTelegramLink(req.user);
    res.status(200).json({ url });
  } catch (error) {
    console.error("Error in linkTelegram:", error.message);
    res.status(500).json({ message: "Couldn't create a Telegram link" });
  }
};

export const disconnectTelegram = async (req, res) => {
  try {
    await unlinkTelegram(req.user);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error in disconnectTelegram:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const telegramWebhook = async (req, res) => {
  if (!isTelegramConfigured() || req.get("X-Telegram-Bot-Api-Secret-Token") !== telegramWebhookSecret()) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  try {
    await handleTelegramUpdate(req.body);
  } catch (error) {
    console.error("Error handling Telegram update:", error);
  }
  // Always acknowledge so Telegram doesn't retry the same update
  res.status(200).json({ ok: true });
};

export const subscribePush = async (req, res) => {
  try {
    if (!isPushConfigured()) {
      return res.status(503).json({ message: "Push notifications aren't set up on this server" });
    }
    const { endpoint, keys } = req.body.subscription || {};
    if (typeof endpoint !== "string" || !endpoint.startsWith("https://") || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ message: "Invalid push subscription" });
    }
    await saveSubscription(req.user._id, { endpoint, keys });
    res.status(201).json({ success: true });
  } catch (error) {
    console.error("Error in subscribePush:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const unsubscribePush = async (req, res) => {
  try {
    if (typeof req.body.endpoint !== "string") {
      return res.status(400).json({ message: "endpoint is required" });
    }
    await removeSubscription(req.user._id, req.body.endpoint);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error in unsubscribePush:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};
