import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import {
  calendarOAuthCallback,
  connectCalendar,
  removeCalendar,
  syncCalendarNow,
  updateCalendarSettings,
} from "../controllers/calendar.controller.js";
import {
  cancelCallbackById,
  createCallback,
  getCallbackSlots,
  getCallbacks,
} from "../controllers/callback.controller.js";

const router = express.Router();

router.get("/calendar/connect", protectRoute, connectCalendar);
router.get("/calendar/oauth/callback", calendarOAuthCallback);
router.put("/calendar/settings", protectRoute, updateCalendarSettings);
router.post("/calendar/sync", protectRoute, syncCalendarNow);
router.delete("/calendar", protectRoute, removeCalendar);

router.get("/callbacks", protectRoute, getCallbacks);
router.get("/callbacks/slots/:ownerId", protectRoute, getCallbackSlots);
router.post("/callbacks", protectRoute, createCallback);
router.patch("/callbacks/:id/cancel", protectRoute, cancelCallbackById);

export default router;
