import mongoose from "mongoose";
import User from "../models/user.model.js";
import ContactMemory from "../models/contactMemory.model.js";
import { getAwayDigest, markDigestSeen } from "../lib/digest.js";
import { getAgentStats, STATS_RANGES } from "../lib/agentStats.js";

export const getDigest = async (req, res) => {
  try {
    const owner = await User.findById(req.user._id);
    res.status(200).json(await getAwayDigest(owner));
  } catch (error) {
    console.error("Error in getDigest:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const markDigestAsSeen = async (req, res) => {
  try {
    await markDigestSeen(req.user._id);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error in markDigestAsSeen:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getStats = async (req, res) => {
  try {
    const days = Number(req.query.days) || 30;
    if (!STATS_RANGES.includes(days)) {
      return res.status(400).json({ message: `days must be one of ${STATS_RANGES.join(", ")}` });
    }
    const owner = await User.findById(req.user._id);
    res.status(200).json(await getAgentStats(owner, days));
  } catch (error) {
    console.error("Error in getStats:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getMemories = async (req, res) => {
  try {
    const memories = await ContactMemory.find({ ownerId: req.user._id, "facts.0": { $exists: true } })
      .sort({ updatedAt: -1 })
      .populate("contactId", "fullName profilePic")
      .lean();
    res.status(200).json(memories.filter((m) => m.contactId));
  } catch (error) {
    console.error("Error in getMemories:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const forgetContact = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.contactId)) {
      return res.status(400).json({ message: "Invalid contact" });
    }
    await ContactMemory.deleteOne({ ownerId: req.user._id, contactId: req.params.contactId });
    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error in forgetContact:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};
