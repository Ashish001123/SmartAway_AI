import Callback from "../models/callback.model.js";
import { calendarBlocks, currentCalendarBlock, isCalendarConnected } from "./calendar.js";

const MINUTE = 60 * 1000;
const SLOT_MINUTES = 30;
const STEP_MINUTES = 15;
const WORKDAY_START_MINUTES = 9 * 60;
const WORKDAY_END_MINUTES = 21 * 60;
const SEARCH_DAYS = 3;
const MIN_LEAD_MINUTES = 15;

export const isValidTimeZone = (timeZone) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
};

const safeTimeZone = (timeZone) => (timeZone && isValidTimeZone(timeZone) ? timeZone : "UTC");

// Busy from the manual schedule, the calendar, or both. `until` is null when the end isn't known.
export const getBusyState = (user, now = new Date()) => {
  const manual =
    Boolean(user?.isBusy) &&
    (!user.busyStart || now >= new Date(user.busyStart)) &&
    (!user.busyEnd || now <= new Date(user.busyEnd));
  const calendarBlock = currentCalendarBlock(user, now);
  if (!manual && !calendarBlock) return { busy: false };

  let until = null;
  let since = null;
  if (manual) {
    since = user.busyStart ? new Date(user.busyStart) : null;
    if (user.busyEnd) until = new Date(user.busyEnd);
    if (until && calendarBlock && calendarBlock.end > until) until = calendarBlock.end;
  } else {
    since = calendarBlock.start;
    until = calendarBlock.end;
  }
  return { busy: true, manual, calendarBlock, since, until };
};

export const isUserBusy = (user, now = new Date()) => getBusyState(user, now).busy;

export const describeTimeLeft = (until) => {
  if (!until) return null;
  const minutes = Math.round((new Date(until) - Date.now()) / MINUTE);
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

export const formatSlotLabel = (date, timeZone) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: safeTimeZone(timeZone),
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(date));

const minutesIntoLocalDay = (date, timeZone) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type) => Number(parts.find((p) => p.type === type).value);
  return value("hour") * 60 + value("minute");
};

const getBusyIntervals = async (owner, from, to) => {
  const intervals = [];
  if (isCalendarConnected(owner) && owner.googleCalendar.autoBusy) {
    calendarBlocks(owner.googleCalendar.events).forEach((b) => intervals.push([b.start, b.end]));
  }
  if (owner.isBusy && owner.busyEnd) {
    intervals.push([owner.busyStart ? new Date(owner.busyStart) : from, new Date(owner.busyEnd)]);
  } else if (owner.isBusy && owner.busyStart) {
    intervals.push([new Date(owner.busyStart), to]); // scheduled to start later with no end
  }
  const callbacks = await Callback.find({
    ownerId: owner._id,
    status: "scheduled",
    end: { $gt: from },
    start: { $lt: to },
  }).lean();
  callbacks.forEach((c) => intervals.push([c.start, c.end]));
  return intervals;
};

// Free 30-minute callback slots in the owner's working hours (9am-9pm local) over the next few days.
// Suggestions are spaced out by `spacingMinutes`; pass 0 to list every free slot.
export const getFreeSlots = async (owner, { count = 4, spacingMinutes = 90, now = new Date() } = {}) => {
  const timeZone = safeTimeZone(owner.timezone);
  const state = getBusyState(owner, now);
  // Busy with no known end: there's no honest time to offer
  if (state.manual && !owner.busyEnd) return [];

  const searchEnd = new Date(now.getTime() + SEARCH_DAYS * 24 * 60 * MINUTE);
  const intervals = await getBusyIntervals(owner, now, new Date(searchEnd.getTime() + SLOT_MINUTES * MINUTE));

  const earliest = Math.max(now.getTime() + MIN_LEAD_MINUTES * MINUTE, state.until ? state.until.getTime() : 0);
  const stepMs = STEP_MINUTES * MINUTE;
  let t = Math.ceil(earliest / stepMs) * stepMs;

  const slots = [];
  for (; t < searchEnd.getTime() && slots.length < count; t += stepMs) {
    const start = new Date(t);
    const end = new Date(t + SLOT_MINUTES * MINUTE);
    const localMinutes = minutesIntoLocalDay(start, timeZone);
    if (localMinutes % SLOT_MINUTES !== 0) continue;
    if (localMinutes < WORKDAY_START_MINUTES || localMinutes + SLOT_MINUTES > WORKDAY_END_MINUTES) continue;
    if (intervals.some(([busyStart, busyEnd]) => start < new Date(busyEnd) && end > new Date(busyStart))) continue;
    const previous = slots[slots.length - 1];
    if (previous && t - previous.start.getTime() < spacingMinutes * MINUTE) continue;
    slots.push({ start, end });
  }

  return slots.map(({ start, end }) => ({
    start: start.toISOString(),
    end: end.toISOString(),
    label: formatSlotLabel(start, timeZone),
  }));
};
