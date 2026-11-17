import express from "express";
import { rateLimit } from "express-rate-limit";
import {
  validateCartHandler,
  createCheckoutSession,
  acceptOrder,
  declineOrder,
  requestCancelOrder,
  getOrderBySession,
} from "../controllers/checkoutController.js";
import { requireAuth, requireAdmin, optionalAuth } from "../middleware/authMiddleware.js";
import { previewDiscount } from "../controllers/checkoutController.js";


const router = express.Router();

// Limit checkout session creation to 10 requests per 15 minutes per IP
const checkoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many checkout attempts. Please try again later.",
  },
});


// Limit discount-code previews to 20 requests per 15 minutes per IP
const discountPreviewLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many discount attempts. Please try again later.",
  },
});



/**
 * Task 2: Validate cart stock, availability, and return dynamic Stripe line items.
 * Accepts Authorization Bearer token or userId in request body / query.
 */
router.post("/validate", optionalAuth, validateCartHandler);
router.get("/validate", optionalAuth, validateCartHandler);

/**
 * Task 3 (DT-489): Create Stripe Checkout Session, insert pending order, and return session URL.
 */
router.post(
  "/create-session",
  checkoutLimiter,
  optionalAuth,
  createCheckoutSession
);
// Check a code against the signed-in customer's current cart.
router.post("/preview-discount", discountPreviewLimiter, optionalAuth, previewDiscount);

/**
 * DT-543: Accept an order on hold, capture Stripe funds, purchase postage label, transition to 'accepted'.
 */
router.post("/orders/:id/accept", requireAuth, requireAdmin, acceptOrder);

/**
 * Decline an order on hold: release Stripe authorization hold, transition to 'cancelled', and notify customer.
 */
router.post("/orders/:id/decline", requireAuth, requireAdmin, declineOrder);
router.post("/orders/:id/cancel", requireAuth, requireAdmin, declineOrder);

/**
 * Customer cancellation request while order is on hold (notifies store admin).
 */
// Allow signed-in customers and guests to request cancellation
router.post(
  "/orders/:id/request-cancel",
  optionalAuth,
  requestCancelOrder
);
/**
 * Public lookup by Stripe session ID for the payment success page (works for guests).
 */
router.get("/orders/by-session/:sessionId", getOrderBySession);

export default router;
