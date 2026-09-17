export function formatMessageTime(date) {
  return new Date(date).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

// Mirrors the backend check: busy mode is on and now is inside the optional schedule
export function isUserBusy(user, now = new Date()) {
  if (!user?.isBusy) return false;
  if (user.busyStart && now < new Date(user.busyStart)) return false;
  if (user.busyEnd && now > new Date(user.busyEnd)) return false;
  return true;
}
