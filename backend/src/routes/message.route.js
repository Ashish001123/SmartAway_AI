import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import { getMessages, getUsersForSidebar, sendMessage , markMessagesAsRead , deleteChat, deleteMessage, reactToMessage} from "../controllers/message.controller.js";

const router = express.Router();

router.get("/users", protectRoute, getUsersForSidebar);
router.put("/read/:id", protectRoute, markMessagesAsRead);
router.delete("/delete/:id", protectRoute, deleteChat);
router.delete("/delete-message/:id", protectRoute, deleteMessage);
router.post("/react/:id", protectRoute, reactToMessage);
router.post("/send/:id", protectRoute, sendMessage);
router.get("/:id", protectRoute, getMessages);

export default router;
