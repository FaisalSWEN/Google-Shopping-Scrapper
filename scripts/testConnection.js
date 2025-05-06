/**
 * Test script to verify MongoDB connection.
 * 
 * This script connects to the MongoDB database and displays connection details
 * and available collections.
 */

import connectDB from "../config/database.js";
import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

// Get directory name for the current module
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Updated path to config.env in config directory
const configPath = path.join(__dirname, "..", "config", "config.env");
dotenv.config({ path: configPath });

async function testConnection() {
  try {
    console.log("🔄 Testing database connection...");
    console.log(`📁 Using config from: ${configPath}`);

    const conn = await connectDB();

    console.log("✅ Connection successful!");
    console.log(`📊 Connected to MongoDB database: ${conn.connection.name}`);
    console.log(`📡 Connected to host: ${conn.connection.host}`);
    console.log(`🔌 Connected to port: ${conn.connection.port}`);

    // Get list of collections
    const collections = await mongoose.connection.db
      .listCollections()
      .toArray();

    if (collections.length === 0) {
      console.log("\n📚 No collections found in this database yet");
      console.log(
        "   Collections will be created when you add your first document"
      );
    } else {
      console.log(`\n📚 Available collections (${collections.length}):`);
      collections.forEach((collection, index) => {
        console.log(`   ${index + 1}. ${collection.name}`);
      });
    }

    console.log("\n⚡ MongoDB connection is ready to use");
  } catch (error) {
    console.error("❌ Connection test failed:", error.message);
  } finally {
    // Close the connection after testing
    if (mongoose.connection.readyState) {
      await mongoose.connection.close();
      console.log("🔒 Connection closed");
    }
    process.exit(0);
  }
}

testConnection();
