import connectDB from "../config/database.js";
import { getAllProducts } from "../services/productService.js";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

// Get directory name for the current module
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

// Use only config.env
const configPath = path.join(rootDir, "config.env");
dotenv.config({ path: configPath });

async function displayProducts() {
  try {
    // Connect to database
    await connectDB();

    console.log("🔍 Fetching products from database...");
    const products = await getAllProducts();

    if (products.length === 0) {
      console.log("⚠️ No products found in the database");
      return;
    }

    console.log(`\n✅ Found ${products.length} products:`);
    console.log("-------------------------------------------");

    products.forEach((product, index) => {
      console.log(`${index + 1}. ${product.product_name}`);
      console.log(`   ID: ${product.productId}`);
      console.log(`   Type: ${product.product_type || "N/A"}`);
      console.log(
        `   Price range: ${product.lowestPrice} - ${product.highestPrice} SAR`
      );
      console.log(`   Average price: ${product.averagePrice} SAR`);
      console.log(`   Stores: ${product.stores.length}`);
      console.log(`   Reviews: ${product.reviews.length}`);
      console.log(
        `   Last updated: ${new Date(product.updatedAt).toLocaleString()}`
      );

      // Show latest price history entry
      if (product.priceHistory && product.priceHistory.length > 0) {
        const latest = product.priceHistory[product.priceHistory.length - 1];
        console.log(
          `   Latest price scan: ${new Date(latest.date).toLocaleString()} - ${
            latest.lowestPrice
          } SAR`
        );
      }

      console.log("-------------------------------------------");
    });
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
  } finally {
    // Allow time for any pending operations to complete
    setTimeout(() => process.exit(0), 1000);
  }
}

displayProducts();
