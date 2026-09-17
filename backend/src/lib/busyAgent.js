import User from "../models/user.model.js";
import Message from "../models/message.model.js";
import Notification from "../models/notification.model.js";
import { getReceiverSocketId, io } from "./socket.js";
import { callAIService } from "./ai.js";
import { decryptText } from "./e2ee.js";
import { sendOwnerNotificationEmail } from "./email.js";

const HISTORY_LIMIT = 20;
// The agent re-introduces itself if it hasn't replied in this conversation for this long
const SESSION_GAP_MS = 6 * 60 * 60 * 1000;
const STATIC_REPLY_COOLDOWN_MS = 5 * 60 * 1000;
const NOTIFY_COOLDOWN_MS = 10 * 60 * 1000;
const SUMMARY_MAX_LENGTH = 280;

export const isUserBusy = (user, now = new Date()) => {
  if (!user?.isBusy) return false;
  if (user.busyStart && now < new Date(user.busyStart)) return false;
  if (user.busyEnd && now > new Date(user.busyEnd)) return false;
  return true;
};

const describeTimeLeft = (busyEnd) => {
  if (!busyEnd) return null;
  const minutes = Math.round((new Date(busyEnd) - Date.now()) / 60000);
  if (minutes <= 1) return "any moment now";
  if (minutes < 60) return `in about ${minutes} minutes`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rest = minutes % 60;
    const hoursText = `${hours} hour${hours === 1 ? "" : "s"}`;
    return rest >= 10 ? `in about ${hoursText} ${rest} minutes` : `in about ${hoursText}`;
  }
  const days = Math.round(hours / 24);
  return `in about ${days} day${days === 1 ? "" : "s"}`;
};

const firstName = (user) => user.fullName.split(" ")[0];

const messageText = (message) => {
  if (message.encryptedText) {
    return decryptText(message.encryptedText, message.senderId, message.receiverId);
  }
  return message.text || (message.image ? "[sent an image]" : "");
};

const truncate = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

const emitTo = (userId, event, payload) => {
  const socketId = getReceiverSocketId(userId);
  if (socketId) io.to(socketId).emit(event, payload);
};

const getConversation = async (ownerId, senderId) => {
  const recent = await Message.find({
    $or: [
      { senderId, receiverId: ownerId },
      { senderId: ownerId, receiverId: senderId },
    ],
  })
    .sort({ createdAt: -1 })
    .limit(HISTORY_LIMIT)
    .lean();
  return recent.reverse();
};

// Messages after the owner's last message still need an answer. So do ones that arrived while a
// reply was being generated: they sort before that reply but are newer than `answeredUpTo`.
const splitConversation = (history, ownerId, answeredUpTo) => {
  const isOwner = (m) => m.senderId.toString() === ownerId;
  const lastOwnerIndex = history.findLastIndex(isOwner);
  const unanswered = history.filter(
    (m, i) => !isOwner(m) && (i > lastOwnerIndex || (answeredUpTo && m.createdAt > answeredUpTo))
  );
  return {
    lastOwnerMessage: history[lastOwnerIndex],
    earlier: history.filter((m) => !unanswered.includes(m)),
    unanswered,
  };
};

const postAutoReply = async ({ owner, senderId, text, ownerNotified = false }) => {
  const ownerId = owner._id.toString();
  const message = await Message.create({
    senderId: ownerId,
    receiverId: senderId,
    text,
    isAutoReply: true,
    ownerNotified,
    isRead: false,
  });
  emitTo(senderId, "newMessage", message);
  emitTo(ownerId, "newMessage", message);
  return message;
};

const setAgentTyping = (ownerId, senderId, isTyping) => {
  emitTo(senderId, "agentTyping", { chatWith: ownerId, ownerId, isTyping });
  emitTo(ownerId, "agentTyping", { chatWith: senderId, ownerId, isTyping });
};

const findRecentNotification = (owner, requester) =>
  Notification.findOne({
    userId: owner._id,
    fromUserId: requester._id,
    createdAt: { $gte: new Date(Date.now() - NOTIFY_COOLDOWN_MS) },
  }).sort({ createdAt: -1 });

export const notifyOwner = async ({ owner, requester, summary, urgency = "normal" }) => {
  const recent = await findRecentNotification(owner, requester);
  // Avoid spamming the owner; only an escalation to urgent gets through the cooldown
  if (recent && !(urgency === "urgent" && recent.urgency !== "urgent")) {
    return { alreadyNotified: true };
  }

  const notification = await Notification.create({
    userId: owner._id,
    fromUserId: requester._id,
    summary: truncate(summary, SUMMARY_MAX_LENGTH),
    urgency,
  });

  emitTo(owner._id.toString(), "ownerNotification", {
    ...notification.toObject(),
    fromUserId: {
      _id: requester._id,
      fullName: requester.fullName,
      profilePic: requester.profilePic,
    },
  });

  if (owner.email) {
    sendOwnerNotificationEmail(owner.email, owner.fullName, requester.fullName, notification.summary, urgency);
  }

  return { alreadyNotified: false };
};

const fallbackReply = (owner, sender, timeLeft) => {
  const when = timeLeft ? ` They should be free ${timeLeft}.` : "";
  return `Hi ${firstName(sender)}! 👋 ${owner.fullName} is busy right now.${when} If it's urgent, tap "Notify ${firstName(owner)}" and I'll let them know.`;
};

// Returns the createdAt of the newest message handled, so a follow-up pass knows what's been answered
const replyToBusyConversation = async (ownerId, senderId, answeredUpTo) => {
  const [owner, sender] = await Promise.all([User.findById(ownerId), User.findById(senderId)]);
  if (!owner || !sender || !isUserBusy(owner)) return answeredUpTo;

  const history = await getConversation(ownerId, senderId);
  const { lastOwnerMessage, earlier, unanswered } = splitConversation(history, ownerId, answeredUpTo);
  if (unanswered.length === 0) return answeredUpTo;
  const handledUpTo = unanswered[unanswered.length - 1].createdAt;

  const sessionStart = Math.max(
    owner.busyStart ? new Date(owner.busyStart).getTime() : 0,
    Date.now() - SESSION_GAP_MS
  );
  const agentAlreadyReplied =
    lastOwnerMessage?.isAutoReply && new Date(lastOwnerMessage.createdAt).getTime() >= sessionStart;

  if (!owner.useAI) {
    const lastAutoReply = earlier.findLast((m) => m.isAutoReply);
    if (lastAutoReply && Date.now() - new Date(lastAutoReply.createdAt) < STATIC_REPLY_COOLDOWN_MS) {
      return handledUpTo;
    }
    const text = owner.busyMessage?.trim() || fallbackReply(owner, sender, describeTimeLeft(owner.busyEnd));
    await postAutoReply({ owner, senderId, text });
    return handledUpTo;
  }

  const timeLeft = describeTimeLeft(owner.busyEnd);
  let replyText;
  let notifyRequest = null;

  setAgentTyping(ownerId, senderId, true);
  try {
    const data = await callAIService("/busy-reply", {
      senderName: sender.fullName,
      receiverName: owner.fullName,
      messageText: unanswered.map(messageText).filter(Boolean).join("\n"),
      busyMessage: owner.busyMessage || "",
      busyUntilText: timeLeft,
      isFirstReply: !agentAlreadyReplied,
      ownerRecentlyNotified: Boolean(await findRecentNotification(owner, sender)),
      chatHistory: earlier
        .map((m) => ({
          role: m.senderId.toString() === senderId ? "sender" : m.isAutoReply ? "assistant" : "owner",
          text: messageText(m),
        }))
        .filter((m) => m.text),
    });
    if (!data?.result) throw new Error("empty reply");
    replyText = data.result;
    if (data.notifyOwner) notifyRequest = data;
  } catch (error) {
    // Never fall back to the owner's note in AI mode: it holds private instructions for the agent
    console.error("Busy agent reply failed, sending fallback:", error.message);
    replyText = fallbackReply(owner, sender, timeLeft);
  } finally {
    setAgentTyping(ownerId, senderId, false);
  }

  let ownerNotified = false;
  if (notifyRequest) {
    try {
      const lastText = messageText(unanswered[unanswered.length - 1]);
      await notifyOwner({
        owner,
        requester: sender,
        summary: notifyRequest.summary?.trim() || lastText || `${sender.fullName} wants to reach you`,
        urgency: notifyRequest.urgency === "urgent" ? "urgent" : "normal",
      });
      ownerNotified = true;
    } catch (error) {
      console.error("Failed to notify owner:", error);
    }
  }

  await postAutoReply({ owner, senderId, text: replyText, ownerNotified });
  return handledUpTo;
};

// One reply at a time per conversation; messages that arrive mid-reply get answered together afterwards
const activeConversations = new Map();

export const handleMessageToBusyUser = (ownerId, senderId) => {
  const key = `${ownerId}:${senderId}`;
  const active = activeConversations.get(key);
  if (active) {
    active.pending = true;
    return;
  }

  const state = { pending: false };
  activeConversations.set(key, state);
  (async () => {
    try {
      let answeredUpTo;
      do {
        state.pending = false;
        answeredUpTo = await replyToBusyConversation(ownerId, senderId, answeredUpTo);
      } while (state.pending);
    } catch (error) {
      console.error("Error in busy auto-reply:", error);
    } finally {
      activeConversations.delete(key);
    }
  })();
};

export const requestNotificationFromSender = async (requester, owner) => {
  const ownerId = owner._id.toString();
  const requesterId = requester._id.toString();

  // Summarise what the requester said since the owner last replied personally
  const history = await getConversation(ownerId, requesterId);
  const lastManualIndex = history.findLastIndex((m) => m.senderId.toString() === ownerId && !m.isAutoReply);
  const recentTexts = history
    .slice(lastManualIndex + 1)
    .filter((m) => m.senderId.toString() === requesterId)
    .slice(-3)
    .map(messageText)
    .filter(Boolean);
  const summary = recentTexts.length
    ? recentTexts.join(" / ")
    : `${requester.fullName} wants to talk to you`;

  const { alreadyNotified } = await notifyOwner({ owner, requester, summary });
  const text = alreadyNotified
    ? `${owner.fullName} has already been notified about your messages and will get back to you as soon as they can 🙏`
    : `Done! 🔔 I've notified ${owner.fullName}. They'll get back to you as soon as they're free.`;

  const message = await postAutoReply({ owner, senderId: requesterId, text, ownerNotified: true });
  return { alreadyNotified, message };
};
