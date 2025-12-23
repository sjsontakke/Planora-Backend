const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(
      "mongodb+srv://swapnil2002:swapnil2002@cluster25.01ug60l.mongodb.net/taskflow?retryWrites=true&w=majority",
      {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      }
    );

    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error("Database connection error:", error.message);

    // Provide helpful debugging information
    if (error.name === "MongoServerError" && error.code === 8000) {
      console.log("\n=== MongoDB Atlas Connection Troubleshooting ===");
      console.log("1. Check if your IP is whitelisted in MongoDB Atlas");
      console.log("2. Verify your username and password");
      console.log('3. Ensure the database "taskflow" exists');
      console.log("4. Check your network connection");
      console.log("===============================================\n");
    }

    process.exit(1);
  }
};

module.exports = connectDB;
