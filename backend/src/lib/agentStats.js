import Message from "../models/message.model.js";
import Notification from "../models/notification.model.js";
import Callback from "../models/callback.model.js";
import User from "../models/user.model.js";
import { isValidTimeZone } from "./availability.js";

const DAY_MS = 24 * 60 * 60 * 1000;
// Rough estimate shown to users as such: each agent reply saves about a minute of the owner's time
const MINUTES_SAVED_PER_REPLY = 1;
export const STATS_RANGES = [7, 30, 90];

const dayKey = (date, timeZone) => new Intl.DateTimeFormat("en-CA", { timeZone }).format(date); // YYYY-MM-DD

export const getAgentStats = async (owner, days) => {
  const timeZone = isValidTimeZone(owner.timezone) ? owner.timezone : "UTC";
  const now = new Date();
  const since = new Date(now.getTime() - (days - 1) * DAY_MS);
  const ownerId = owner._id.toString();
  const repliesMatch = { senderId: ownerId, isAutoReply: true, createdAt: { $gte: since } };

  const [daily, byContact, notifications, callbacksBooked] = await Promise.all([
    Message.aggregate([
      { $match: repliesMatch },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: timeZone } },
          replies: { $sum: 1 },
        },
      },
    ]),
    Message.aggregate([
      { $match: repliesMatch },
      { $group: { _id: "$receiverId", replies: { $sum: 1 } } },
      { $sort: { replies: -1 } },
    ]),
    Notification.aggregate([
      { $match: { userId: owner._id, type: { $in: ["notify_request", null] }, createdAt: { $gte: since } } },
      { $group: { _id: "$urgency", count: { $sum: 1 } } },
    ]),
    Callback.countDocuments({ ownerId: owner._id, createdAt: { $gte: since } }),
  ]);

  // Every day in the range, including days with no replies, in the owner's time zone.
  // Half-day steps never skip a date when a daylight-saving change shortens a day.
  const repliesByDay = new Map(daily.map((d) => [d._id, d.replies]));
  const series = [];
  for (let t = since.getTime(); t <= now.getTime() && series.length < days; t += DAY_MS / 2) {
    const date = dayKey(new Date(t), timeZone);
    if (series.at(-1)?.date !== date) series.push({ date, replies: repliesByDay.get(date) || 0 });
  }

  const topIds = byContact.slice(0, 5).map((c) => c._id);
  const contacts = await User.find({ _id: { $in: topIds } }).select("fullName profilePic").lean();
  const contactsById = new Map(contacts.map((c) => [c._id.toString(), c]));

  const repliesHandled = series.reduce((sum, d) => sum + d.replies, 0);
  const notificationCount = (urgency) => notifications.find((n) => n._id === urgency)?.count || 0;

  return {
    days,
    timeZone,
    totals: {
      repliesHandled,
      conversations: byContact.length,
      alerts: notificationCount("normal") + notificationCount("urgent"),
      urgentAlerts: notificationCount("urgent"),
      callbacksBooked,
      minutesSaved: repliesHandled * MINUTES_SAVED_PER_REPLY,
    },
    daily: series,
    topContacts: byContact
      .slice(0, 5)
      .filter((c) => contactsById.has(c._id.toString()))
      .map((c) => ({ contact: contactsById.get(c._id.toString()), replies: c.replies })),
  };
};
