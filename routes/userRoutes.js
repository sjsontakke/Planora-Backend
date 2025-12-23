const express = require("express");
const User = require("../models/User"); // ADD THIS IMPORT
const { protect, authorize } = require("../middleware/authMiddleware");
const {
  updateProfile,
  getProfile,
  searchUsers,
} = require("../controllers/userController");

const router = express.Router();

// Apply protect middleware to all routes
router.use(protect);

// Profile routes (accessible to all authenticated users)
router.get("/profile", getProfile);
router.put("/profile", updateProfile);

// Search users (accessible to all authenticated users)
router.get("/search", searchUsers);

// Get all users (CHANGE THIS - allow all authenticated users)
router.get("/", async (req, res) => {
  try {
    // Get active users, exclude passwords, and don't include the current user
    const users = await User.find({
      isActive: true,
      _id: { $ne: req.user._id }, // Exclude current user
    }).select("name email role avatar");
    res.json(users);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

module.exports = router;
