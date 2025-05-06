import { Product, User } from "../models/Product.js";
import crypto from "crypto";

/**
 * Generate a unique product ID from name and URL
 * @param {string} name - Product name
 * @param {string} url - Product URL
 * @returns {string} - Unique product ID
 */
const generateProductId = (name, url) => {
  // Create a hash of the URL to use as a unique identifier
  const urlHash = crypto
    .createHash("md5")
    .update(url)
    .digest("hex")
    .substring(0, 8);

  // Clean the name for use in ID
  const cleanName = name
    ? name.replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, "") // Keep Latin and Arabic characters
    : "unknown";

  return `${cleanName}-${urlHash}`;
};

/**
 * Save product data to database
 * @param {Object} productData - Scraped product data
 * @returns {Promise<Object>} - Saved product object
 */
export const saveProduct = async (productData) => {
  try {
    // Generate a unique product ID
    const productId = generateProductId(
      productData.product_name,
      productData.source_url
    );

    // Check if the product already exists
    let product = await Product.findOne({ productId });

    // Create new price history entry
    const priceHistoryEntry = {
      date: new Date(),
      lowestPrice: productData.lowestPrice,
      highestPrice: productData.highestPrice,
      averagePrice: productData.averagePrice,
      currency: "SAR", // Default to SAR for Saudi market
    };

    if (product) {
      console.log(`🔄 Updating existing product: ${productData.product_name}`);

      // Check if this is a new lowest price
      if (productData.lowestPrice < product.lowestPrice) {
        console.log(
          `💰 New lowest price found: ${productData.lowestPrice} (was ${product.lowestPrice})`
        );
      }

      // Update product fields with new data
      product.product_name = productData.product_name;
      product.product_type = productData.product_type;
      product.photo_links = productData.photo_links;
      product.stores = productData.stores;
      product.reviews = productData.reviews;
      product.rating_distribution = productData.rating_distribution;
      product.lowestPrice = productData.lowestPrice;
      product.highestPrice = productData.highestPrice;
      product.averagePrice = productData.averagePrice;

      // Add new price history entry
      product.priceHistory.push(priceHistoryEntry);

      // Save updated product
      await product.save();
      return product;
    } else {
      console.log(`🆕 Creating new product: ${productData.product_name}`);

      // Prepare the product object
      const newProduct = new Product({
        productId,
        category: productData.category,
        brand: productData.brand,
        product_name: productData.product_name,
        product_type: productData.product_type,
        photo_links: productData.photo_links,
        stores: productData.stores,
        reviews: productData.reviews,
        rating_distribution: productData.rating_distribution,
        source_url: productData.source_url,
        lowestPrice: productData.lowestPrice,
        highestPrice: productData.highestPrice,
        averagePrice: productData.averagePrice,
        priceHistory: [priceHistoryEntry],
        users: [],
      });

      // Save the new product
      await newProduct.save();
      return newProduct;
    }
  } catch (error) {
    console.error(`❌ Error saving product: ${error.message}`);
    throw error;
  }
};

/**
 * Get all products
 * @returns {Promise<Array>} - Array of products
 */
export const getAllProducts = async () => {
  try {
    return await Product.find({}).sort({ updatedAt: -1 });
  } catch (error) {
    console.error(`❌ Error fetching products: ${error.message}`);
    throw error;
  }
};

/**
 * Get product by ID
 * @param {string} productId - Product ID
 * @returns {Promise<Object>} - Product object
 */
export const getProductById = async (productId) => {
  try {
    return await Product.findOne({ productId });
  } catch (error) {
    console.error(`❌ Error fetching product: ${error.message}`);
    throw error;
  }
};

/**
 * Get product price history
 * @param {string} productId - Product ID
 * @returns {Promise<Array>} - Array of price history entries
 */
export const getProductPriceHistory = async (productId) => {
  try {
    const product = await Product.findOne({ productId });
    return product ? product.priceHistory : [];
  } catch (error) {
    console.error(`❌ Error fetching price history: ${error.message}`);
    throw error;
  }
};

// If there's any review limiting logic, ensure it's removed or adjusted

// For example, if there's code like this somewhere:
// const limitedReviews = product.reviews.slice(0, 10);

// Replace it with:
// const limitedReviews = product.reviews; // No limiting
