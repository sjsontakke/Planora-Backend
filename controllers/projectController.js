const Project = require("../models/Project");
const Task = require("../models/Task");

// Create project
const createProject = async (req, res) => {
  try {
    const project = new Project({
      ...req.body,
      manager: req.user._id,
    });
    await project.save();
    res.status(201).json(project);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Get all projects
const getProjects = async (req, res) => {
  try {
    let projects;
    if (req.user.role === "admin") {
      projects = await Project.find()
        .populate("manager", "name email")
        .populate("teamMembers", "name email");
    } else if (req.user.role === "manager") {
      projects = await Project.find({
        $or: [{ manager: req.user._id }, { teamMembers: req.user._id }],
      })
        .populate("manager", "name email")
        .populate("teamMembers", "name email");
    } else {
      projects = await Project.find({ teamMembers: req.user._id })
        .populate("manager", "name email")
        .populate("teamMembers", "name email");
    }

    res.json(projects);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Get project by ID
const getProjectById = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id)
      .populate("manager", "name email")
      .populate("teamMembers", "name email");

    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    res.json(project);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Update project
const updateProject = async (req, res) => {
  try {
    const project = await Project.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    })
      .populate("manager", "name email")
      .populate("teamMembers", "name email");

    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    res.json(project);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Delete project
const deleteProject = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);

    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    // Delete all tasks associated with the project
    await Task.deleteMany({ project: req.params.id });
    await Project.findByIdAndDelete(req.params.id);

    res.json({ message: "Project and associated tasks deleted successfully" });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Get project analytics
const getProjectAnalytics = async (req, res) => {
  try {
    const projectId = req.params.id;

    const tasks = await Task.find({ project: projectId });
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(
      (task) => task.status === "completed"
    ).length;
    const inProgressTasks = tasks.filter(
      (task) => task.status === "in-progress"
    ).length;
    const todoTasks = tasks.filter((task) => task.status === "todo").length;

    const highPriorityTasks = tasks.filter(
      (task) => task.priority === "high"
    ).length;
    const mediumPriorityTasks = tasks.filter(
      (task) => task.priority === "medium"
    ).length;
    const lowPriorityTasks = tasks.filter(
      (task) => task.priority === "low"
    ).length;

    const overdueTasks = tasks.filter(
      (task) =>
        new Date(task.dueDate) < new Date() && task.status !== "completed"
    ).length;

    res.json({
      totalTasks,
      completedTasks,
      inProgressTasks,
      todoTasks,
      highPriorityTasks,
      mediumPriorityTasks,
      lowPriorityTasks,
      overdueTasks,
      completionRate: totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0,
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

module.exports = {
  createProject,
  getProjects,
  getProjectById,
  updateProject,
  deleteProject,
  getProjectAnalytics,
};
