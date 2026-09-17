import User from "../models/user.model.js";
import { getAwayDigest, markDigestSeen } from "../lib/digest.js";

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
