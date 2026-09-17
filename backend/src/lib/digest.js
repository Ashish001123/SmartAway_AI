import Message from "../models/message.model.js";
import Notification from "../models/notification.model.js";
import Callback from "../models/callback.model.js";
import Digest from "../models/digest.model.js";
import User from "../models/user.model.js";
import { agentVisibleText } from "./agentText.js";
import { callAIService } from "./ai.js";
import { formatSlotLabel, isUserBusy } from "./availability.js";
import { ensureCalendarFresh } from "./calendar.js";

const LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
const LEAD_IN_MS = 30 * 60 * 1000;
const MAX_CONTACTS = 10;
const MAX_MESSAGES_PER_CONTACT = 40;
const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

const firstName = (user) => user.fullName.split(" ")[0];

const fallbackItem = (contact, context) => ({
  summary: context.lastContactText
    ? `Said: "${context.lastContactText.slice(0, 160)}"`
    : `Messaged you while you were busy`,
  priority: context.notified === "urgent" ? "high" : context.notified || context.callbackStart ? "medium" : "low",
  suggestedReply: `Hey ${firstName(contact)}! Sorry I missed you, I'm free now. What's up?`,
});

const buildConversation = async (owner, contact, firstAutoReplyAt, since) => {
  const ownerId = owner._id.toString();
  const contactId = contact._id.toString();

  const messages = await Message.find({
    $or: [
      { senderId: ownerId, receiverId: contactId },
      { senderId: contactId, receiverId: ownerId },
    ],
    createdAt: { $gte: new Date(firstAutoReplyAt.getTime() - LEAD_IN_MS) },
  })
    .sort({ createdAt: -1 })
    .limit(MAX_MESSAGES_PER_CONTACT)
    .lean();
  messages.reverse();

  const transcript = messages
    .map((m) => ({
      role: m.senderId.toString() === contactId ? "contact" : m.isAutoReply ? "assistant" : "owner",
      text: agentVisibleText(m),
    }))
    .filter((m) => m.text);

  const lastAutoReply = messages.findLast((m) => m.isAutoReply);
  const ownerReplied = messages.some(
    (m) => m.senderId.toString() === ownerId && !m.isAutoReply && m.createdAt > lastAutoReply.createdAt
  );

  const [notification, callback] = await Promise.all([
    Notification.findOne({
      userId: owner._id,
      fromUserId: contact._id,
      type: { $in: ["notify_request", null] },
      createdAt: { $gt: since },
    }).sort({ urgency: -1, createdAt: -1 }),
    Callback.findOne({ ownerId: owner._id, requesterId: contact._id, status: "scheduled", end: { $gt: new Date() } }),
  ]);

  return {
    transcript,
    agentReplies: messages.filter((m) => m.isAutoReply).length,
    lastContactText: transcript.findLast((m) => m.role === "contact")?.text || "",
    notified: notification?.urgency || null,
    callbackStart: callback?.start || null,
    ownerReplied,
  };
};

const publicContact = (user) => ({ _id: user._id, fullName: user.fullName, profilePic: user.profilePic });

const present = (digest, contactsById) => ({
  available: true,
  since: digest.since,
  items: digest.items
    .filter((item) => contactsById.has(item.contactId.toString()))
    .map((item) => ({ ...item, contact: publicContact(contactsById.get(item.contactId.toString())) }))
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]),
});

export const getAwayDigest = async (owner) => {
  await ensureCalendarFresh(owner);
  if (isUserBusy(owner)) return { available: false, busy: true };

  const since = new Date(Math.max(owner.lastDigestSeenAt?.getTime() || 0, Date.now() - LOOKBACK_MS));
  const autoReplies = await Message.find({
    senderId: owner._id.toString(),
    isAutoReply: true,
    createdAt: { $gt: since },
  })
    .sort({ createdAt: 1 })
    .lean();
  if (autoReplies.length === 0) return { available: false };

  // First agent reply per contact, most recently active contacts first
  const firstReplyByContact = new Map();
  const lastActivityByContact = new Map();
  for (const reply of autoReplies) {
    const contactId = reply.receiverId.toString();
    if (!firstReplyByContact.has(contactId)) firstReplyByContact.set(contactId, reply.createdAt);
    lastActivityByContact.set(contactId, reply.createdAt);
  }
  const contactIds = [...lastActivityByContact.keys()]
    .sort((a, b) => lastActivityByContact.get(b) - lastActivityByContact.get(a))
    .slice(0, MAX_CONTACTS);
  const activityUpTo = autoReplies[autoReplies.length - 1].createdAt;

  const contacts = await User.find({ _id: { $in: contactIds } }).select("fullName profilePic");
  const contactsById = new Map(contacts.map((c) => [c._id.toString(), c]));

  const seenAt = owner.lastDigestSeenAt || null;
  const cached = await Digest.findOne({ userId: owner._id });
  const sameSeenAt = (cached?.seenAt?.getTime() ?? null) === (seenAt?.getTime() ?? null);
  if (cached && sameSeenAt && cached.activityUpTo >= activityUpTo) {
    return present(cached.toObject(), contactsById);
  }

  const conversations = [];
  for (const contactId of contactIds) {
    const contact = contactsById.get(contactId);
    if (!contact) continue;
    const context = await buildConversation(owner, contact, firstReplyByContact.get(contactId), since);
    conversations.push({ contact, context });
  }

  let aiItems = new Map();
  try {
    const data = await callAIService("/digest", {
      ownerName: owner.fullName,
      agentPersona: owner.agentPersona || "friendly",
      conversations: conversations.map(({ contact, context }) => ({
        contactId: contact._id.toString(),
        contactName: contact.fullName,
        transcript: context.transcript,
        notified: context.notified,
        callback: context.callbackStart ? formatSlotLabel(context.callbackStart, owner.timezone) : null,
        ownerReplied: context.ownerReplied,
      })),
    });
    aiItems = new Map((data.items || []).map((item) => [item.contactId, item]));
  } catch (error) {
    console.error("Away digest AI summary failed, using fallback:", error.message);
  }

  const items = conversations.map(({ contact, context }) => {
    const ai = aiItems.get(contact._id.toString());
    const base = ai?.summary && ai?.suggestedReply ? ai : fallbackItem(contact, context);
    return {
      contactId: contact._id,
      summary: base.summary,
      priority: PRIORITY_ORDER[base.priority] !== undefined ? base.priority : "medium",
      suggestedReply: base.suggestedReply,
      agentReplies: context.agentReplies,
      notified: context.notified,
      callbackStart: context.callbackStart,
      ownerReplied: context.ownerReplied,
    };
  });

  const digest = await Digest.findOneAndUpdate(
    { userId: owner._id },
    { $set: { since, seenAt, activityUpTo, items } },
    { upsert: true, new: true }
  );
  return present(digest.toObject(), contactsById);
};

export const markDigestSeen = async (userId) => {
  await Promise.all([
    User.updateOne({ _id: userId }, { $set: { lastDigestSeenAt: new Date() } }),
    Digest.deleteOne({ userId }),
  ]);
};
