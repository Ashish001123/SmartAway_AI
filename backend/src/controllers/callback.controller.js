import mongoose from "mongoose";
import User from "../models/user.model.js";
import { getFreeSlots } from "../lib/availability.js";
import { ensureCalendarFresh } from "../lib/calendar.js";
import { bookCallback, cancelCallback, CallbackError, listUpcomingCallbacks } from "../lib/callbacks.js";

const handleError = (res, error, context) => {
  if (error instanceof CallbackError) {
    return res.status(error.status).json({ message: error.message });
  }
  console.error(`Error in ${context}:`, error);
  res.status(500).json({ message: "Internal server error" });
};

const findOwner = async (ownerId) => {
  if (!mongoose.isValidObjectId(ownerId)) throw new CallbackError(400, "Invalid user");
  const owner = await User.findById(ownerId);
  if (!owner) throw new CallbackError(404, "User not found");
  await ensureCalendarFresh(owner);
  return owner;
};

export const getCallbackSlots = async (req, res) => {
  try {
    const owner = await findOwner(req.params.ownerId);
    if (owner._id.equals(req.user._id)) throw new CallbackError(400, "You can't book a callback with yourself");
    res.status(200).json({ slots: await getFreeSlots(owner, { count: 6 }) });
  } catch (error) {
    handleError(res, error, "getCallbackSlots");
  }
};

export const createCallback = async (req, res) => {
  try {
    const owner = await findOwner(req.body.ownerId);
    const requester = await User.findById(req.user._id);
    const result = await bookCallback({
      owner,
      requester,
      start: req.body.start,
      source: req.body.source === "agent" ? "agent" : "button",
    });
    res.status(201).json(result);
  } catch (error) {
    handleError(res, error, "createCallback");
  }
};

export const getCallbacks = async (req, res) => {
  try {
    res.status(200).json(await listUpcomingCallbacks(req.user._id));
  } catch (error) {
    handleError(res, error, "getCallbacks");
  }
};

export const cancelCallbackById = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) throw new CallbackError(400, "Invalid callback");
    res.status(200).json(await cancelCallback({ callbackId: req.params.id, user: req.user }));
  } catch (error) {
    handleError(res, error, "cancelCallbackById");
  }
};
