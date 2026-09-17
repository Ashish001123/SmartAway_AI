import Notification from "../models/notification.model.js";

export const getNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(30)
      .populate("fromUserId", "fullName profilePic");

    res.status(200).json(notifications);
  } catch (error) {
    console.error("Error in getNotifications:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const markNotificationsRead = async (req, res) => {
  try {
    await Notification.updateMany({ userId: req.user._id, isRead: false }, { $set: { isRead: true } });
    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error in markNotificationsRead:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};
