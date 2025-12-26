const express = require("express");
const {
  createTask,
  getProjectTasks,
  getUserTasks,
  updateTask,
  addComment,
  deleteTask,
  uploadAttachment,
  deleteAttachment,
  addDependency,
  removeDependency,
  startTimeTracking,
  stopTimeTracking,
  getTaskDependencies,
  getTaskTimeEntries,
  getEmployeeTasks,
  updateTaskStatus,
} = require("../controllers/taskController");
const { protect, authorize } = require("../middleware/authMiddleware");

const router = express.Router();

// Apply protect middleware to all routes
router.use(protect);

// Test route
router.get("/test", (req, res) => {
  res.json({ message: "Task routes are working!" });
});

// Employee specific routes
router.get("/employee/my-tasks", getEmployeeTasks);
router.patch("/:id/status", updateTaskStatus); // ADD THIS LINE

// Regular task routes
router.post("/", authorize("admin", "manager"), createTask);
router.get("/project/:projectId", getProjectTasks);
router.get("/my-tasks", getUserTasks);
router.put("/:id", updateTask);
router.post("/:id/comment", addComment);
router.delete("/:id", authorize("admin", "manager"), deleteTask);

// File operations
router.post("/:id/attachment", uploadAttachment);
router.delete("/:id/attachment/:attachmentId", deleteAttachment);

// Task dependencies
router.post("/:id/dependency", authorize("admin", "manager"), addDependency);
router.delete(
  "/:id/dependency",
  authorize("admin", "manager"),
  removeDependency
);
router.get("/:id/dependencies", getTaskDependencies);
router.get("/employee/my-tasks", getEmployeeTasks); // ✅ This must exist

// Time tracking
router.post("/:id/start-timer", startTimeTracking);
router.post("/:id/stop-timer", stopTimeTracking);
router.get("/:id/time-entries", getTaskTimeEntries);

module.exports = router;
