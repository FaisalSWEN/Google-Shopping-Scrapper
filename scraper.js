/**
 * The main entry point for the scraper.
 *
 * Uses Puppeteer to navigate to Google Shopping, handles page interactions (clicking "Show More" buttons), extracts the HTML content, passes it to the parser, and saves the scraped product data to MongoDB.
 */

import puppeteer from "puppeteer";
import * as cheerio from "cheerio";
import google from "./stores/google.js";
import connectDB from "./config/database.js";
import { saveProduct } from "./services/productService.js";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

// Get directory name for the current module
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Use only config.env
const configPath = path.join(__dirname, "config.env");
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

/**
 * Scrapes a product from a Google Shopping URL
 * @param {string} url - Google Shopping product URL (required)
 * @param {Object} options - Optional parameters
 * @param {string} options.category - Product category (e.g., 'phones', 'laptops')
 * @param {string} options.brand - Product brand (e.g., 'Apple', 'Samsung')
 * @param {number} options.maxClicks - Maximum number of clicks for "Show More" buttons (default: from config)
 * @returns {Promise<Object>} The saved product data
 * @throws {Error} If URL is not provided
 */
async function scrapeProduct(url, options = {}) {
  // Validate URL is provided
  if (!url) {
    throw new Error(
      "URL is required. Please provide a Google Shopping product URL."
    );
  }

  // Set default options from environment config
  const maxClicks =
    options.maxClicks !== undefined
      ? options.maxClicks
      : config.MAX_CLICK_ATTEMPTS;

  const clickDelay =
    options.clickDelay !== undefined
      ? options.clickDelay
      : config.DEFAULT_CLICK_DELAY;

  console.log(`🔍 Scraping URL: ${url}`);
  console.log(`📋 Options: ${JSON.stringify(options)}`);
  console.log(
    `🔄 Will attempt up to ${maxClicks} clicks on "Show More" buttons`
  );
  console.log(`⏱️ Click delay: ${clickDelay}ms`);

  // Connect to MongoDB
  await connectDB();

  const browser = await puppeteer.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'] // Helps with some environments
  });
  const page = await browser.newPage();

  await page.setExtraHTTPHeaders({
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
  });

  console.log(`🌐 Sending request to Google Shopping`);

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

    // Explicit wait for main container to load
    await page.waitForSelector(".bWXikd", { timeout: 15000 });

    console.log(`✅ Response received`);

    // Function to delay execution
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

    // Step 1: Load more stores by clicking "Show More" button multiple times
    await expandSection(page, {
      buttonSelector: ".jgbNbb.YbJ8Df", 
      sectionName: "stores",
      maxClicks,
      delay: clickDelay
    });

    // Step 2: Check for review section and try to expand it
    console.log(`🔍 Searching for review section...`);
    const reviewSectionExists = await page.evaluate(() => {
      // Try multiple selectors for review section
      const reviewSelectors = [
        ".wKtRYe.PZPZlf",
        ".afKV8.OgnHP",  // Another possible container
        "[data-review-id]", // Elements with review IDs
        ".QcJav" // Review section container
      ];
      
      for (const selector of reviewSelectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          console.log(`Found review section with selector: ${selector}`);
          elements[0].scrollIntoView({ behavior: "smooth", block: "center" });
          return true;
        }
      }
      
      // Also try finding by text content related to reviews
      const reviewTexts = ["المراجعات", "reviews", "التقييمات"];
      for (const text of reviewTexts) {
        const elements = Array.from(document.querySelectorAll('*'))
          .filter(el => el.textContent.includes(text));
        
        if (elements.length > 0) {
          elements[0].scrollIntoView({ behavior: "smooth", block: "center" });
          return true;
        }
      }
      
      return false;
    });

    if (reviewSectionExists) {
      console.log(`✅ Review section found`);
      await delay(1000); // Wait for scroll to complete

      await expandSection(page, {
        buttonSelector: ".jgbNbb.MpEZrd.YbJ8Df.g5UPGe", 
        sectionName: "reviews",
        maxClicks,
        delay: clickDelay
      });
    } else {
      console.log(`ℹ️ No review section found`);
    }

    // Get the content after all expansions
    const content = await page.content();
    const $ = cheerio.load(content);

    // Pass the options to the Google Shopping scraper
    const result = google($, url, options);

    console.log(
      `\n📄 Parsed ${result.stores.length} stores and ${
        result.reviews ? result.reviews.length : 0
      } reviews`
    );

    // Display category and brand info
    console.log(`📋 Product Details:`);
    console.log(`   - Name: ${result.product_name || "Unknown"}`);
    console.log(`   - Category: ${result.category || "Unknown"}`);
    console.log(`   - Brand: ${result.brand || "Unknown"}`);

    // Save to MongoDB
    console.log(`💾 Saving product data to MongoDB...`);
    const savedProduct = await saveProduct(result);

    console.log(
      `\n✅ Product saved to database with ID: ${savedProduct.productId}`
    );
    console.log(`📊 Product stats:`);
    console.log(`   - Name: ${savedProduct.product_name}`);
    console.log(
      `   - Price range: ${savedProduct.lowestPrice} - ${savedProduct.highestPrice} SAR`
    );
    console.log(`   - Average price: ${savedProduct.averagePrice} SAR`);
    console.log(
      `   - Price history entries: ${savedProduct.priceHistory.length}`
    );
    console.log(
      `   - Latest update: ${new Date(savedProduct.updatedAt).toLocaleString()}`
    );

    return savedProduct;
  } catch (error) {
    console.error(`❌ Error scraping:`, error.message || error);
    throw error;
  } finally {
    await browser.close();
  }
}

/**
 * Expands a section by clicking its "Show More" button multiple times
 * @param {Object} page - Puppeteer page object
 * @param {Object} options - Options for expansion
 * @param {string} options.buttonSelector - CSS selector for the "Show More" button
 * @param {string} options.sectionName - Name of the section (for logging)
 * @param {number} options.maxClicks - Maximum number of times to click
 * @param {number} options.delay - Delay between clicks in milliseconds
 * @returns {Promise<number>} The number of successful clicks
 */
async function expandSection(
  page,
  { buttonSelector, sectionName, maxClicks, delay }
) {
  let clickCount = 0;

  console.log(
    `🔍 Attempting to expand ${sectionName} section (up to ${maxClicks} times)...`
  );

  // Define button text patterns based on section
  const buttonTexts =
    sectionName === "stores"
      ? ["المزيد من المتاجر", "عرض المزيد", "المزيد من", "المزيد"] // Store related texts
      : ["المزيد من المراجعات", "عرض المزيد من المراجعات", "المزيد"]; // Review related texts

  // Set the max attempts slightly higher than clicks to allow for retries
  const maxAttempts = maxClicks + 3;
  let attempts = 0;

  // Function for delaying execution (replacement for page.waitForTimeout)
  const waitForTimeout = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  while (clickCount < maxClicks && attempts < maxAttempts) {
    attempts++;

    try {
      // Wait a bit before each click attempt
      await waitForTimeout(300);

      // First approach: Direct CSS selector
      console.log(
        `🔍 Attempt ${attempts}: Looking for ${sectionName} button with CSS selectors...`
      );

      let buttonFound = false;

      // Try with the basic selectors first
      let buttonSelector =
        sectionName === "stores"
          ? ".jgbNbb.YbJ8Df"
          : ".jgbNbb.MpEZrd.YbJ8Df.g5UPGe";

      let button = await page.$(buttonSelector);

      if (!button) {
        // Try alternate selectors
        const alternateSelectors =
          sectionName === "stores"
            ? [
                ".fYRLcd.tHYb7d.lWlLJb.FWMb9e.o4qwAe",
                "div[role='button'].YbJ8Df",
                ".YbJ8Df",
              ]
            : [
                ".fYRLcd.tHYb7d.lWlLJb.FWMb9e.MpEZrd",
                "div[role='button'].g5UPGe",
                ".g5UPGe",
              ];

        for (const selector of alternateSelectors) {
          button = await page.$(selector);
          if (button) {
            buttonSelector = selector;
            break;
          }
        }
      }

      // Second approach: Look for buttons with specific text
      if (!button) {
        console.log(
          `🔍 Attempt ${attempts}: Looking for ${sectionName} button by text content...`
        );

        // Find buttons by visible text
        button = await page.evaluateHandle((texts) => {
          for (const text of texts) {
            // Find all elements containing this text
            const elements = [
              ...document.querySelectorAll('div[role="button"], button'),
            ].filter(
              (el) =>
                el.textContent.includes(text) &&
                window.getComputedStyle(el).display !== "none"
            );

            if (elements.length > 0) {
              return elements[0]; // Return the first matching element
            }
          }
          return null;
        }, buttonTexts);

        // Check if the handle is valid
        const isValidHandle = await page
          .evaluate((handle) => !!handle, button)
          .catch(() => false);

        if (!isValidHandle) {
          button = null;
        } else {
          buttonFound = true;
        }
      } else {
        buttonFound = true;
      }

      // If no button was found with any method, try one more approach - XPath
      if (!button) {
        console.log(
          `🔍 Attempt ${attempts}: Trying XPath approach for ${sectionName} button...`
        );

        for (const text of buttonTexts) {
          // XPath to find elements containing the text
          const xpath = `//*[contains(text(), "${text}")]`;
          const elements = await page.$x(xpath);

          if (elements.length > 0) {
            button = elements[0];
            buttonFound = true;
            break;
          }
        }
      }

      // If we still didn't find a button, break the loop
      if (!button || !buttonFound) {
        console.log(
          `ℹ️ No ${sectionName} "Show More" button found on attempt ${attempts}`
        );

        // Check if we already have enough content and don't need to click more
        if (sectionName === "stores") {
          const storesCount = await page
            .$$eval(".R5K7Cb.SPI3ee", (stores) => stores.length)
            .catch(() => 0);
          console.log(`📊 Currently showing ${storesCount} stores`);

          // If we have a good number of stores already, consider it a success
          if (storesCount > 3) {
            console.log(
              `✅ Found ${storesCount} stores which seems sufficient, continuing...`
            );
            break;
          }
        } else if (sectionName === "reviews") {
          const reviewsCount = await page
            .$$eval(".wKtRYe.PZPZlf", (reviews) => reviews.length)
            .catch(() => 0);
          console.log(`📊 Currently showing ${reviewsCount} reviews`);

          // If we have a good number of reviews already, consider it a success
          if (reviewsCount > 2) {
            console.log(
              `✅ Found ${reviewsCount} reviews which seems sufficient, continuing...`
            );
            break;
          }
        }

        // If we've tried multiple times without success, give up
        if (attempts >= 3) {
          console.log(
            `ℹ️ Giving up on finding ${sectionName} button after ${attempts} attempts`
          );
          break;
        }

        // Wait a bit longer before next attempt
        await waitForTimeout(1000);
        continue;
      }

      // Button found, try to click it
      console.log(`✅ Found ${sectionName} button, scrolling to it...`);

      // Scroll to make sure the button is in view
      await page
        .evaluate((el) => {
          el.scrollIntoView({ behavior: "smooth", block: "center" });

          // Highlight for debugging (visible in headful mode)
          el.style.border = "3px solid red";
          el.style.backgroundColor = "yellow";
        }, button)
        .catch((e) => console.log(`⚠️ Error scrolling: ${e.message}`));

      // Wait for scroll to complete
      await waitForTimeout(700);

      // Try clicking with multiple methods
      let clickSucceeded = false;

      // Method 1: Native click
      try {
        console.log(`🖱️ Clicking ${sectionName} button (method 1)...`);
        await button.click({ delay: 100 });
        clickSucceeded = true;
      } catch (err) {
        console.log(`⚠️ Method 1 click failed: ${err.message}`);

        // Method 2: JavaScript click
        try {
          console.log(`🖱️ Clicking ${sectionName} button (method 2)...`);
          await page.evaluate((el) => el.click(), button);
          clickSucceeded = true;
        } catch (err2) {
          console.log(`⚠️ Method 2 click failed: ${err2.message}`);

          // Method 3: Mouse events
          try {
            console.log(`🖱️ Clicking ${sectionName} button (method 3)...`);
            const box = await button.boundingBox();
            if (box) {
              await page.mouse.move(
                box.x + box.width / 2,
                box.y + box.height / 2
              );
              await page.mouse.down();
              await waitForTimeout(100);
              await page.mouse.up();
              clickSucceeded = true;
            }
          } catch (err3) {
            console.log(`⚠️ Method 3 click failed: ${err3.message}`);
          }
        }
      }

      if (clickSucceeded) {
        clickCount++;
        console.log(
          `✅ Click ${clickCount}/${maxClicks} on "${sectionName}" button successful`
        );

        // Wait for content to load
        await waitForTimeout(delay);

        // Check if content increased
        if (sectionName === "stores") {
          const storesCount = await page
            .$$eval(".R5K7Cb.SPI3ee", (stores) => stores.length)
            .catch(() => 0);
          console.log(
            `📊 Found ${storesCount} stores after click ${clickCount}`
          );
        } else if (sectionName === "reviews") {
          const reviewsCount = await page
            .$$eval(".wKtRYe.PZPZlf", (reviews) => reviews.length)
            .catch(() => 0);
          console.log(
            `📊 Found ${reviewsCount} reviews after click ${clickCount}`
          );
        }
      } else {
        console.log(`⚠️ All click methods failed for ${sectionName} button`);

        // If we can't click after multiple attempts, break the loop
        if (attempts >= maxAttempts - 1) {
          break;
        }
      }

      // Check if the "Show More" button is still present
      const buttonStillExists = await page
        .$(buttonSelector)
        .then((el) => !!el)
        .catch(() => false);

      if (!buttonStillExists) {
        console.log(
          `ℹ️ No more "${sectionName}" buttons available after ${clickCount} clicks`
        );
        break;
      }
    } catch (error) {
      console.log(
        `⚠️ Error during ${sectionName} expansion attempt ${attempts}: ${error.message}`
      );

      // If we've had too many errors, give up
      if (attempts >= maxAttempts - 1) {
        console.log(
          `ℹ️ Giving up on ${sectionName} expansion after too many errors`
        );
        break;
      }
    }
  }

  console.log(`✅ Expanded ${sectionName} section with ${clickCount} clicks`);
  return clickCount;
}

// Check if this file is being run directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // Get URL from command line arguments if provided
  const url = process.argv[2];
  const category = process.argv[3];
  const brand = process.argv[4];
  const maxClicks = process.argv[5] ? parseInt(process.argv[5], 10) : config.MAX_CLICK_ATTEMPTS;

  if (!url) {
    console.error("❌ Error: URL is required");
    console.log("Usage: node test.js <url> [category] [brand] [maxClicks]");
    process.exit(1);
  }

  // Run the scraper with arguments
  scrapeProduct(url, { category, brand, maxClicks })
    .then(() => {
      console.log("✅ Scraping completed successfully");
      // Exit after direct execution
      setTimeout(() => process.exit(0), 2000);
    })
    .catch((error) => {
      console.error("❌ Scraping failed:", error);
      process.exit(1);
    });
} else {
  // Export the function for use in other files
  console.log("📦 Exporting scrapeProduct function");
}

export default scrapeProduct;