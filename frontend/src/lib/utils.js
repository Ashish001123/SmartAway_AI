export function formatMessageTime(date) {
  return new Date(date).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

// Mirrors the backend check: busy mode is on inside its optional schedule, or a calendar event is happening
export function isUserBusy(user, now = new Date()) {
  if (!user) return false;
  const inCalendarEvent =
    user.calendarBusyFrom && now >= new Date(user.calendarBusyFrom) && now < new Date(user.calendarBusyUntil);
  if (inCalendarEvent) return true;
  if (!user.isBusy) return false;
  if (user.busyStart && now < new Date(user.busyStart)) return false;
  if (user.busyEnd && now > new Date(user.busyEnd)) return false;
  return true;
}

export function formatSlot(date) {
  return new Date(date).toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function browserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}
