import express from "express";
import multer from 'multer'; //Processes forms with uploaded files
import { requireAuth } from "../middleware/authMiddleware.js";
import { changeUserAddress } from "../controllers/userController.js";

const router = express.Router();

// Only authenticated users can request address updates
router.put("/:id", requireAuth, changeUserAddress);

export default router;