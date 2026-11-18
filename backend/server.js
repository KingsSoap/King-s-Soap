import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import cors from "cors";
import dotenv from "dotenv";

import messageRoutes from "./routes/messageRoutes.js";
import productRoutes from "./routes/productRoutes.js";
import checkoutRoutes from "./routes/checkoutRoutes.js";
import { handleStripeWebhook } from "./controllers/webhookController.js";
import discountRoutes from "./routes/discountRoutes.js";



dotenv.config(); // Use port from .env file if available, otherwise use default port 3000

const app = express(); // Main Express application instance
const PORT = process.env.PORT || 3000;

// Allow requests from the local frontend and production website
const allowedOrigins = [
  "http://localhost:5173",
  "https://shopkingssoap.com",
  "https://www.shopkingssoap.com",
];

app.use(cors({
  origin: allowedOrigins,
}));


app.use(helmet()); // For security headers

// Detailed request logging in development only
if (process.env.NODE_ENV !== "production") {
  app.use(morgan("dev"));
}

// DT-490: Mount raw Stripe webhook handler BEFORE express.json()
app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  handleStripeWebhook
);

// Parse JSON request bodies for all other API routes
app.use(express.json());

app.use("/api/products", productRoutes);
app.use("/api/checkout", checkoutRoutes);
app.use("/api/discounts", discountRoutes);
app.use("/api/messages", messageRoutes);


// Global error handler - prevent internal errors from reaching customers
app.use((err, req, res, next) => {
  console.error(
    "Unhandled API error:",
    err?.code || err?.type || "Unknown error"
  );

  const status =
    Number.isInteger(err.status) &&
    err.status >= 400 &&
    err.status < 600
      ? err.status
      : 500;

  return res.status(status).json({
    success: false,
    message:
      status >= 500
        ? "An unexpected server error occurred. Please try again."
        : "The request could not be processed.",
  });
});

if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log("Server is running on port " + PORT);
  });
}

export default app;