/**
 * The main entry point for the scraper.
 *
 * Uses Puppeteer to navigate to Google Shopping, handles page interactions (clicking "Show More" buttons), extracts the HTML content, passes it to the parser, and saves the scraped product data to MongoDB.
 */

import path from "path";
import fs from 'fs';
import util from 'util';
import { fileURLToPath } from "url";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import * as cheerio from "cheerio";
import dotenv from "dotenv";
import google from "./stores/google.js";
import connectDB from "./config/database.js";
import { saveProduct } from "./services/productService.js";
import { googleSelectors } from "./config/selectors.js";
import { checkAndHandleCaptcha } from "./utils/captchaHandler.js";
import { launchBrowserWithPersistence, saveSession } from "./utils/enhancedBrowserLauncher.js";

// Initialize stealth plugin
puppeteer.use(StealthPlugin());

// Get directory name for the current module
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Updated path to config.env now in config directory
const configPath = path.join(__dirname, "config", "config.env");
dotenv.config({ path: configPath });

// Default configuration values (used if not specified in config.env)
export const config = {
  MAX_CLICK_ATTEMPTS_STORES: process.env.MAX_CLICK_ATTEMPTS_STORES
    ? parseInt(process.env.MAX_CLICK_ATTEMPTS_STORES, 10)
    : 7,
  MAX_CLICK_ATTEMPTS_REVIEWS: process.env.MAX_CLICK_ATTEMPTS_REVIEWS
    ? parseInt(process.env.MAX_CLICK_ATTEMPTS_REVIEWS, 10)
    : 5,
  DEFAULT_CLICK_DELAY: process.env.DEFAULT_CLICK_DELAY
    ? parseInt(process.env.DEFAULT_CLICK_DELAY, 10)
    : 1500,
};

// Add screenshot functionality for error handling
// Create organized directory structure for screenshots
const screenshotsDir = path.join(__dirname, 'screenshots');
const debugDir = path.join(screenshotsDir, 'debug');
const errorDir = path.join(screenshotsDir, 'errors');
const logsDir = path.join(__dirname, 'logs');

// Create necessary directories if they don't exist
for (const dir of [screenshotsDir, debugDir, errorDir, logsDir]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
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
  const logFile = path.join(logsDir, `scrapper_${new Date().toISOString().split('T')[0]}.log`);
  fs.appendFileSync(logFile, logMessage + "\n");
}

// Enhanced logging utilities
/**
 * Enhanced error logging function that provides more context and details
 * @param {Error} error - The error object to log
 * @param {Object} options - Options for customizing the log output
 * @param {string} options.context - The context in which the error occurred
 * @param {Object} options.additionalData - Any additional data to include in the log
 * @param {boolean} options.showStack - Whether to show the full stack trace (default: true)
 */
function logError(error, options = {}) {
  const {
    context = 'General',
    additionalData = {},
    showStack = true
  } = options;
  
  log('\n❌ ERROR DETAILS ' + '='.repeat(50), true);
  log(`🔍 Context: ${context}`, true);
  log(`⚠️ Type: ${error.name || 'Unknown Error Type'}`, true);
  log(`📝 Message: ${error.message}`, true);
  
  // If there's additional data, display it
  if (Object.keys(additionalData).length > 0) {
    log('📋 Additional Information:', true);
    Object.entries(additionalData).forEach(([key, value]) => {
      if (typeof value === 'object' && value !== null) {
        log(`   ${key}: ${util.inspect(value, { depth: 1, colors: true })}`, true);
      } else {
        log(`   ${key}: ${value}`, true);
      }
    });
  }
  
  // Display selector information for timeout errors
  if (error.name === 'TimeoutError') {
    const selectorMatch = error.message.match(/Waiting for selector `([^`]+)`/);
    if (selectorMatch) {
      const selector = selectorMatch[1];
      log(`🔍 Failed Selector: ${selector}`, true);
      log(`💡 Possible causes:`, true);
      log(`   - Page structure may have changed (Google updated their HTML)`, true);
      log(`   - Element may be inside an iframe or dynamically loaded`, true);
      log(`   - The selector might not be present on this particular product page`, true);
      log(`   - Page might be showing a CAPTCHA or anti-bot challenge`, true);
    }
  }
  
  // Only show stack trace if requested
  if (showStack && error.stack) {
    log('📚 Stack Trace:', true);
    const formattedStack = error.stack
      .split('\n')
      .map(line => '   ' + line.trim())
      .join('\n');
    log(formattedStack, true);
  }
  
  log('='.repeat(65) + '\n', true);
}

// Enhance screenshot functionality to handle different error types
async function takeErrorScreenshot(page, errorType, details = '', additionalData = {}) {
  try {
    // Format current time for filename
    const now = new Date();
    const timestamp = now.toISOString()
      .replace(/:/g, '-')
      .replace(/\..+/, '');
    
    const sanitizedDetails = details.replace(/[^a-z0-9]/gi, '_').substring(0, 50);
    const filename = `${errorType}_${sanitizedDetails}_${timestamp}.png`;
    const screenshotPath = path.join(screenshotsDir, filename);
    
    await page.screenshot({ 
      path: screenshotPath,
      fullPage: true 
    });
    
    // Add debug information to the page before taking the screenshot for selector errors
    if (errorType === 'selector_error' && additionalData.selector) {
      await page.evaluate((selector) => {
        // Try to find the closest matching element for debugging
        try {
          // Create a div to show debug information
          const debugDiv = document.createElement('div');
          debugDiv.style.position = 'fixed';
          debugDiv.style.top = '10px';
          debugDiv.style.left = '10px';
          debugDiv.style.padding = '10px';
          debugDiv.style.background = 'rgba(255, 0, 0, 0.7)';
          debugDiv.style.color = 'white';
          debugDiv.style.zIndex = '9999';
          debugDiv.style.maxWidth = '80%';
          debugDiv.innerHTML = `<h3>Debug Info</h3><p>Failed to find: ${selector}</p>`;
          
          // Try to find similar selectors
          const similarElements = document.querySelectorAll('*[class*="' + 
            selector.replace(/^\./, '').split(' ')[0] + '"]');
          
          if (similarElements.length > 0) {
            debugDiv.innerHTML += `<p>Found ${similarElements.length} similar elements</p>`;
            
            // List the first 5 similar elements
            const list = document.createElement('ul');
            Array.from(similarElements).slice(0, 5).forEach(el => {
              const item = document.createElement('li');
              item.textContent = el.className;
              list.appendChild(item);
            });
            debugDiv.appendChild(list);
          }
          
          document.body.appendChild(debugDiv);
        } catch (e) {
          // Ignore any errors in the debug code
        }
      }, additionalData.selector);
      
      // Take another screenshot with the debug information
      const debugFilename = `${errorType}_DEBUG_${sanitizedDetails}_${timestamp}.png`;
      const debugScreenshotPath = path.join(screenshotsDir, debugFilename);
      await page.screenshot({ 
        path: debugScreenshotPath,
        fullPage: true 
      });
      
      log(`📸 Error screenshot saved to: ${screenshotPath}`);
      log(`🔍 Debug screenshot saved to: ${debugScreenshotPath}`);
      return { regular: screenshotPath, debug: debugScreenshotPath };
    }
    
    log(`📸 Error screenshot saved to: ${screenshotPath}`);
    return { regular: screenshotPath };
  } catch (screenshotError) {
    log('⚠️ Failed to take error screenshot:', true);
    log(screenshotError.message, true);
    return null;
  }
}

/**
 * Cross-version compatible wait function that works with different Puppeteer versions
 * @param {Object} page - Puppeteer page object
 * @param {number} ms - Time to wait in milliseconds
 * @returns {Promise<void>}
 */
async function waitFor(page, ms) {
  if (typeof page.waitForTimeout === 'function') {
    // For newer Puppeteer versions
    return page.waitForTimeout(ms);
  } else if (typeof page.waitFor === 'function') {
    // For older Puppeteer versions
    return page.waitFor(ms);
  } else {
    // Fallback to plain setTimeout
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Creates random delays to mimic human behavior
 * @param {number} min - Minimum delay in milliseconds
 * @param {number} max - Maximum delay in milliseconds
 * @returns {number} Random delay duration
 */
function getRandomDelay(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Generates randomized human-like behavior for scrolling
 * @param {Object} page - Puppeteer page object
 */
async function humanLikeScroll(page) {
  const scrollHeight = await page.evaluate('document.body.scrollHeight');
  const viewportHeight = await page.evaluate('window.innerHeight');
  
  // Number of scroll steps (fixed to be more consistent)
  const scrollSteps = Math.min(5, Math.floor(scrollHeight / viewportHeight));
  
  for (let i = 0; i < scrollSteps; i++) {
    // Calculate a more consistent scroll amount
    const scrollAmount = Math.floor(viewportHeight * 0.8);
    
    await page.evaluate((amount) => {
      window.scrollBy({
        top: amount,
        behavior: 'smooth'
      });
    }, scrollAmount);
    
    // Consistent pause between scrolls
    await waitFor(page, 1200);
  }
}

/**
 * Scrapes a product from a Google Shopping URL
 * @param {string} url - Google Shopping product URL (required)
 * @param {Object} options - Optional parameters
 * @param {string} options.category - Product category (e.g., 'phones', 'laptops')
 * @param {string} options.brand - Product brand (e.g., 'Apple', 'Samsung')
 * @param {number} options.maxClicksStores - Maximum number of clicks for showing more stores button (default: from config)
 * @param {number} options.maxClicksReviews - Maximum number of clicks for showing more reviews button (default: from config)
 * @param {number} options.clickDelay - Delay between clicks in milliseconds (default: from config)
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
  const maxClicksStores = options.maxClicksStores !== undefined 
    ? options.maxClicksStores 
    : config.MAX_CLICK_ATTEMPTS_STORES;
  
  const maxClicksReviews = options.maxClicksReviews !== undefined 
    ? options.maxClicksReviews 
    : config.MAX_CLICK_ATTEMPTS_REVIEWS;
    
  const clickDelay =
    options.clickDelay !== undefined
      ? options.clickDelay
      : config.DEFAULT_CLICK_DELAY;

  log(`🔍 Scraping URL: ${url}`);
  log(`📋 Options: ${JSON.stringify(options)}`);
  log(
    `🔄 Will attempt up to ${maxClicksStores} clicks for stores and ${maxClicksReviews} clicks for reviews`
  );
  log(`⏱️ Click delay: ${clickDelay}ms`);

  // Connect to MongoDB
  await connectDB();

  // Use the enhanced browser launcher with persistent profile
  let browser, page;
  try {
    log('🔄 Launching browser with persistent profile...');
    // Use forceVisible: true to always show the browser during development
    // Set to false for production for better performance when no CAPTCHA is needed
    const browserData = await launchBrowserWithPersistence(url, { forceVisible: false });
    browser = browserData.browser;
    page = browserData.page;
    log('✅ Browser launched successfully');
  } catch (browserLaunchError) {
    log(`❌ Failed to launch browser: ${browserLaunchError.message}`, true);
    throw browserLaunchError;
  }

  log(`🌐 Beginning scraping process`);

  try {
    // If the URL is different after CAPTCHA (possible redirect), navigate again to ensure we're on product page
    const currentUrl = page.url();
    if (!currentUrl.includes('oshopproduct=') && url.includes('oshopproduct=')) {
      log('⚠️ URL may have changed after CAPTCHA. Re-navigating to product page...');
      await page.goto(url, { waitUntil: "networkidle2", timeout: 45000 });
    }

    // Add a check for Google Shopping product page to confirm we're on the right page
    const isProductPage = await page.evaluate(() => {
      // Comprehensive check for Google Shopping product page elements using multiple selectors
      // Main content containers
      const mainContainers = [
        '.fzeRu.zGbHN',  // Product container
        '.BvQan',        // Product details
        '.sh-osd__offer-container', // Offer container
        '.R5K7Cb.SPI3ee', // Store container
        '.PZPZlf',       // Reviews
        '.XkAcee.g7Jdnb' // Product information
      ];
      
      // Header elements that indicate a product page
      const headerElements = [
        'h1.BXIkFb', // Product title in header
        '.Pgbknd',   // Price
        '.mDMo4e',   // Overall product header
        '.gw0gH'     // Google Shopping header
      ];
      
      // Product specific elements
      const productElements = [
        '.fALoRc',   // Product image gallery
        '.DYd0Le',   // Rating stars 
        '.E5ocAb',   // Shipping information
        '.KfAt4d',   // Product images
        '.wKtRYe'    // Reviews container
      ];
      
      // Check main containers
      for (const selector of mainContainers) {
        if (document.querySelector(selector)) {
          return true;
        }
      }
      
      // Check header elements
      for (const selector of headerElements) {
        if (document.querySelector(selector)) {
          return true;
        }
      }
      
      // Check product specific elements
      for (const selector of productElements) {
        if (document.querySelector(selector)) {
          return true;
        }
      }
      
      // Check if search results contain shopping entries
      if (document.querySelector('[data-docid*="product_"]')) {
        return true;
      }
      
      // Check if URL indicates a product page
      const url = window.location.href;
      if (url.includes('oshopproduct=') || 
          url.includes('/shopping/') || 
          url.includes('&tbm=shop')) {
        // URL patterns suggest this is a shopping page
        return true;
      }
      
      // Check if we can find any text suggesting this is a shopping page
      const pageText = document.body.innerText;
      if ((pageText.includes('متاجر') || pageText.includes('stores')) && 
          (pageText.includes('التقييمات') || pageText.includes('reviews') || pageText.includes('مراجعات'))) {
        return true;
      }
      
      // Nothing detected
      return false;
    });

    if (!isProductPage) {
      log('⚠️ Page does not appear to be a Google Shopping product page. Taking screenshot...');
      // Take diagnostic screenshot
      const timestamp = new Date().toISOString().replace(/:/g, '-');
      const screenshotPath = path.join(screenshotsDir, 'debug', `not_product_page_${timestamp}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      log(`📸 Screenshot saved to: ${screenshotPath}`);
      
      // Save page HTML for debugging
      const pageContent = await page.content();
      fs.writeFileSync(path.join(screenshotsDir, 'debug', `page_content_${timestamp}.html`), pageContent);
      
      // Continue anyway since our detection might be wrong
      log('⚠️ Continuing anyway since we might have a new Google Shopping UI format');
    } else {
      log('✅ Successfully detected Google Shopping product page');
    }

    // Add random delay before navigation
    await waitFor(page, getRandomDelay(1000, 3000));
    
    // Navigate with a more realistic timeout
    await page.goto(url, { 
      waitUntil: "networkidle2", 
      timeout: 30000 
    });

    // Check for CAPTCHA immediately after navigation
    log('🔍 Checking for CAPTCHA after initial navigation...');
    const initialCaptchaDetected = await checkAndHandleCaptcha(page);
    if (initialCaptchaDetected) {
      log('✅ CAPTCHA handled successfully, continuing...');
      // Wait for the page to stabilize after CAPTCHA
      await waitFor(page, 3000);
    }

    // Wait randomly to appear more human-like
    await waitFor(page, getRandomDelay(2000, 4000));

    // Explicit wait for main container to load
    await page.waitForSelector(googleSelectors.mainContainer, { timeout: 15000 }).catch(async (error) => {
      log('⚠️ Error waiting for main container, checking for CAPTCHA...');
      const captchaDetected = await checkAndHandleCaptcha(page);
      if (captchaDetected) {
        log('✅ CAPTCHA handled, retrying container detection...');
        await waitFor(page, 2000);
        // Try waiting for container again after handling CAPTCHA
        await page.waitForSelector(googleSelectors.mainContainer, { timeout: 15000 });
      } else {
        throw error; // If no CAPTCHA detected, rethrow the original error
      }
    });

    log(`✅ Response received`);

    // Function to delay execution with randomization
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms + getRandomDelay(-200, 400)));

    // Perform human-like scrolling to appear natural
    await humanLikeScroll(page);

    // Step 1: Load more stores by clicking "Show More" button multiple times
    await expandSection(page, {
      buttonSelector: googleSelectors.buttons.stores,
      sectionName: "stores",
      maxClicks: config.MAX_CLICK_ATTEMPTS_STORES,
      delay: clickDelay,
    });

    // Add random delay between sections
    await waitFor(page, getRandomDelay(1500, 3000));

    // Step 2: Check for review section and try to expand it
    log(`🔍 Searching for review section...`);
    const reviewSectionExists = await page.evaluate((selectors) => {
      // Try multiple selectors for review section
      for (const selector of selectors.reviewSection) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          elements[0].scrollIntoView({ behavior: "smooth", block: "center" });
          return true;
        }
      }
      
      // Also try finding by text content related to reviews
      for (const text of selectors.reviewSectionTexts) {
        const elements = Array.from(document.querySelectorAll('*'))
          .filter(el => el.textContent.includes(text) &&
                       window.getComputedStyle(el).display !== "none");
        
        if (elements.length > 0) {
          elements[0].scrollIntoView({ behavior: "smooth", block: "center" });
          return true;
        }
      }
      
      return false;
    }, { 
      reviewSection: googleSelectors.reviewSection, 
      reviewSectionTexts: googleSelectors.reviewSectionTexts 
    });

    if (reviewSectionExists) {
      log(`✅ Review section found`);
      // Adding variable delay to mimic human reading behavior
      await delay(getRandomDelay(800, 2000));

      await expandSection(page, {
        buttonSelector: googleSelectors.buttons.reviews,
        sectionName: "reviews",
        maxClicks: config.MAX_CLICK_ATTEMPTS_REVIEWS,
        delay: clickDelay,
      });
    } else {
      log(`ℹ️ No review section found`);
    }

    // Check for CAPTCHA before final content extraction
    log('🔍 Checking for CAPTCHA before content extraction...');
    const finalCaptchaDetected = await checkAndHandleCaptcha(page);
    if (finalCaptchaDetected) {
      log('✅ CAPTCHA handled before content extraction');
      await waitFor(page, 2000); // Wait for page to stabilize
    }

    // Get the content after all expansions
    const content = await page.content();
    const $ = cheerio.load(content);

    // Pass the options to the Google Shopping scraper
    const result = google($, url, options);

    log(
      `\n📄 Parsed ${result.stores.length} stores and ${
        result.reviews ? result.reviews.length : 0
      } reviews`
    );

    // Display category and brand info
    log(`📋 Product Details:`);
    log(`   - Name: ${result.product_name || "Unknown"}`);
    log(`   - Category: ${result.category || "Unknown"}`);
    log(`   - Brand: ${result.brand || "Unknown"}`);

    // Save to MongoDB
    log(`💾 Saving product data to MongoDB...`);
    const savedProduct = await saveProduct(result);

    // Save session cookies for future use
    log(`🍪 Saving session for future runs...`);
    await saveSession(page);

    log(
      `\n✅ Product saved to database with ID: ${savedProduct.productId}`
    );

    log(`📊 Product stats:`);
    log(`   - Name: ${savedProduct.product_name}`);
    log(
      `   - Price range: ${savedProduct.lowestPrice} - ${savedProduct.highestPrice} SAR`
    );
    log(`   - Average price: ${savedProduct.averagePrice} SAR`);
    log(
      `   - Price history entries: ${savedProduct.priceHistory.length}`
    );
    log(
      `   - Latest update: ${new Date(savedProduct.updatedAt).toLocaleString()}`
    );

    return savedProduct;
  } catch (error) {
    // Use our enhanced error logging with more context
    logError(error, {
      context: 'Product Scraping',
      additionalData: {
        url: url,
        options: options,
        selectors: {
          mainContainer: googleSelectors.mainContainer
        },
        pageInfo: {
          url: page.url(),
          title: await page.title().catch(() => 'Unknown')
        }
      }
    });
    
    // Take a more detailed screenshot with context
    if (error.name === 'TimeoutError') {
      // For selector errors, include which selector failed
      const selectorMatch = error.message.match(/Waiting for selector `([^`]+)`/);
      if (selectorMatch) {
        await takeErrorScreenshot(page, 'selector_error', error.message, {
          selector: selectorMatch[1]
        });
      } else {
        await takeErrorScreenshot(page, 'timeout_error', error.message);
      }
    } else if (error.name === 'NavigationError' || error.message.includes('navigation')) {
      await takeErrorScreenshot(page, 'navigation_error', error.message);
    } else {
      await takeErrorScreenshot(page, 'scraper_error', error.message);
    }
    
    throw error;
  } finally {
    // Clean up and close browser with random delay to avoid patterns
    await waitFor(page, getRandomDelay(1000, 3000));
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

  log(
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
  const waitForTimeout = (ms) => waitFor(page, ms);
  
  // Check for CAPTCHA before starting expansion
  log('🔍 Checking for CAPTCHA before expanding section...');
  const initialCaptchaDetected = await checkAndHandleCaptcha(page);
  if (initialCaptchaDetected) {
    log('✅ CAPTCHA handled before section expansion');
  }

  while (clickCount < maxClicks && attempts < maxAttempts) {
    attempts++;

    try {
      // Wait a bit before each click attempt
      await waitFor(page, 300);

      // First approach: Direct CSS selector
      log(
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
        log(
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
        log(
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
        log(
          `ℹ️ No ${sectionName} "Show More" button found on attempt ${attempts}`
        );

        // Check if we already have enough content and don't need to click more
        if (sectionName === "stores") {
          const storesCount = await page
            .$$eval(".R5K7Cb.SPI3ee", (stores) => stores.length)
            .catch(() => 0);
          log(`📊 Currently showing ${storesCount} stores`);

          // If we have a good number of stores already, consider it a success
          if (storesCount > 3) {
            log(
              `✅ Found ${storesCount} stores which seems sufficient, continuing...`
            );
            break;
          }
        } else if (sectionName === "reviews") {
          const reviewsCount = await page
            .$$eval(".wKtRYe.PZPZlf", (reviews) => reviews.length)
            .catch(() => 0);
          log(`📊 Currently showing ${reviewsCount} reviews`);

          // If we have a good number of reviews already, consider it a success
          if (reviewsCount > 2) {
            log(
              `✅ Found ${reviewsCount} reviews which seems sufficient, continuing...`
            );
            break;
          }
        }

        // If we've tried multiple times without success, give up
        if (attempts >= 3) {
          log(
            `ℹ️ Giving up on finding ${sectionName} button after ${attempts} attempts`
          );
          break;
        }

        // Wait a bit longer before next attempt
        await waitForTimeout(1000);
        continue;
      }

      // Button found, try to click it
      log(`✅ Found ${sectionName} button, scrolling to it...`);

      // Scroll to make sure the button is in view
      await page
        .evaluate((el) => {
          el.scrollIntoView({ behavior: "smooth", block: "center" });

          // Highlight for debugging (visible in headful mode)
          el.style.border = "3px solid red";
          el.style.backgroundColor = "yellow";
        }, button)
        .catch((e) => log(`⚠️ Error scrolling: ${e.message}`, true));

      // Wait for scroll to complete
      await waitForTimeout(700);

      // Try clicking with multiple methods
      let clickSucceeded = false;

      // Method 1: Native click
      try {
        log(`🖱️ Clicking ${sectionName} button (method 1)...`);
        await button.click({ delay: 100 });
        clickSucceeded = true;
      } catch (err) {
        log(`⚠️ Method 1 click failed: ${err.message}`, true);

        // Method 2: JavaScript click
        try {
          log(`🖱️ Clicking ${sectionName} button (method 2)...`);
          await page.evaluate((el) => el.click(), button);
          clickSucceeded = true;
        } catch (err2) {
          log(`⚠️ Method 2 click failed: ${err2.message}`, true);

          // Method 3: Mouse events
          try {
            log(`🖱️ Clicking ${sectionName} button (method 3)...`);
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
            log(`⚠️ Method 3 click failed: ${err3.message}`, true);
          }
        }
      }

      if (clickSucceeded) {
        clickCount++;
        log(
          `✅ Click ${clickCount}/${maxClicks} on "${sectionName}" button successful`
        );

        // Wait for content to load
        await waitForTimeout(delay);

        // Check if content increased
        if (sectionName === "stores") {
          const storesCount = await page
            .$$eval(".R5K7Cb.SPI3ee", (stores) => stores.length)
            .catch(() => 0);
          log(
            `📊 Found ${storesCount} stores after click ${clickCount}`
          );
        } else if (sectionName === "reviews") {
          const reviewsCount = await page
            .$$eval(".wKtRYe.PZPZlf", (reviews) => reviews.length)
            .catch(() => 0);
          log(
            `📊 Found ${reviewsCount} reviews after click ${clickCount}`
          );
        }
      } else {
        log(`⚠️ All click methods failed for ${sectionName} button`, true);

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
        log(
          `ℹ️ No more "${sectionName}" buttons available after ${clickCount} clicks`
        );
        break;
      }
    } catch (error) {
      log(
        `⚠️ Error during ${sectionName} expansion attempt ${attempts}: ${error.message}`, true
      );

      // If we've had too many errors, give up
      if (attempts >= maxAttempts - 1) {
        log(
          `ℹ️ Giving up on ${sectionName} expansion after too many errors`
        );
        break;
      }
    }
  }

  log(`✅ Expanded ${sectionName} section with ${clickCount} clicks`);
  return clickCount;
}

// Check if this file is being run directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // Get URL from command line arguments if provided
  const url = process.argv[2];
  const category = process.argv[3];
  const brand = process.argv[4];
  
  // Use the correct config variables for command line arguments
  const storesClicks = process.argv[5] ? parseInt(process.argv[5], 10) : config.MAX_CLICK_ATTEMPTS_STORES;
  const reviewsClicks = process.argv[6] ? parseInt(process.argv[6], 10) : config.MAX_CLICK_ATTEMPTS_REVIEWS;

  if (!url) {
    log("❌ Error: URL is required", true);
    log("Usage: node scrapper.js <url> [category] [brand] [storesClicks] [reviewsClicks]");
    process.exit(1);
  }

  // Run the scraper with arguments
  scrapeProduct(url, { 
    category, 
    brand, 
    maxClicksStores: storesClicks,
    maxClicksReviews: reviewsClicks
  })
    .then(() => {
      log("✅ Scraping completed successfully");
      // Exit after direct execution
      setTimeout(() => process.exit(0), 2000);
    })
    .catch((error) => {
      // Avoid duplicating the error message since we've already logged it with our enhanced logger
      log("❌ Scraping failed", true);
      process.exit(1);
    });
} else {
  // Export the function for use in other files
  log("📦 Exporting scrapeProduct function");
}

export default scrapeProduct;