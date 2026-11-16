import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import cors from "cors";
import dotenv from "dotenv";

import messageRoutes from "./routes/messageRoutes.js";
import productRoutes from "./routes/productRoutes.js";
import userRoutes from "./routes/userRoutes.js";
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
app.use(morgan("dev")); // For logging HTTP requests to backend console

// DT-490: Mount raw Stripe webhook handler BEFORE express.json()
app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  handleStripeWebhook
);

app.use(express.json()); // For parsing JSON request bodies

app.use("/api/products", productRoutes);//Connects request from the frontend to the backend routes in productRoutes.js
app.use("/api/users", userRoutes);//Connects request from the frontend to the backend routes in productRoutes.js
app.use("/api/checkout", checkoutRoutes); // Checkout endpoints: validation, sessions, orders
app.use("/api/discounts", discountRoutes); //Require a signed in user for discount requests
app.use("/api/messages", messageRoutes);

if (process.env.NODE_ENV !== "test") {
    app.listen(PORT, () => {
        console.log("Server is running on port " + PORT);
    });
}

export default app;