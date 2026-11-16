import express from "express";
import { getAllDiscounts, getDiscountById, createDiscount, updateDiscount, archiveDiscount } from "../controllers/discountController.js";
import { requireTokenAuth, requireAdmin } from "../middleware/authMiddleware.js";

const router = express.Router();

// Only administrators can retrieve the discount list
router.get("/", requireTokenAuth, requireAdmin, getAllDiscounts);

// Only administrators can retrieve a discount's saved values
router.get("/:id", requireTokenAuth, requireAdmin, getDiscountById);

// Only administrators can create discounts
router.post("/", requireTokenAuth, requireAdmin, createDiscount);

// Only administrators can update discounts
router.patch("/:id", requireTokenAuth, requireAdmin, updateDiscount);

// Only administrators can archive discounts
router.patch("/:id/archive", requireTokenAuth, requireAdmin, archiveDiscount);

export default router;