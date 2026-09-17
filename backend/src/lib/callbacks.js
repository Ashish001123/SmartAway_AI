import Callback from "../models/callback.model.js";
import Notification from "../models/notification.model.js";
import User from "../models/user.model.js";
import { formatSlotLabel, getFreeSlots } from "./availability.js";
import { createCalendarEvent, deleteCalendarEvent, isCalendarConnected, syncCalendar } from "./calendar.js";
import { deliverAlert } from "./alerts.js";
import { escapeHtml, sendAlertEmail } from "./email.js";
import { postAutoReply } from "./busyAgent.js";
import { emitTo } from "./realtime.js";

const MINUTE = 60 * 1000;
const REMINDER_LEAD_MS = 10 * MINUTE;

export class CallbackError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const publicUser = (user) => ({ _id: user._id, fullName: user.fullName, profilePic: user.profilePic });

const serialize = (callback, owner, requester) => ({
  ...(callback.toObject ? callback.toObject() : callback),
  ownerId: publicUser(owner),
  requesterId: publicUser(requester),
});

// Stores an in-app notification for `recipient` and sends it to their alert channels
const notifyUser = async ({ recipient, from, type, callback, title, summary, email }) => {
  const notification = await Notification.create({
    userId: recipient._id,
    fromUserId: from._id,
    type,
    callbackId: callback._id,
    summary,
  });
  emitTo(recipient._id, "ownerNotification", { ...notification.toObject(), fromUserId: publicUser(from) });
  deliverAlert(recipient, { title, body: summary, path: `/?chat=${from._id}`, tag: `${type}-${callback._id}`, email });
};

const broadcast = (payload) => {
  emitTo(payload.ownerId._id, "callbackUpdated", payload);
  emitTo(payload.requesterId._id, "callbackUpdated", payload);
};

export const bookCallback = async ({ owner, requester, start, source = "button" }) => {
  if (owner._id.equals(requester._id)) throw new CallbackError(400, "You can't book a callback with yourself");
  const requested = new Date(start);
  if (Number.isNaN(requested.getTime())) throw new CallbackError(400, "Invalid callback time");

  const existing = await Callback.findOne({
    ownerId: owner._id,
    requesterId: requester._id,
    status: "scheduled",
    end: { $gt: new Date() },
  });
  if (existing) {
    throw new CallbackError(
      409,
      `You already have a callback with ${owner.fullName} on ${formatSlotLabel(existing.start, requester.timezone)}`
    );
  }

  // Only times the owner is actually free can be booked
  const slots = await getFreeSlots(owner, { count: Infinity, spacingMinutes: 0 });
  const slot = slots.find((s) => s.start === requested.toISOString());
  if (!slot) throw new CallbackError(409, "That time is no longer available. Please pick another one.");

  let callback;
  try {
    callback = await Callback.create({
      ownerId: owner._id,
      requesterId: requester._id,
      start: slot.start,
      end: slot.end,
      source,
    });
  } catch (error) {
    if (error.code === 11000) throw new CallbackError(409, "That time was just taken. Please pick another one.");
    throw error;
  }

  if (isCalendarConnected(owner)) {
    try {
      const event = await createCalendarEvent(owner, {
        summary: `📞 Call back ${requester.fullName}`,
        description: "Booked by your SmartWay AI assistant while you were busy.",
        start: slot.start,
        end: slot.end,
        callbackId: callback._id,
      });
      callback.calendarEventId = event?.id || null;
      await Callback.updateOne({ _id: callback._id }, { $set: { calendarEventId: callback.calendarEventId } });
    } catch (error) {
      console.error("Failed to add callback to Google Calendar:", error.message);
    }
  }

  const ownerLabel = formatSlotLabel(slot.start, owner.timezone);
  await notifyUser({
    recipient: owner,
    from: requester,
    type: "callback_booked",
    callback,
    title: `📅 ${requester.fullName} booked a callback`,
    summary: `Call ${requester.fullName} back on ${ownerLabel}`,
    email: () =>
      sendAlertEmail(owner.email, owner.fullName, {
        subject: `📅 ${requester.fullName} booked a callback for ${ownerLabel}`,
        heading: "📅 Callback booked",
        intro: `While you were busy, <strong style="color:#ffffff;">${escapeHtml(requester.fullName)}</strong> booked a callback through your AI assistant:`,
        quote: ownerLabel,
        ctaLabel: `Open chat with ${requester.fullName}`,
      }),
  });

  const message = await postAutoReply({
    owner,
    senderId: requester._id.toString(),
    text: `📅 Booked! ${owner.fullName} will call you back on ${formatSlotLabel(slot.start, requester.timezone)}.`,
    callbackId: callback._id,
  });

  const payload = serialize(callback, owner, requester);
  broadcast(payload);
  return { callback: payload, message };
};

export const cancelCallback = async ({ callbackId, user }) => {
  const callback = await Callback.findById(callbackId);
  if (!callback) throw new CallbackError(404, "Callback not found");
  const isOwner = callback.ownerId.equals(user._id);
  if (!isOwner && !callback.requesterId.equals(user._id)) throw new CallbackError(403, "Not your callback");

  const cancelled = await Callback.findOneAndUpdate(
    { _id: callback._id, status: "scheduled" },
    { $set: { status: "cancelled", cancelledBy: user._id } },
    { new: true }
  );
  if (!cancelled) throw new CallbackError(409, "This callback was already cancelled");

  const [owner, requester] = await Promise.all([User.findById(callback.ownerId), User.findById(callback.requesterId)]);
  if (cancelled.calendarEventId && isCalendarConnected(owner)) {
    deleteCalendarEvent(owner, cancelled.calendarEventId).catch((error) =>
      console.error("Failed to remove callback from Google Calendar:", error.message)
    );
  }

  const other = isOwner ? requester : owner;
  await notifyUser({
    recipient: other,
    from: user,
    type: "callback_cancelled",
    callback: cancelled,
    title: `🗓️ ${user.fullName} cancelled a callback`,
    summary: `Cancelled the callback on ${formatSlotLabel(cancelled.start, other.timezone)}`,
  });

  const requesterLabel = formatSlotLabel(cancelled.start, requester.timezone);
  const message = await postAutoReply({
    owner,
    senderId: requester._id.toString(),
    text: isOwner
      ? `🗓️ ${owner.fullName} had to cancel the callback on ${requesterLabel}. Sorry about that!`
      : `🗓️ The callback on ${requesterLabel} was cancelled.`,
    callbackId: cancelled._id,
  });

  const payload = serialize(cancelled, owner, requester);
  broadcast(payload);
  return { callback: payload, message };
};

export const listUpcomingCallbacks = async (userId) => {
  const callbacks = await Callback.find({
    status: "scheduled",
    end: { $gt: new Date() },
    $or: [{ ownerId: userId }, { requesterId: userId }],
  })
    .sort({ start: 1 })
    .limit(50)
    .populate("ownerId", "fullName profilePic")
    .populate("requesterId", "fullName profilePic")
    .lean();
  return callbacks.filter((c) => c.ownerId && c.requesterId);
};

export const sendCallbackReminders = async () => {
  const now = Date.now();
  const due = await Callback.find({
    status: "scheduled",
    reminderSentAt: null,
    start: { $lte: new Date(now + REMINDER_LEAD_MS), $gte: new Date(now - 30 * MINUTE) },
  });

  for (const callback of due) {
    // Claim the reminder first so two server instances never both send it
    const claimed = await Callback.updateOne(
      { _id: callback._id, reminderSentAt: null },
      { $set: { reminderSentAt: new Date() } }
    );
    if (claimed.modifiedCount !== 1) continue;

    const [owner, requester] = await Promise.all([User.findById(callback.ownerId), User.findById(callback.requesterId)]);
    if (!owner || !requester) continue;

    await notifyUser({
      recipient: owner,
      from: requester,
      type: "callback_reminder",
      callback,
      title: `📞 Time to call ${requester.fullName}`,
      summary: `Your callback with ${requester.fullName} is at ${formatSlotLabel(callback.start, owner.timezone)}`,
    });
    await notifyUser({
      recipient: requester,
      from: owner,
      type: "callback_reminder",
      callback,
      title: `📞 ${owner.fullName} will call you soon`,
      summary: `${owner.fullName} is due to call you back at ${formatSlotLabel(callback.start, requester.timezone)}`,
    });
  }
};

export const syncAllCalendars = async () => {
  const users = await User.find({ "googleCalendar.refreshToken": { $ne: null }, "googleCalendar.autoBusy": true });
  for (const user of users) {
    await syncCalendar(user).catch((error) => console.error(`Calendar sync failed for ${user._id}:`, error.message));
  }
};

export const startSchedulers = () => {
  const run = (task, name) => task().catch((error) => console.error(`${name} failed:`, error.message));
  const reminderEvery = Number(process.env.CALLBACK_REMINDER_INTERVAL_MS) || 60 * 1000;
  const calendarEvery = Number(process.env.CALENDAR_SYNC_INTERVAL_MS) || 5 * 60 * 1000;

  setInterval(() => run(sendCallbackReminders, "Callback reminders"), reminderEvery);
  setInterval(() => run(syncAllCalendars, "Calendar sync"), calendarEvery);
  setTimeout(() => run(syncAllCalendars, "Calendar sync"), 10 * 1000);
};
