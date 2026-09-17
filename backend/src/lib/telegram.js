import crypto from "crypto";
import User from "../models/user.model.js";
import { getReceiverSocketId, io } from "./socket.js";
import { apiBaseUrl } from "./urls.js";

const LINK_CODE_TTL_MS = 10 * 60 * 1000;
const POLL_TIMEOUT_SECS = 25;

let botUsername = process.env.TELEGRAM_BOT_USERNAME || null;

export const isTelegramConfigured = () => Boolean(process.env.TELEGRAM_BOT_TOKEN);

const telegramApi = async (method, body = {}) => {
  const base = process.env.TELEGRAM_API_BASE || "https://api.telegram.org";
  const response = await fetch(`${base}/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!data.ok) throw new Error(`Telegram ${method} failed: ${data.description || response.status}`);
  return data.result;
};

// Telegram verifies webhook calls with this secret, derived from the bot token
export const telegramWebhookSecret = () =>
  crypto.createHash("sha256").update(`telegram-webhook:${process.env.TELEGRAM_BOT_TOKEN}`).digest("hex");

export const sendTelegramMessage = (chatId, text, buttonUrl) =>
  telegramApi("sendMessage", {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
    // Telegram rejects non-https button links, e.g. localhost in development
    ...(buttonUrl?.startsWith("https://") && {
      reply_markup: { inline_keyboard: [[{ text: "Open SmartWay AI", url: buttonUrl }]] },
    }),
  });

const getBotUsername = async () => {
  if (!botUsername) botUsername = (await telegramApi("getMe")).username;
  return botUsername;
};

export const createTelegramLink = async (user) => {
  const code = crypto.randomBytes(16).toString("hex");
  await User.updateOne(
    { _id: user._id },
    { $set: { telegramLinkCode: code, telegramLinkCodeExpiry: new Date(Date.now() + LINK_CODE_TTL_MS) } }
  );
  return `https://t.me/${await getBotUsername()}?start=${code}`;
};

const emitTelegramStatus = (userId, connected) => {
  const socketId = getReceiverSocketId(userId.toString());
  if (socketId) io.to(socketId).emit("telegramStatus", { connected });
};

export const unlinkTelegram = async (user) => {
  const chatId = user.telegramChatId;
  await User.updateOne({ _id: user._id }, { $set: { telegramChatId: null } });
  emitTelegramStatus(user._id, false);
  if (chatId) {
    sendTelegramMessage(chatId, "SmartWay AI alerts are now disconnected from this chat.").catch(() => {});
  }
};

export const handleTelegramUpdate = async (update) => {
  const message = update.message;
  if (!message?.text) return;
  const chatId = String(message.chat.id);
  const [command, code] = message.text.trim().split(/\s+/);

  if (command === "/start") {
    if (!code) {
      await sendTelegramMessage(chatId, "👋 To get alerts here, open SmartWay AI → Settings → Alerts and tap \"Connect Telegram\".");
      return;
    }
    // Claiming the code in one atomic update means it can only ever link one chat
    const user = await User.findOneAndUpdate(
      { telegramLinkCode: code, telegramLinkCodeExpiry: { $gt: new Date() } },
      { $set: { telegramChatId: chatId, telegramLinkCode: null, telegramLinkCodeExpiry: null } },
      { new: true }
    );
    if (!user) {
      await sendTelegramMessage(chatId, "That link has expired. Tap \"Connect Telegram\" in SmartWay AI settings to get a new one.");
      return;
    }
    emitTelegramStatus(user._id, true);
    await sendTelegramMessage(
      chatId,
      `✅ Connected, ${user.fullName.split(" ")[0]}! Your SmartWay AI assistant will alert you here.\nSend /stop to disconnect.`
    );
    return;
  }

  if (command === "/stop") {
    const user = await User.findOne({ telegramChatId: chatId });
    if (user) await unlinkTelegram(user);
  }
};

const pollUpdates = async () => {
  let offset = 0;
  for (;;) {
    try {
      const updates = await telegramApi("getUpdates", { offset, timeout: POLL_TIMEOUT_SECS });
      for (const update of updates) {
        offset = update.update_id + 1;
        await handleTelegramUpdate(update).catch((error) => console.error("Telegram update failed:", error));
      }
    } catch (error) {
      console.error("Telegram polling error:", error.message);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
};

// Production receives updates by webhook; local development (no public URL) polls instead
export const startTelegramBot = async () => {
  if (!isTelegramConfigured()) return;
  try {
    const baseUrl = apiBaseUrl();
    if (baseUrl.startsWith("https://")) {
      await telegramApi("setWebhook", {
        url: `${baseUrl}/api/telegram/webhook`,
        secret_token: telegramWebhookSecret(),
        allowed_updates: ["message"],
      });
      console.log("Telegram webhook registered");
    } else {
      await telegramApi("deleteWebhook");
      console.log("Telegram bot polling for updates");
      pollUpdates();
    }
  } catch (error) {
    console.error("Failed to start Telegram bot:", error.message);
  }
};
