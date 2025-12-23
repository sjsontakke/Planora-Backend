const User = require("../models/User");

// Update user profile
const updateProfile = async (req, res) => {
  try {
    const { name, avatar, theme } = req.body;

    // Validate theme value
    if (theme && !["light", "dark"].includes(theme)) {
      return res
        .status(400)
        .json({ message: "Theme must be either 'light' or 'dark'" });
    }

    const updateData = {
      name: name?.trim(),
      avatar: avatar || "",
      theme: theme || "light",
    };

    // Remove undefined fields
    Object.keys(updateData).forEach((key) => {
      if (updateData[key] === undefined) {
        delete updateData[key];
      }
    });

    const user = await User.findByIdAndUpdate(req.user._id, updateData, {
      new: true,
      runValidators: true,
    }).select("-password");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json(user);
  } catch (error) {
    console.error("Update profile error:", error);

    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({ message: messages.join(", ") });
    }

    res.status(400).json({ message: error.message });
  }
};

// Get user profile
const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("-password");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json(user);
  } catch (error) {
    console.error("Get profile error:", error);
    res.status(400).json({ message: error.message });
  }
};

// Search users
const searchUsers = async (req, res) => {
  try {
    const { query } = req.query;

    if (!query || query.length < 2) {
      return res
        .status(400)
        .json({ message: "Search query must be at least 2 characters long" });
    }

    const users = await User.find({
      $or: [
        { name: { $regex: query, $options: "i" } },
        { email: { $regex: query, $options: "i" } },
      ],
      isActive: true,
    })
      .select("name email role avatar")
      .limit(10);

    res.json(users);
  } catch (error) {
    console.error("Search users error:", error);
    res.status(400).json({ message: error.message });
  }
};

module.exports = {
  updateProfile,
  getProfile,
  searchUsers,
};
