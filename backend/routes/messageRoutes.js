import express from "express";
import { createMessage, saveResponse } from "../controllers/messageController.js";
import { requireAuth, requireAdmin } from "../middleware/authMiddleware.js";

// Router for message-related backend requests
const router = express.Router();

// Public contact form: customers can submit messages
router.post("/", createMessage);

// Only administrators can reply to customer messages
router.patch(
  "/:id/response",
  requireAuth,
  requireAdmin,
  saveResponse
);

export default router;