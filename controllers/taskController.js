const Task = require("../models/Task");
const Notification = require("../models/Notification");

// Create task
const createTask = async (req, res) => {
  try {
    console.log("Creating task with data:", req.body);

    const task = new Task({
      ...req.body,
      assignedBy: req.user._id,
    });

    await task.save();

    await task.populate("assignedTo", "name email");
    await task.populate("assignedBy", "name email");

    console.log("Task created successfully:", task);

    // Create notification for assigned user
    if (task.assignedTo._id.toString() !== req.user._id.toString()) {
      await Notification.create({
        user: task.assignedTo._id,
        type: "task_assigned",
        title: "New Task Assigned",
        message: `${req.user.name} assigned you a new task: ${task.title}`,
        relatedTask: task._id,
        relatedProject: task.project,
      });
    }

    res.status(201).json(task);
  } catch (error) {
    console.error("Task creation error:", error);
    res.status(400).json({ message: error.message });
  }
};

// Get all tasks for a project
const getProjectTasks = async (req, res) => {
  try {
    const tasks = await Task.find({ project: req.params.projectId })
      .populate("assignedTo", "name email")
      .populate("assignedBy", "name email")
      .populate("comments.user", "name")
      .populate("dependsOn", "title status")
      .populate("blocks", "title status")
      .populate("timeEntries.user", "name")
      .sort({ createdAt: -1 });

    res.json(tasks);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Get user's tasks
const getUserTasks = async (req, res) => {
  try {
    const tasks = await Task.find({ assignedTo: req.user._id })
      .populate("project", "name")
      .populate("assignedBy", "name")
      .populate("comments.user", "name")
      .populate("dependsOn", "title status")
      .sort({ createdAt: -1 });

    res.json(tasks);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Update task - WITH EMPLOYEE PERMISSIONS
const updateTask = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    // Check permissions
    if (req.user.role === "employee") {
      // Employees can only update their own tasks
      if (task.assignedTo.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          message: "You can only update tasks assigned to you",
        });
      }

      // Employees can only update status field
      const allowedFields = ["status"];
      const updateData = {};

      Object.keys(req.body).forEach((key) => {
        if (allowedFields.includes(key)) {
          updateData[key] = req.body[key];
        }
      });

      // Validate status value
      if (
        updateData.status &&
        !["todo", "in-progress", "completed"].includes(updateData.status)
      ) {
        return res.status(400).json({
          message:
            "Invalid status value. Must be: todo, in-progress, or completed",
        });
      }

      const updatedTask = await Task.findByIdAndUpdate(
        req.params.id,
        updateData,
        { new: true, runValidators: true }
      )
        .populate("assignedTo", "name email")
        .populate("assignedBy", "name email")
        .populate("comments.user", "name")
        .populate("dependsOn", "title status")
        .populate("blocks", "title status")
        .populate("timeEntries.user", "name");

      // Create notification if status changed
      if (updateData.status && updateData.status !== task.status) {
        await Notification.create({
          user: task.assignedBy, // Notify the manager/admin who assigned the task
          type: "task_status_updated",
          title: "Task Status Updated",
          message: `${req.user.name} updated task "${task.title}" from ${task.status} to ${updateData.status}`,
          relatedTask: task._id,
          relatedProject: task.project,
          metadata: {
            oldStatus: task.status,
            newStatus: updateData.status,
            updatedBy: req.user.name,
          },
        });
      }

      return res.json(updatedTask);
    }

    // Admin/Manager can update all fields
    const updatedTask = await Task.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    })
      .populate("assignedTo", "name email")
      .populate("assignedBy", "name email")
      .populate("comments.user", "name")
      .populate("dependsOn", "title status")
      .populate("blocks", "title status")
      .populate("timeEntries.user", "name");

    // Create notification if status changed
    if (req.body.status && req.body.status !== task.status) {
      await Notification.create({
        user: task.assignedTo,
        type: "task_updated",
        title: "Task Status Updated",
        message: `${req.user.name} updated task "${task.title}" to ${req.body.status}`,
        relatedTask: task._id,
        relatedProject: task.project,
        metadata: {
          oldStatus: task.status,
          newStatus: req.body.status,
        },
      });
    }

    res.json(updatedTask);
  } catch (error) {
    console.error("Update task error:", error);
    res.status(400).json({ message: error.message });
  }
};

// Add comment to task
const addComment = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    // Check if employee is trying to comment on someone else's task
    if (
      req.user.role === "employee" &&
      task.assignedTo.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({
        message: "You can only comment on tasks assigned to you",
      });
    }

    task.comments.push({
      user: req.user._id,
      text: req.body.text,
    });

    await task.save();
    await task.populate("comments.user", "name");

    // Create notification for task assignee (if not the commenter)
    if (task.assignedTo.toString() !== req.user._id.toString()) {
      await Notification.create({
        user: task.assignedTo,
        type: "comment_added",
        title: "New Comment",
        message: `${req.user.name} commented on task: ${task.title}`,
        relatedTask: task._id,
        relatedProject: task.project,
      });
    }

    // Also notify the task creator if different from assignee and commenter
    if (
      task.assignedBy.toString() !== req.user._id.toString() &&
      task.assignedBy.toString() !== task.assignedTo.toString()
    ) {
      await Notification.create({
        user: task.assignedBy,
        type: "comment_added",
        title: "New Comment",
        message: `${req.user.name} commented on task: ${task.title}`,
        relatedTask: task._id,
        relatedProject: task.project,
      });
    }

    res.json(task);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Delete task
const deleteTask = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    // Only admin/manager can delete tasks
    if (req.user.role === "employee") {
      return res.status(403).json({
        message: "You don't have permission to delete tasks",
      });
    }

    await Task.findByIdAndDelete(req.params.id);

    // Create notification for the assigned user
    await Notification.create({
      user: task.assignedTo,
      type: "task_deleted",
      title: "Task Deleted",
      message: `${req.user.name} deleted task: ${task.title}`,
      relatedProject: task.project,
    });

    res.json({ message: "Task deleted successfully" });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Upload attachment (placeholder)
const uploadAttachment = async (req, res) => {
  try {
    res.status(501).json({
      message:
        "File upload feature will be available soon. Please install multer first.",
      instructions: "Run: npm install multer in the backend directory",
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Delete attachment (placeholder)
const deleteAttachment = async (req, res) => {
  try {
    res.status(501).json({
      message: "File deletion feature will be available soon.",
      instructions: "Run: npm install multer in the backend directory",
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Add task dependency
const addDependency = async (req, res) => {
  try {
    const { dependsOn } = req.body;
    const task = await Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    // Only admin/manager can add dependencies
    if (req.user.role === "employee") {
      return res.status(403).json({
        message: "You don't have permission to add task dependencies",
      });
    }

    // Check if dependency already exists
    if (task.dependsOn.includes(dependsOn)) {
      return res.status(400).json({ message: "Dependency already exists" });
    }

    // Add dependency
    task.dependsOn.push(dependsOn);

    // Update the blocking task
    const blockingTask = await Task.findById(dependsOn);
    if (blockingTask && !blockingTask.blocks.includes(task._id)) {
      blockingTask.blocks.push(task._id);
      await blockingTask.save();
    }

    await task.save();
    await task.populate("dependsOn", "title status");
    await task.populate("blocks", "title status");

    // Create notification
    await Notification.create({
      user: task.assignedTo,
      type: "dependency_added",
      title: "Task Dependency Added",
      message: `Task "${task.title}" now depends on "${blockingTask.title}"`,
      relatedTask: task._id,
      relatedProject: task.project,
    });

    res.json(task);
  } catch (error) {
    console.error("Add dependency error:", error);
    res.status(400).json({ message: error.message });
  }
};

// Remove task dependency
const removeDependency = async (req, res) => {
  try {
    const { dependsOn } = req.body;
    const task = await Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    // Only admin/manager can remove dependencies
    if (req.user.role === "employee") {
      return res.status(403).json({
        message: "You don't have permission to remove task dependencies",
      });
    }

    // Remove dependency
    task.dependsOn = task.dependsOn.filter(
      (dep) => dep.toString() !== dependsOn
    );

    // Update the blocking task
    const blockingTask = await Task.findById(dependsOn);
    if (blockingTask) {
      blockingTask.blocks = blockingTask.blocks.filter(
        (block) => block.toString() !== task._id.toString()
      );
      await blockingTask.save();
    }

    await task.save();
    await task.populate("dependsOn", "title status");
    await task.populate("blocks", "title status");

    res.json(task);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Start time tracking
const startTimeTracking = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    // Employees can only track time on their own tasks
    if (
      req.user.role === "employee" &&
      task.assignedTo.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({
        message: "You can only track time on tasks assigned to you",
      });
    }

    // Check if user already has an active timer
    const activeEntry = task.timeEntries.find(
      (entry) =>
        entry.user.toString() === req.user._id.toString() && !entry.endTime
    );

    if (activeEntry) {
      return res
        .status(400)
        .json({ message: "Timer already running for this task" });
    }

    const timeEntry = {
      user: req.user._id,
      startTime: new Date(),
      description: req.body.description || "Working on task",
    };

    task.timeEntries.push(timeEntry);
    await task.save();

    res.json({ message: "Timer started", timeEntry });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Stop time tracking
const stopTimeTracking = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    // Employees can only stop their own timers
    if (
      req.user.role === "employee" &&
      task.assignedTo.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({
        message: "You can only stop timers on tasks assigned to you",
      });
    }

    const activeEntry = task.timeEntries.find(
      (entry) =>
        entry.user.toString() === req.user._id.toString() && !entry.endTime
    );

    if (!activeEntry) {
      return res.status(400).json({ message: "No active timer found" });
    }

    activeEntry.endTime = new Date();
    activeEntry.duration = Math.round(
      (activeEntry.endTime - activeEntry.startTime) / (1000 * 60)
    ); // in minutes

    // Update total time spent
    task.totalTimeSpent = task.timeEntries.reduce((total, entry) => {
      return total + (entry.duration || 0);
    }, 0);

    await task.save();

    await task.populate("timeEntries.user", "name");

    res.json({
      message: "Timer stopped",
      timeEntry: activeEntry,
      totalTimeSpent: task.totalTimeSpent,
      task: task,
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Get task dependencies
const getTaskDependencies = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id)
      .populate("dependsOn", "title status priority dueDate")
      .populate("blocks", "title status priority dueDate");

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    res.json({
      dependsOn: task.dependsOn,
      blocks: task.blocks,
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Get task time entries
const getTaskTimeEntries = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id)
      .populate("timeEntries.user", "name email")
      .select("timeEntries totalTimeSpent");

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    res.json({
      timeEntries: task.timeEntries,
      totalTimeSpent: task.totalTimeSpent,
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Get employee's tasks with simple status (for employee dashboard)
const getEmployeeTasks = async (req, res) => {
  try {
    if (req.user.role !== "employee") {
      return res.status(403).json({
        message: "This endpoint is only for employees",
      });
    }

    const tasks = await Task.find({ assignedTo: req.user._id })
      .populate("project", "name")
      .populate("assignedBy", "name")
      .populate("comments.user", "name")
      .select(
        "title description status priority dueDate project assignedBy comments createdAt"
      )
      .sort({ createdAt: -1 });

    res.json(tasks);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Update task status only (simplified for employees)
const updateTaskStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const task = await Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    // Employees can only update their own tasks
    if (
      req.user.role === "employee" &&
      task.assignedTo.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({
        message: "You can only update tasks assigned to you",
      });
    }

    // Validate status
    if (!["todo", "in-progress", "completed"].includes(status)) {
      return res.status(400).json({
        message: "Invalid status. Must be: todo, in-progress, or completed",
      });
    }

    const oldStatus = task.status;
    task.status = status;
    await task.save();

    await task.populate("assignedTo", "name email");
    await task.populate("assignedBy", "name email");

    // Create notification for manager/admin
    if (oldStatus !== status) {
      await Notification.create({
        user: task.assignedBy,
        type: "task_status_updated",
        title: "Task Status Changed",
        message: `${req.user.name} changed task "${task.title}" from ${oldStatus} to ${status}`,
        relatedTask: task._id,
        relatedProject: task.project,
        metadata: {
          oldStatus,
          newStatus: status,
          updatedBy: req.user.name,
        },
      });
    }

    res.json({
      message: "Task status updated successfully",
      task: {
        _id: task._id,
        title: task.title,
        status: task.status,
        oldStatus,
        updatedBy: req.user.name,
      },
    });
  } catch (error) {
    console.error("Update task status error:", error);
    res.status(400).json({ message: error.message });
  }
};

module.exports = {
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
  updateTaskStatus, // MAKE SURE THIS IS INCLUDED
};
