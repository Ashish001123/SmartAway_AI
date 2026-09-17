import jwt from "jsonwebtoken";
import User from "../models/user.model.js";
import { decryptSecret, encryptSecret } from "./secrets.js";
import { apiBaseUrl } from "./urls.js";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const SCOPES = "openid email https://www.googleapis.com/auth/calendar.events";
const SYNC_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const FRESH_FOR_MS = 2 * 60 * 1000;
const SYNC_TIMEOUT_MS = 8000;
// Back-to-back events closer than this count as one busy block
const MERGE_GAP_MS = 5 * 60 * 1000;

const tokenUrl = () => process.env.GOOGLE_OAUTH_TOKEN_URL || "https://oauth2.googleapis.com/token";
const revokeUrl = () => process.env.GOOGLE_OAUTH_REVOKE_URL || "https://oauth2.googleapis.com/revoke";
const calendarApi = () => process.env.GOOGLE_CALENDAR_API_BASE || "https://www.googleapis.com/calendar/v3";
const redirectUri = () => `${apiBaseUrl()}/api/calendar/oauth/callback`;

const accessTokens = new Map(); // {userId: {token, expiresAt}}

export class CalendarDisconnectedError extends Error {}

export const isCalendarConfigured = () =>
  Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

export const isCalendarConnected = (user) => Boolean(user?.googleCalendar?.refreshToken);

const postForm = async (url, params) => {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(`Google OAuth failed: ${data.error_description || data.error || response.status}`);
    error.code = data.error;
    throw error;
  }
  return data;
};

export const getCalendarAuthUrl = (userId) => {
  const state = jwt.sign({ userId: userId.toString(), purpose: "calendar-connect" }, process.env.JWT_SECRET, {
    expiresIn: "10m",
  });
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent", // always issue a refresh token
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_URL}?${params}`;
};

const cacheAccessToken = (userId, token, expiresInSecs) =>
  accessTokens.set(userId.toString(), { token, expiresAt: Date.now() + expiresInSecs * 1000 });

const clearCalendar = (userId) => {
  accessTokens.delete(userId.toString());
  return User.updateOne(
    { _id: userId },
    {
      $set: {
        "googleCalendar.refreshToken": null,
        "googleCalendar.email": null,
        "googleCalendar.events": [],
        "googleCalendar.lastSyncedAt": null,
      },
    }
  );
};

const getAccessToken = async (user) => {
  const cached = accessTokens.get(user._id.toString());
  if (cached && cached.expiresAt - 60 * 1000 > Date.now()) return cached.token;

  let refreshToken;
  try {
    refreshToken = decryptSecret(user.googleCalendar.refreshToken);
  } catch {
    await clearCalendar(user._id);
    throw new CalendarDisconnectedError("Stored Google token can't be decrypted; reconnect the calendar");
  }

  try {
    const tokens = await postForm(tokenUrl(), {
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    });
    cacheAccessToken(user._id, tokens.access_token, tokens.expires_in);
    return tokens.access_token;
  } catch (error) {
    if (error.code === "invalid_grant") {
      // The user revoked access in their Google account
      await clearCalendar(user._id);
      throw new CalendarDisconnectedError("Google Calendar access was revoked");
    }
    throw error;
  }
};

const calendarRequest = async (user, path, { method = "GET", body } = {}, isRetry = false) => {
  const token = await getAccessToken(user);
  const response = await fetch(`${calendarApi()}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body && JSON.stringify(body),
  });
  // Google can invalidate an access token before it expires; refresh once and retry
  if (response.status === 401 && !isRetry) {
    accessTokens.delete(user._id.toString());
    return calendarRequest(user, path, { method, body }, true);
  }
  if (!response.ok) {
    throw new Error(`Google Calendar ${method} failed: ${response.status} ${await response.text()}`);
  }
  return response.status === 204 ? null : response.json();
};

const decodeJwtPayload = (token) => {
  try {
    return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
  } catch {
    return null;
  }
};

export const completeCalendarConnect = async (code, state) => {
  const { userId, purpose } = jwt.verify(state, process.env.JWT_SECRET);
  if (purpose !== "calendar-connect") throw new Error("Invalid OAuth state");

  const tokens = await postForm(tokenUrl(), {
    code,
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    redirect_uri: redirectUri(),
    grant_type: "authorization_code",
  });
  if (!tokens.refresh_token) throw new Error("Google did not return a refresh token");

  // The ID token comes straight from Google's token endpoint over TLS, so reading it without
  // re-verifying the signature is safe here
  const user = await User.findByIdAndUpdate(
    userId,
    {
      $set: {
        "googleCalendar.refreshToken": encryptSecret(tokens.refresh_token),
        "googleCalendar.email": decodeJwtPayload(tokens.id_token)?.email || null,
        "googleCalendar.events": [],
        "googleCalendar.lastSyncedAt": null,
      },
    },
    { new: true }
  );
  if (!user) throw new Error("User not found");

  cacheAccessToken(user._id, tokens.access_token, tokens.expires_in);
  await syncCalendar(user).catch((error) => console.error("Initial calendar sync failed:", error.message));
  return user;
};

export const disconnectCalendar = async (user) => {
  if (isCalendarConnected(user)) {
    try {
      await postForm(revokeUrl(), { token: decryptSecret(user.googleCalendar.refreshToken) });
    } catch (error) {
      console.error("Google token revoke failed:", error.message);
    }
  }
  await clearCalendar(user._id);
};

export const syncCalendar = async (user) => {
  const now = new Date();
  const params = new URLSearchParams({
    timeMin: now.toISOString(), // includes events already in progress
    timeMax: new Date(now.getTime() + SYNC_WINDOW_MS).toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "100",
  });
  const data = await calendarRequest(user, `/calendars/primary/events?${params}`);

  const events = (data.items || [])
    .filter((e) => e.status !== "cancelled" && e.transparency !== "transparent")
    .filter((e) => e.start?.dateTime && e.end?.dateTime) // all-day events don't make you busy
    .filter((e) => !e.attendees?.some((a) => a.self && a.responseStatus === "declined"))
    .filter((e) => !e.extendedProperties?.private?.smartwayCallbackId) // our own callback events
    .map((e) => ({
      start: new Date(e.start.dateTime),
      end: new Date(e.end.dateTime),
      title: (e.summary || "Busy").slice(0, 120),
    }));

  await User.updateOne(
    { _id: user._id },
    { $set: { "googleCalendar.events": events, "googleCalendar.lastSyncedAt": now } }
  );
  user.googleCalendar.events = events;
  user.googleCalendar.lastSyncedAt = now;
  return events;
};

// Re-syncs a calendar that auto-sets busy mode if its cached events are stale
export const ensureCalendarFresh = async (user) => {
  const calendar = user?.googleCalendar;
  if (!isCalendarConnected(user) || !calendar.autoBusy) return;
  if (calendar.lastSyncedAt && Date.now() - new Date(calendar.lastSyncedAt) < FRESH_FOR_MS) return;

  let timer;
  try {
    await Promise.race([
      syncCalendar(user),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("calendar sync timed out")), SYNC_TIMEOUT_MS);
      }),
    ]);
  } catch (error) {
    console.error("Calendar sync failed:", error.message);
  } finally {
    clearTimeout(timer);
  }
};

export const createCalendarEvent = async (user, { summary, description, start, end, callbackId }) =>
  calendarRequest(user, "/calendars/primary/events", {
    method: "POST",
    body: {
      summary,
      description,
      start: { dateTime: new Date(start).toISOString() },
      end: { dateTime: new Date(end).toISOString() },
      reminders: { useDefault: true },
      extendedProperties: { private: { smartwayCallbackId: String(callbackId) } },
    },
  });

export const deleteCalendarEvent = (user, eventId) =>
  calendarRequest(user, `/calendars/primary/events/${encodeURIComponent(eventId)}`, { method: "DELETE" });

export const calendarBlocks = (events = []) => {
  const sorted = [...events]
    .map((e) => ({ start: new Date(e.start), end: new Date(e.end), titles: [e.title] }))
    .sort((a, b) => a.start - b.start);
  const blocks = [];
  for (const event of sorted) {
    const last = blocks[blocks.length - 1];
    if (last && event.start - last.end <= MERGE_GAP_MS) {
      if (event.end > last.end) last.end = event.end;
      last.titles.push(...event.titles);
    } else {
      blocks.push(event);
    }
  }
  return blocks;
};

const autoBusyEvents = (user) =>
  isCalendarConnected(user) && user.googleCalendar.autoBusy ? user.googleCalendar.events || [] : [];

// The calendar block happening now, if the calendar sets busy mode automatically
export const currentCalendarBlock = (user, now = new Date()) =>
  calendarBlocks(autoBusyEvents(user)).find((b) => b.start <= now && now < b.end) || null;

// The current or next calendar block, used to show "Busy" to contacts without sharing titles
export const nextCalendarBlock = (user, now = new Date()) =>
  calendarBlocks(autoBusyEvents(user)).find((b) => now < b.end) || null;

// The calendar details a user sees about their own account
export const calendarSummary = (user, now = new Date()) => {
  const calendar = user.googleCalendar || {};
  return {
    connected: isCalendarConnected(user),
    email: calendar.email || null,
    autoBusy: calendar.autoBusy !== false,
    shareEventTitles: Boolean(calendar.shareEventTitles),
    lastSyncedAt: calendar.lastSyncedAt || null,
    upcoming: calendarBlocks(calendar.events)
      .filter((block) => block.end > now)
      .slice(0, 5),
  };
};
