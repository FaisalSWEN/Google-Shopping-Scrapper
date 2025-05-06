import { detectCaptcha, handleCaptcha } from "./captchaHandler.js";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get directory name for various paths
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const screenshotsDir = path.join(__dirname, '..', 'screenshots');
const captchaDir = path.join(screenshotsDir, 'captcha');
const debugDir = path.join(screenshotsDir, 'debug');
const dataDir = path.join(__dirname, '..', 'data');
const userDataDir = path.join(__dirname, '..', 'browser-data');

// Create necessary directories if they don't exist
for (const dir of [screenshotsDir, captchaDir, debugDir, dataDir, userDataDir]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Apply the stealth plugin
puppeteer.use(StealthPlugin());

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
 * Save cookies from current session for future use
 * @param {Object} page - Puppeteer page object
 * @returns {Promise<void>}
 */
async function saveCookies(page) {
  try {
    const cookies = await page.cookies();
    if (cookies.length > 0) {
      const cookieFile = path.join(dataDir, 'cookies.json');
      fs.writeFileSync(cookieFile, JSON.stringify(cookies, null, 2));
      console.log(`🍪 Saved ${cookies.length} cookies for future sessions`);
      
      // Also save domain information
      const url = page.url();
      let domain = 'google.com';
      try {
        domain = new URL(url).hostname;
      } catch (e) {
        console.log(`⚠️ Couldn't parse URL domain, using default: ${domain}`);
      }
      
      fs.writeFileSync(
        path.join(dataDir, 'session-info.json'), 
        JSON.stringify({ domain, lastUsed: new Date().toISOString() }, null, 2)
      );
    } else {
      console.log('⚠️ No cookies found to save');
    }
  } catch (error) {
    console.error(`❌ Error saving cookies: ${error.message}`);
  }
}

/**
 * Load cookies from previous sessions
 * @param {Object} page - Puppeteer page object
 * @returns {Promise<boolean>} Whether cookies were successfully loaded
 */
async function loadCookies(page) {
  try {
    const cookieFile = path.join(dataDir, 'cookies.json');
    if (!fs.existsSync(cookieFile)) {
      console.log('⚠️ No stored cookies found');
      return false;
    }

    const cookiesString = fs.readFileSync(cookieFile, 'utf8');
    const cookies = JSON.parse(cookiesString);
    
    if (cookies.length > 0) {
      await page.setCookie(...cookies);
      console.log(`🍪 Loaded ${cookies.length} cookies from previous session`);
      
      // Check session age
      const sessionInfoFile = path.join(dataDir, 'session-info.json');
      if (fs.existsSync(sessionInfoFile)) {
        const sessionInfo = JSON.parse(fs.readFileSync(sessionInfoFile, 'utf8'));
        const lastUsed = new Date(sessionInfo.lastUsed);
        const now = new Date();
        const hoursSinceLastUse = (now - lastUsed) / (1000 * 60 * 60);
        
        console.log(`ℹ️ Session is ${hoursSinceLastUse.toFixed(1)} hours old`);
        
        // Warning if session is older than 12 hours
        if (hoursSinceLastUse > 12) {
          console.log('⚠️ Session is older than 12 hours, might require re-authentication');
        }
      }
      
      return true;
    } else {
      console.log('⚠️ Cookie file exists but contains no cookies');
      return false;
    }
  } catch (error) {
    console.error(`❌ Error loading cookies: ${error.message}`);
    return false;
  }
}

/**
 * Launch browser with persistent profile and cookie reuse
 * @param {string} url - URL to navigate to
 * @param {Object} options - Options for the browser launcher
 * @param {boolean} options.forceVisible - Always use visible browser even without CAPTCHA
 * @returns {Promise<{browser: Object, page: Object}>} - Browser and page objects
 */
export async function launchBrowserWithPersistence(url, options = {}) {
  const { forceVisible = false } = options;
  
  // First attempt - try headless mode if not forcing visible
  let useHeadless = !forceVisible ? 'new' : false;
  
  console.log(`🌐 Launching browser with persistent profile (headless: ${useHeadless === false ? 'no' : 'yes'})...`);
  
  // Launch browser with persistent profile
  let browser = await puppeteer.launch({ 
    headless: useHeadless,
    userDataDir: userDataDir, // Use persistent profile
    defaultViewport: null, // Use default viewport of the browser window
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-infobars',
      '--window-position=0,0',
      '--window-size=1366,768',
      '--ignore-certificate-errors',
      '--disable-features=IsolateOrigins,site-per-process', 
      '--disable-blink-features=AutomationControlled'
    ]
  });

  let page = await browser.newPage();
  
  // Set standard user agent - better to be consistent
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  
  // Apply stealth settings
  await page.evaluateOnNewDocument(() => {
    // Hide webdriver from detection
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    
    // Add chrome properties to make it look like a real browser
    window.chrome = {
      runtime: {},
      loadTimes: function() {},
      csi: function() {},
      app: {}
    };
    
    // Set consistent language preferences
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en', 'ar'] });
    
    // Override permissions
    window.navigator.permissions = {
      query: function() {
        return Promise.resolve({ state: 'granted' });
      }
    };
  });
  
  // Load cookies from previous session
  await loadCookies(page);
  
  try {
    // Navigate to the URL with better timeout and waiting
    console.log(`🌐 Navigating to: ${url}`);
    await page.goto(url, { 
      waitUntil: "domcontentloaded", // Less strict than networkidle2, better for avoiding timeouts
      timeout: 60000  // Longer timeout for slow connections
    });
    
    // Check if we hit a CAPTCHA
    const captchaDetected = await detectCaptcha(page);
    
    if (captchaDetected) {
      console.log("🤖 CAPTCHA detected in headless mode! Switching to visible browser...");
      
      // Take screenshot of the CAPTCHA
      const captchaScreenshotPath = path.join(captchaDir, `captcha_detected_${Date.now()}.png`);
      await page.screenshot({ path: captchaScreenshotPath, fullPage: true });
      console.log(`📸 CAPTCHA screenshot saved to: ${captchaScreenshotPath}`);
      
      // Close the headless browser and launch a visible one
      await browser.close();
      console.log("🌐 Launching visible browser for CAPTCHA solving...");
      
      // Launch a new visible browser
      browser = await puppeteer.launch({
        headless: false, // MUST be visible for CAPTCHA solving
        userDataDir: userDataDir,
        defaultViewport: null,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-infobars',
          '--window-position=0,0',
          '--window-size=1366,768',
          '--ignore-certificate-errors',
          '--disable-features=IsolateOrigins,site-per-process',
          '--disable-blink-features=AutomationControlled'
        ]
      });
      
      // Create a new page
      page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      
      // Apply the same stealth settings
      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
        window.chrome = { runtime: {}, loadTimes: function() {}, csi: function() {}, app: {} };
        Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en', 'ar'] });
        window.navigator.permissions = { query: function() { return Promise.resolve({ state: 'granted' }); } };
      });
      
      // Try to load cookies again
      await loadCookies(page);
      
      // Navigate to the URL in the visible browser
      console.log(`🌐 Navigating to: ${url}`);
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
      console.log("✅ Navigation successful");
      
      // Handle the CAPTCHA in the visible browser
      await handleCaptcha(page);
      
      // Save cookies after CAPTCHA is solved
      await saveCookies(page);
      
      // Wait a bit after solving
      await waitFor(page, 3000);
      
      // Verify if we're on the right page
      const currentUrl = page.url();
      console.log(`📍 Current URL after CAPTCHA: ${currentUrl}`);
    } else {
      console.log("✅ No CAPTCHA detected, continuing with scraping");
    }
    
    return { browser, page };
    
  } catch (error) {
    console.error(`🔴 Error in browser launcher: ${error.message}`);
    console.error(error.stack);
    
    // Try to take screenshot of the error state
    try {
      const errorScreenshotPath = path.join(debugDir, `launcher_error_${Date.now()}.png`);
      await page.screenshot({ path: errorScreenshotPath, fullPage: true }).catch(() => {});
      console.log(`📸 Error screenshot saved to: ${errorScreenshotPath}`);
    } catch (screenshotError) {
      console.error(`⚠️ Could not take error screenshot: ${screenshotError.message}`);
    }
    
    await browser.close();
    throw error;
  }
}

/**
 * Save the session when scraping is complete
 * @param {Object} page - Puppeteer page object 
 */
export async function saveSession(page) {
  if (page) {
    await saveCookies(page);
    console.log('✅ Session saved successfully');
  }
}