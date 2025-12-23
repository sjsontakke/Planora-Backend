const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const http = require("http");
const socketIo = require("socket.io");
const path = require("path");
const fs = require("fs");

const app = express();
const server = http.createServer(app);

// Socket.io configuration
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST", "PUT", "DELETE"],
  },
});

// Middleware
app.use(cors());
app.use(express.json());

// Serve uploaded files statically
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log("✅ Uploads directory created");
}
app.use("/uploads", express.static(uploadsDir));

// Test routes
app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    database:
      mongoose.connection.readyState === 1 ? "Connected" : "Disconnected",
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/test", (req, res) => {
  res.json({
    message: "Backend is working!",
    timestamp: new Date().toISOString(),
  });
});

// Debug: List all loaded routes
app.get("/api/debug/routes", (req, res) => {
  const routes = [];
  app._router.stack.forEach((middleware) => {
    if (middleware.route) {
      // Routes registered directly on app
      routes.push({
        path: middleware.route.path,
        methods: Object.keys(middleware.route.methods),
      });
    } else if (middleware.name === "router") {
      // Router middleware
      middleware.handle.stack.forEach((handler) => {
        if (handler.route) {
          routes.push({
            path: handler.route.path,
            methods: Object.keys(handler.route.methods),
          });
        }
      });
    }
  });
  res.json({ routes });
});

// Import and use routes with error handling
console.log("🔄 Loading routes...");

try {
  const authRoutes = require("./routes/authRoutes");
  app.use("/api/auth", authRoutes);
  console.log("✅ Auth routes loaded");
} catch (error) {
  console.error("❌ Failed to load auth routes:", error.message);
}

try {
  const taskRoutes = require("./routes/taskRoutes");
  app.use("/api/tasks", taskRoutes);
  console.log("✅ Task routes loaded");
} catch (error) {
  console.error("❌ Failed to load task routes:", error.message);
}

try {
  const projectRoutes = require("./routes/projectRoutes");
  app.use("/api/projects", projectRoutes);
  console.log("✅ Project routes loaded");
} catch (error) {
  console.error("❌ Failed to load project routes:", error.message);
}

try {
  const userRoutes = require("./routes/userRoutes");
  app.use("/api/users", userRoutes);
  console.log("✅ User routes loaded");
} catch (error) {
  console.error("❌ Failed to load user routes:", error.message);
}

try {
  const notificationRoutes = require("./routes/notificationRoutes");
  app.use("/api/notifications", notificationRoutes);
  console.log("✅ Notification routes loaded");
} catch (error) {
  console.error("❌ Failed to load notification routes:", error.message);
}

// Add a direct test route for auth
app.post("/api/auth/register-test", (req, res) => {
  console.log("✅ Direct register test route called");
  res.json({
    message: "Direct register route is working!",
    data: req.body,
  });
});

// Global search endpoint
app.get("/api/search", async (req, res) => {
  try {
    const { q: query, type } = req.query;

    if (!query || query.length < 2) {
      return res
        .status(400)
        .json({ message: "Search query must be at least 2 characters long" });
    }

    const searchResults = {
      tasks: [],
      projects: [],
      users: [],
    };

    // Search tasks
    if (!type || type === "tasks") {
      const Task = require("./models/Task");
      const tasks = await Task.find({
        $or: [
          { title: { $regex: query, $options: "i" } },
          { description: { $regex: query, $options: "i" } },
        ],
      })
        .populate("project", "name")
        .populate("assignedTo", "name")
        .limit(10);

      searchResults.tasks = tasks;
    }

    // Search projects
    if (!type || type === "projects") {
      const Project = require("./models/Project");
      const projects = await Project.find({
        $or: [
          { name: { $regex: query, $options: "i" } },
          { description: { $regex: query, $options: "i" } },
        ],
      })
        .populate("manager", "name")
        .limit(10);

      searchResults.projects = projects;
    }

    // Search users
    if (!type || type === "users") {
      const User = require("./models/User");
      const users = await User.find({
        $or: [
          { name: { $regex: query, $options: "i" } },
          { email: { $regex: query, $options: "i" } },
        ],
        isActive: true,
      })
        .select("name email role avatar")
        .limit(10);

      searchResults.users = users;
    }

    res.json(searchResults);
  } catch (error) {
    console.error("Search error:", error);
    res.status(500).json({ message: "Search failed", error: error.message });
  }
});

// Socket.io for real-time updates
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("join-project", (projectId) => {
    socket.join(projectId);
    console.log(`User ${socket.id} joined project ${projectId}`);
  });

  socket.on("join-user", (userId) => {
    socket.join(`user_${userId}`);
    console.log(`User ${socket.id} joined user room: ${userId}`);
  });

  socket.on("task-updated", (data) => {
    socket.to(data.projectId).emit("task-update", data);

    // Notify assigned user if different from updater
    if (data.assignedTo && data.assignedTo !== data.updatedBy) {
      socket.to(`user_${data.assignedTo}`).emit("task-assigned", data);
    }
  });

  socket.on("task-created", (data) => {
    socket.to(data.projectId).emit("new-task", data);

    // Notify assigned user
    if (data.assignedTo) {
      socket.to(`user_${data.assignedTo}`).emit("task-assigned", data);
    }
  });

  socket.on("notification-created", (data) => {
    socket.to(`user_${data.userId}`).emit("new-notification", data);
  });

  socket.on("file-uploaded", (data) => {
    socket.to(data.projectId).emit("new-attachment", data);
    if (data.assignedTo) {
      socket.to(`user_${data.assignedTo}`).emit("file-added", data);
    }
  });

  socket.on("time-tracking-started", (data) => {
    socket.to(data.projectId).emit("timer-started", data);
  });

  socket.on("time-tracking-stopped", (data) => {
    socket.to(data.projectId).emit("timer-stopped", data);
  });

  socket.on("user-status-updated", (data) => {
    socket.to(data.projectId).emit("user-status-changed", data);
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error("Error:", error.message);

  if (error.name === "ValidationError") {
    return res.status(400).json({
      message: "Validation Error",
      errors: Object.values(error.errors).map((e) => e.message),
    });
  }

  if (error.name === "CastError") {
    return res.status(400).json({
      message: "Invalid ID format",
    });
  }

  if (error.code === 11000) {
    return res.status(400).json({
      message: "Duplicate field value entered",
    });
  }

  res.status(500).json({
    message: "Server Error",
    error: process.env.NODE_ENV === "production" ? {} : error.message,
  });
});

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({
    message: "Route not found",
    path: req.originalUrl,
  });
});

// MongoDB Connection
const MONGODB_URI =
  "mongodb+srv://swapnil2002:swapnil123@cluster25.01ug60l.mongodb.net/taskflow?retryWrites=true&w=majority";

console.log("🔗 Attempting to connect to MongoDB...");

mongoose
  .connect(MONGODB_URI)
  .then(() => {
    console.log("✅ MongoDB connected successfully");
    console.log("📊 Database:", mongoose.connection.name);
    console.log("🎯 Host:", mongoose.connection.host);
  })
  .catch((error) => {
    console.error("❌ MongoDB connection failed:", error.message);
    process.exit(1);
  });

// MongoDB connection events
mongoose.connection.on("error", (err) => {
  console.error("MongoDB connection error:", err);
});

mongoose.connection.on("disconnected", () => {
  console.log("MongoDB disconnected");
});

mongoose.connection.on("reconnected", () => {
  console.log("MongoDB reconnected");
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🔌 Test endpoint: http://localhost:${PORT}/api/test`);
  console.log(`🐛 Debug routes: http://localhost:${PORT}/api/debug/routes`);
  console.log(`🔐 Auth test: http://localhost:${PORT}/api/auth/register-test`);
  console.log(`🔍 Search: http://localhost:${PORT}/api/search?q=test`);
  console.log(`📁 Uploads: http://localhost:${PORT}/uploads/`);
  console.log(`🔔 Notifications: http://localhost:${PORT}/api/notifications`);
});
