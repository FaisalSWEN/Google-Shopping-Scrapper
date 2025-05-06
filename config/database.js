/**
 * Handles database connection using Mongoose.
 *
 * Loads environment variables from config.env, creates the connection to MongoDB Atlas, and exports the connection function for use in other files.
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

// Get directory name for the current module
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

// Configure dotenv to use only config.env
const configPath = path.join(rootDir, "config.env");
dotenv.config({ path: configPath });

// Default configuration values (used if not specified in config.env)
export const config = {
  MAX_CLICK_ATTEMPTS: process.env.MAX_CLICK_ATTEMPTS
    ? parseInt(process.env.MAX_CLICK_ATTEMPTS, 10)
    : 7,
  DEFAULT_CLICK_DELAY: process.env.DEFAULT_CLICK_DELAY
    ? parseInt(process.env.DEFAULT_CLICK_DELAY, 10)
    : 1500,
};

// Connect to MongoDB
const connectDB = async () => {
  try {
    // Check for required environment variables
    if (!process.env.DATABASE_TESTING || !process.env.DATABASE_PASSWORD) {
      throw new Error(
        "DATABASE_TESTING or DATABASE_PASSWORD is not defined in config.env"
      );
    }

    // Replace <PASSWORD> placeholder with actual password
    const DB = process.env.DATABASE_TESTING.replace(
      "<PASSWORD>",
      process.env.DATABASE_PASSWORD
    );

    // Connect without deprecated options
    const conn = await mongoose.connect(DB);

    console.log(`📊 MongoDB Connected: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    console.error(`❌ Error connecting to MongoDB: ${error.message}`);
    process.exit(1);
  }
};

export default connectDB;
