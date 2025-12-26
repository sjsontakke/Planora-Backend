const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const http = require("http");
const socketIo = require("socket.io");
const path = require("path");
const fs = require("fs");

const app = express();
const server = http.createServer(app);

// ✅ FIXED CORS Configuration
const allowedOrigins = [
  "http://localhost:3000",
  "https://planora-frontend.netlify.app",
  "https://planora-frontend.netlify.app/",
];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, postman)
    if (!origin) return callback(null, true);

    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log("CORS blocked origin:", origin);
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Accept"],
};

app.use(cors(corsOptions));

// Socket.io configuration - ✅ FIXED
const io = socketIo(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  },
});

// Middleware
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
    allowedOrigins: allowedOrigins,
    environment: process.env.NODE_ENV || "development",
  });
});

app.get("/api/test", (req, res) => {
  res.json({
    message: "Backend is working!",
    timestamp: new Date().toISOString(),
  });
});

// Import and use routes with error handling
console.log("🔄 Loading routes...");

// 🔥 IMPORTANT: You must include ALL these route imports!
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
    if (data.assignedTo && data.assignedTo !== data.updatedBy) {
      socket.to(`user_${data.assignedTo}`).emit("task-assigned", data);
    }
  });

  socket.on("task-created", (data) => {
    socket.to(data.projectId).emit("new-task", data);
    if (data.assignedTo) {
      socket.to(`user_${data.assignedTo}`).emit("task-assigned", data);
    }
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error("Error:", error.message);
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

// MongoDB Connection - Add retry logic
const MONGODB_URI =
  "mongodb+srv://swapnil2002:swapnil123@cluster25.01ug60l.mongodb.net/taskflow?retryWrites=true&w=majority";

console.log("🔗 Attempting to connect to MongoDB...");

const connectWithRetry = () => {
  mongoose
    .connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    })
    .then(() => {
      console.log("✅ MongoDB connected successfully");
      console.log("📊 Database:", mongoose.connection.name);
    })
    .catch((error) => {
      console.error("❌ MongoDB connection failed:", error.message);
      console.log("🔄 Retrying in 5 seconds...");
      setTimeout(connectWithRetry, 5000);
    });
};

connectWithRetry();

// MongoDB connection events
mongoose.connection.on("error", (err) => {
  console.error("MongoDB connection error:", err);
});

mongoose.connection.on("disconnected", () => {
  console.log("MongoDB disconnected, attempting to reconnect...");
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌐 Accessible from: http://localhost:${PORT}`);
  console.log(`✅ CORS enabled for:`, allowedOrigins);
  console.log(`📡 Health check: http://localhost:${PORT}/api/health`);
});
