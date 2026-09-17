import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import {
  disconnectTelegram,
  getIntegrations,
  linkTelegram,
  sendTestAlert,
  subscribePush,
  telegramWebhook,
  unsubscribePush,
} from "../controllers/alert.controller.js";

const router = express.Router();

router.get("/integrations", protectRoute, getIntegrations);
router.post("/alerts/test", protectRoute, sendTestAlert);

router.post("/telegram/link", protectRoute, linkTelegram);
router.delete("/telegram/link", protectRoute, disconnectTelegram);
router.post("/telegram/webhook", telegramWebhook);

router.post("/push/subscribe", protectRoute, subscribePush);
router.delete("/push/subscribe", protectRoute, unsubscribePush);

export default router;
