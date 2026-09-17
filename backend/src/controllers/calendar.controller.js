import User from "../models/user.model.js";
import {
  CalendarDisconnectedError,
  calendarSummary,
  completeCalendarConnect,
  disconnectCalendar,
  getCalendarAuthUrl,
  isCalendarConfigured,
  isCalendarConnected,
  syncCalendar,
} from "../lib/calendar.js";
import { appBaseUrl } from "../lib/urls.js";

export const connectCalendar = (req, res) => {
  if (!isCalendarConfigured()) {
    return res.status(503).json({ message: "Google Calendar isn't set up on this server" });
  }
  res.status(200).json({ url: getCalendarAuthUrl(req.user._id) });
};

// Google redirects the browser here after the user approves (or denies) calendar access
export const calendarOAuthCallback = async (req, res) => {
  const { code, state, error } = req.query;
  const settingsUrl = (status) => `${appBaseUrl()}/settings?calendar=${status}`;
  if (error || !code || !state) {
    return res.redirect(settingsUrl(error === "access_denied" ? "denied" : "error"));
  }
  try {
    await completeCalendarConnect(code, state);
    res.redirect(settingsUrl("connected"));
  } catch (err) {
    console.error("Google Calendar connect failed:", err.message);
    res.redirect(settingsUrl("error"));
  }
};

export const updateCalendarSettings = async (req, res) => {
  try {
    const update = {};
    for (const field of ["autoBusy", "shareEventTitles"]) {
      if (req.body[field] !== undefined) update[`googleCalendar.${field}`] = Boolean(req.body[field]);
    }
    const user = await User.findByIdAndUpdate(req.user._id, { $set: update }, { new: true });
    res.status(200).json(calendarSummary(user));
  } catch (error) {
    console.error("Error in updateCalendarSettings:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const syncCalendarNow = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!isCalendarConnected(user)) {
      return res.status(400).json({ message: "Google Calendar isn't connected" });
    }
    await syncCalendar(user);
    res.status(200).json(calendarSummary(user));
  } catch (error) {
    if (error instanceof CalendarDisconnectedError) {
      return res.status(409).json({ message: "Google Calendar access was removed. Please connect it again." });
    }
    console.error("Error in syncCalendarNow:", error.message);
    res.status(502).json({ message: "Couldn't reach Google Calendar. Try again or reconnect." });
  }
};

export const removeCalendar = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    await disconnectCalendar(user);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error in removeCalendar:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};
