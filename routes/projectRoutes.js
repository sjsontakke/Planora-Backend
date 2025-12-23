const express = require("express");
const {
  createProject,
  getProjects,
  getProjectById,
  updateProject,
  deleteProject,
  getProjectAnalytics,
} = require("../controllers/projectController");
const { protect, authorize } = require("../middleware/authMiddleware");

const router = express.Router();

// Apply protect middleware to all routes
router.use(protect);

router.post("/", authorize("admin", "manager"), createProject);
router.get("/", getProjects);
router.get("/:id", getProjectById);
router.put("/:id", authorize("admin", "manager"), updateProject);
router.delete("/:id", authorize("admin"), deleteProject);
router.get("/:id/analytics", getProjectAnalytics);

module.exports = router;
