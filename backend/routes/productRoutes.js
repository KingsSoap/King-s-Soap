import express from 'express';
import multer from 'multer'; //Processes forms with uploaded files
import { getAllProducts, createProduct, addProductImages, deleteProductImage, deleteProduct } from '../controllers/productController.js'; //Controller functions for handling product-related requests
// Import authentication and administrator authorization middleware
import { requireAuth, requireAdmin } from '../middleware/authMiddleware.js';

const router = express.Router();

// Allowed image formats
const allowedImageTypes = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
];

// Configure image uploads
const upload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB per image
  },

  fileFilter: (req, file, cb) => {
    if (allowedImageTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only JPG, PNG, and WebP images are allowed."));
    }
  },
});

//Display all the products
router.get('/', getAllProducts); //When a GET request is made to the root path of this router, the getAllProducts function will be called to handle the request and send back a response with all products

//Create a new product - Admin only
router.post(
  '/',
  requireAuth,
  requireAdmin,
  upload.array("images"),
  createProduct
);

//Add multiple images to an existing product - Admin only
router.post(
  "/:id/images",
  requireAuth,
  requireAdmin,
  upload.array("images"),
  addProductImages
);

//Delete an image from an existing product - Admin only
router.delete(
  "/:id/images/:imageId",
  requireAuth,
  requireAdmin,
  deleteProductImage
);

//Delete a product - Admin only
router.delete(
  '/:id',
  requireAuth,
  requireAdmin,
  deleteProduct
);

// Handle errors from Multer image uploads
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        message: "Each image must be 5 MB or smaller.",
      });
    }

    return res.status(400).json({
      message: "Invalid image upload.",
    });
  }

  if (err.message === "Only JPG, PNG, and WebP images are allowed.") {
    return res.status(400).json({
      message: err.message,
    });
  }

  next(err);
});

export default router; //Make completed router object available to other files