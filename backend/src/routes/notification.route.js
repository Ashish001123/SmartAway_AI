import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import { getNotifications, markNotificationsRead } from "../controllers/notification.controller.js";

const router = express.Router();

router.get("/", protectRoute, getNotifications);
router.put("/read", protectRoute, markNotificationsRead);

export default router;
