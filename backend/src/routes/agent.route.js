import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import { getDigest, markDigestAsSeen } from "../controllers/agent.controller.js";

const router = express.Router();

router.get("/digest", protectRoute, getDigest);
router.post("/digest/seen", protectRoute, markDigestAsSeen);

export default router;
