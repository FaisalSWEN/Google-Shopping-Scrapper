import { detectCaptcha } from "./captchaHandler.js";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get directory name for screenshots
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const screenshotsDir = path.join(__dirname, '..', 'screenshots');
const captchaDir = path.join(screenshotsDir, 'captcha');
const debugDir = path.join(screenshotsDir, 'debug');

// Create screenshots directories if they don't exist
if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}
if (!fs.existsSync(captchaDir)) {
  fs.mkdirSync(captchaDir, { recursive: true });
}
if (!fs.existsSync(debugDir)) {
  fs.mkdirSync(debugDir, { recursive: true });
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
 * Checks for CAPTCHA and launches a visible browser if needed
 * @param {string} url - URL to navigate to
 * @returns {Promise<{browser: Object, page: Object}>} - Browser and page objects
 */
export async function launchBrowserWithCaptchaHandling(url) {
  // First attempt - launch in headless mode
  console.log("🌐 Launching browser in headless mode for initial attempt...");
  const browser = await puppeteer.launch({ 
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-infobars',
      '--window-position=0,0',
      '--ignore-certificate-errors',
      '--ignore-certificate-errors-spki-list',
      '--disable-web-security'
    ]
  });

  const page = await browser.newPage();
  
  // Set standard viewport and user agent
  await page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  
  // Set standard headers
  await page.setExtraHTTPHeaders({
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': 'en-US,en;q=0.9,ar;q=0.8',
    'Cache-Control': 'max-age=0',
    'Connection': 'keep-alive',
    'Sec-Ch-Ua': '"Chromium";v="120", "Google Chrome";v="120"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Upgrade-Insecure-Requests': '1'
  });

  // Standard fingerprint modifications
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    window.chrome = { runtime: {} };
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en', 'ar'] });
  });

  try {
    // Navigate to the URL
    await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
    
    // Check if we encountered a CAPTCHA
    const captchaDetected = await detectCaptcha(page);
    
    if (captchaDetected) {
      console.log("🤖 CAPTCHA detected in headless mode! Switching to visible browser...");
      
      // Take screenshot before closing headless browser (for debugging)
      const captchaScreenshotPath = path.join(captchaDir, `captcha_detected_${Date.now()}.png`);
      await page.screenshot({ path: captchaScreenshotPath, fullPage: true });
      console.log(`📸 CAPTCHA page screenshot saved to: ${captchaScreenshotPath}`);
      
      // Close the headless browser
      await browser.close();
      
      try {
        // Launch a visible browser for manual CAPTCHA solving
        console.log("🌐 Launching visible browser for CAPTCHA solving...");
        const visibleBrowser = await puppeteer.launch({ 
          headless: false,
          defaultViewport: null, // Use default viewport of the browser
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-infobars',
            '--window-position=0,0',
            '--window-size=1366,768',
            '--ignore-certificate-errors'
          ]
        });
        
        const visiblePage = await visibleBrowser.newPage();
        
        // Set standard user agent - keep the viewport as browser default
        await visiblePage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        // Same fingerprint modifications
        await visiblePage.evaluateOnNewDocument(() => {
          Object.defineProperty(navigator, 'webdriver', { get: () => false });
          window.chrome = { runtime: {} };
          Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en', 'ar'] });
        });
        
        // Add error event handler to capture navigation errors
        visiblePage.on('error', err => {
          console.error(`🔴 Page error occurred: ${err.message}`);
        });
        
        // Navigate to the URL in visible browser with error handling
        console.log(`🌐 Navigating to: ${url}`);
        try {
          await visiblePage.goto(url, { 
            waitUntil: "domcontentloaded", 
            timeout: 60000 // Longer timeout for manual solving
          });
          console.log('✅ Navigation successful');
        } catch (navigationError) {
          console.error(`🔴 Navigation error: ${navigationError.message}`);
          // Take screenshot of the error state
          const errorScreenshotPath = path.join(debugDir, `navigation_error_${Date.now()}.png`);
          await visiblePage.screenshot({ path: errorScreenshotPath, fullPage: true });
          console.log(`📸 Error screenshot saved to: ${errorScreenshotPath}`);
          
          // Try to continue anyway as the page might have partially loaded
          console.log('⚠️ Attempting to continue despite navigation error...');
        }
        
        // Create readline interface for user input
        const readline = await import('readline');
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        });
        
        // Prompt user and wait for confirmation
        await new Promise(resolve => {
          console.log('\n⚠️ CAPTCHA SOLVING INSTRUCTIONS:');
          console.log('1. A browser window has been opened');
          console.log('2. Solve the CAPTCHA in that window');
          console.log('3. Wait for the page to fully load after solving');
          console.log('4. Return here and press ENTER once solved\n');
          
          rl.question('Press ENTER after you have manually solved the CAPTCHA... ', answer => {
            resolve(answer);
            rl.close();
          });
        });
        
        console.log('✅ Continuing scraping process after CAPTCHA intervention...');
        
        // Take a screenshot after CAPTCHA solving to verify page state
        const postCaptchaScreenshot = path.join(captchaDir, `post_captcha_${Date.now()}.png`);
        await visiblePage.screenshot({ path: postCaptchaScreenshot, fullPage: true });
        console.log(`📸 Post-CAPTCHA screenshot saved to: ${postCaptchaScreenshot}`);
        
        // Wait for the page to stabilize after CAPTCHA using cross-compatible wait function
        await waitFor(visiblePage, 5000);
        
        // Check if we're on the correct page after CAPTCHA solving
        const currentUrl = visiblePage.url();
        console.log(`📍 Current URL after CAPTCHA: ${currentUrl}`);
        
        // Capture page content for debugging
        const pageContent = await visiblePage.content();
        fs.writeFileSync(path.join(debugDir, `page_content_after_captcha_${Date.now()}.html`), pageContent);
        
        return { browser: visibleBrowser, page: visiblePage };
      } catch (visibleBrowserError) {
        console.error(`🔴 Error with visible browser: ${visibleBrowserError.message}`);
        console.error(visibleBrowserError.stack);
        
        // Fallback to launching a new headless browser as last resort
        console.log('⚠️ Falling back to headless browser...');
        const fallbackBrowser = await puppeteer.launch({ 
          headless: 'new',
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-infobars',
            '--window-position=0,0',
            '--ignore-certificate-errors'
          ]
        });
        
        const fallbackPage = await fallbackBrowser.newPage();
        await fallbackPage.setViewport({ width: 1366, height: 768 });
        await fallbackPage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        // Don't navigate - let the caller handle navigation
        return { browser: fallbackBrowser, page: fallbackPage };
      }
    }
    
    // No CAPTCHA, return the original browser and page
    return { browser, page };
    
  } catch (error) {
    // If there's an error during the initial navigation, close browser and rethrow
    console.error(`🔴 Error in browser launcher: ${error.message}`);
    console.error(error.stack);
    
    try {
      // Take screenshot of error state if possible
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