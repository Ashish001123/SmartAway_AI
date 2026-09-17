import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import {
  forgetContact,
  getDigest,
  getMemories,
  getStats,
  markDigestAsSeen,
} from "../controllers/agent.controller.js";

const router = express.Router();

router.get("/digest", protectRoute, getDigest);
router.post("/digest/seen", protectRoute, markDigestAsSeen);
router.get("/stats", protectRoute, getStats);
router.get("/memory", protectRoute, getMemories);
router.delete("/memory/:contactId", protectRoute, forgetContact);

export default router;
