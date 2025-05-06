/**
 * Product Updater Script
 * 
 * Fetches all existing products from the database and re-scrapes each one to update
 * prices, reviews, and other information. This helps maintain the database with
 * the most current product data.
 */

import { getAllProducts } from "./services/productService.js";
import scrapeProduct from "./scrapper.js";
import connectDB from "./config/database.js";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

// Get directory name for current module
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load environment config
const configPath = path.join(__dirname, "config", "config.env");
dotenv.config({ path: configPath });

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, "logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

/**
 * Log messages to both console and a log file
 * @param {string} message - The message to log
 * @param {boolean} error - Whether this is an error message
 */
function log(message, error = false) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  
  // Log to console
  if (error) {
    console.error(logMessage);
  } else {
    console.log(logMessage);
  }
  
  // Log to file
  const logFile = path.join(logsDir, `updater_${new Date().toISOString().split('T')[0]}.log`);
  fs.appendFileSync(logFile, logMessage + "\n");
}

/**
 * Delays execution for specified milliseconds
 * @param {number} ms - Time to delay in milliseconds
 * @returns {Promise<void>}
 */
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Main function to update all products
 */
async function updateAllProducts() {
  try {
    // Connect to database
    await connectDB();
    log("📊 Connected to MongoDB database");
    
    // Get all products
    log("🔍 Fetching products from database...");
    const products = await getAllProducts();
    
    if (products.length === 0) {
      log("⚠️ No products found in database", true);
      return;
    }
    
    log(`✅ Found ${products.length} products to update`);
    
    // Settings for updates
    const delayBetweenProducts = 30000; // 30 seconds between products to avoid rate limiting
    const options = {
      maxClicksStores: 2,
      maxClicksReviews: 5,
      clickDelay: 1500
    };
    
    // Process each product
    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      log(`\n🔄 Updating product ${i + 1}/${products.length}: ${product.product_name}`);
      
      try {
        // Use the source URL from the saved product
        const url = product.source_url;
        if (!url) {
          log(`⚠️ No source URL found for product: ${product.productId}`, true);
          continue;
        }
        
        log(`🌐 URL: ${url}`);
        
        // Add product's existing category and brand to options to ensure consistency
        const updateOptions = {
          ...options,
          category: product.category || undefined,
          brand: product.brand || undefined
        };
        
        // Run the scraper on this product
        const updatedProduct = await scrapeProduct(url, updateOptions);
        log(`✅ Successfully updated: ${updatedProduct.product_name}`);
        log(`   - Current price range: ${updatedProduct.lowestPrice} - ${updatedProduct.highestPrice} SAR`);
        log(`   - Stores found: ${updatedProduct.stores?.length || 0}`);
        log(`   - Reviews count: ${updatedProduct.reviews?.length || 0}`);
        
        // Add delay before next product to avoid rate limiting
        if (i < products.length - 1) {
          log(`⏳ Waiting ${delayBetweenProducts/1000} seconds before next product...`);
          await delay(delayBetweenProducts);
        }
      } catch (error) {
        log(`❌ Error updating product ${product.productId}: ${error.message}`, true);
        // Continue with the next product even if this one fails
        if (i < products.length - 1) {
          log(`⏳ Waiting ${delayBetweenProducts/1000} seconds before next product...`);
          await delay(delayBetweenProducts);
        }
      }
    }
    
    log("\n🎉 Product update process completed");
    
  } catch (error) {
    log(`🔴 Fatal error: ${error.message}`, true);
  } finally {
    // Exit process with success code (or set a timeout to allow pending operations to complete)
    log("👋 Exiting updater script");
    setTimeout(() => process.exit(0), 3000);
  }
}

// Check if this file is being run directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // Parse command line arguments
  const args = process.argv.slice(2);
  
  // Check for help flag
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Product Updater - Updates all products in the database with fresh data

Usage:
  node updater.js [options]

Options:
  --help, -h     Show this help message
  --limit=N      Limit the update to N products
  --offset=N     Start from the Nth product
  --category=X   Only update products in category X
  --brand=Y      Only update products of brand Y
    `);
    process.exit(0);
  }
  
  // Execute the main function
  updateAllProducts()
    .then(() => {
      console.log("✅ Update process completed successfully");
      // Exit after direct execution
      setTimeout(() => process.exit(0), 2000);
    })
    .catch((error) => {
      console.error("❌ Update process failed");
      process.exit(1);
    });
} else {
  // Export the function for use in other files
  console.log("📦 Exporting updateAllProducts function");
}

export default updateAllProducts;