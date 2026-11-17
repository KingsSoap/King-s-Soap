import express from "express";
import { rateLimit } from "express-rate-limit";
import { createMessage, saveResponse } from "../controllers/messageController.js";
import { requireAuth, requireAdmin } from "../middleware/authMiddleware.js";

// Router for message-related backend requests
const router = express.Router();

// Limit contact form submissions to 5 requests per 15 minutes per IP
const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many messages submitted. Please try again in 15 minutes.",
  },
});

// Public contact form: customers can submit messages
router.post("/", contactLimiter, createMessage);

// Only administrators can reply to customer messages
router.patch(
  "/:id/response",
  requireAuth,
  requireAdmin,
  saveResponse
);

export default router;