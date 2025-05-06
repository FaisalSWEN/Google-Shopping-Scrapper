/**
 * Utility for handling CAPTCHA challenges during web scraping
 * Provides functions to detect CAPTCHAs and implement manual intervention
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';

// Get directory name for the current module
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Create organized directory structure for screenshots
const screenshotsDir = path.join(__dirname, '..', 'screenshots');
const captchaDir = path.join(screenshotsDir, 'captcha');

// Create screenshots directories if they don't exist
if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}
if (!fs.existsSync(captchaDir)) {
  fs.mkdirSync(captchaDir, { recursive: true });
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
 * Detects if the current page contains a CAPTCHA
 * @param {Object} page - Puppeteer page object
 * @returns {Promise<boolean>} true if CAPTCHA detected
 */
export async function detectCaptcha(page) {
  try {
    // First check if we're on a known CAPTCHA page based on URL
    const url = page.url();
    if (url.includes('google.com/sorry/') || url.includes('/recaptcha/') || url.includes('captcha')) {
      console.log(`🤖 CAPTCHA detected via URL pattern: ${url}`);
      return true;
    }
    
    // Common CAPTCHA identifiers - these are very specific selectors that should only appear on CAPTCHA pages
    const captchaSelectors = [
      'iframe[src*="recaptcha"]',
      'iframe[src*="captcha"]',
      '.g-recaptcha',
      '#captcha',
      'form[action*="captcha"]',
      '.captcha-container'
    ];

    // Check for specific CAPTCHA selectors
    for (const selector of captchaSelectors) {
      const element = await page.$(selector);
      if (element) {
        console.log(`🤖 CAPTCHA detected via selector: ${selector}`);
        return true;
      }
    }

    // Check specifically for Google's "Our systems have detected unusual traffic" page
    // This is a more precise detection method that looks for specific Google CAPTCHA page patterns
    const isGoogleCaptchaPage = await page.evaluate(() => {
      // Check for the specific text that appears on Google CAPTCHA pages
      const pageText = document.body.innerText;
      
      // Look for the precise Google CAPTCHA message which includes specific phrases
      const captchaPhrases = [
        'Our systems have detected unusual traffic from your computer network',
        'حركة مرور غير عادية', // Arabic version
        'أنظمتنا اكتشفت حركة مرور غير عادية', // Another Arabic variant
        'This page appears when Google automatically detects requests coming from your computer network',
        'About this page' // This appears on CAPTCHA pages
      ];
      
      // Check if we have a specific CAPTCHA element
      if (document.querySelector('#recaptcha') || 
          document.querySelector('.recaptcha') ||
          document.querySelector('[action*="sorry/index"]')) {
        return true;
      }
      
      // Need at least two of these phrases to confirm it's a CAPTCHA page
      // This helps prevent false positives from regular content
      let matchCount = 0;
      for (const phrase of captchaPhrases) {
        if (pageText.includes(phrase)) {
          matchCount++;
          if (matchCount >= 2) {
            return true;
          }
        }
      }
      
      // Check for Google CAPTCHA page structure - very specific to Google CAPTCHA pages
      if (document.querySelector('form[action*="sorry/index"]') && 
          document.querySelector('input[name="captcha"]')) {
        return true;
      }
      
      return false;
    });

    if (isGoogleCaptchaPage) {
      console.log('🤖 Google CAPTCHA/verification page detected');
      return true;
    }

    // If nothing detected
    return false;
  } catch (error) {
    console.error(`❌ Error checking for CAPTCHA: ${error.message}`);
    return false; // Assume no CAPTCHA on error
  }
}

/**
 * Handles CAPTCHA by taking screenshot and waiting for manual intervention
 * @param {Object} page - Puppeteer page object
 * @returns {Promise<boolean>} true if successfully handled
 */
export async function handleCaptcha(page) {
  try {
    console.log('\n🔴 CAPTCHA CHALLENGE DETECTED! Manual intervention required.');
    
    // Take screenshot of the CAPTCHA
    const timestamp = new Date().toISOString().replace(/:/g, '-');
    const screenshotPath = path.join(captchaDir, `captcha_${timestamp}.png`);
    
    await page.screenshot({ 
      path: screenshotPath,
      fullPage: false // Just capture the viewport
    });
    
    console.log(`📷 CAPTCHA screenshot saved to: ${screenshotPath}`);
    console.log('🔍 Please open this image and solve the CAPTCHA in the browser.');

    // Create readline interface for user input
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    // Prompt user and wait for confirmation
    await new Promise(resolve => {
      console.log('\n⚠️ INSTRUCTIONS:');
      console.log('1. Look at the CAPTCHA screenshot');
      console.log('2. Switch to the browser window that puppeteer opened');
      console.log('3. Solve the CAPTCHA manually');
      console.log('4. Return here and press ENTER once solved\n');
      
      rl.question('Press ENTER after you have manually solved the CAPTCHA... ', answer => {
        resolve(answer);
        rl.close();
      });
    });
    
    console.log('✅ Continuing scraping process after CAPTCHA intervention...');
    
    // Wait a moment to make sure the page has fully loaded after CAPTCHA
    // Using our compatible waitFor function instead of page.waitForTimeout
    await waitFor(page, 2000);
    
    return true;
  } catch (error) {
    console.error(`❌ Error handling CAPTCHA: ${error.message}`);
    return false;
  }
}

/**
 * Checks for CAPTCHA and handles it if detected
 * @param {Object} page - Puppeteer page object
 * @returns {Promise<boolean>} true if CAPTCHA was detected and handled
 */
export async function checkAndHandleCaptcha(page) {
  const captchaDetected = await detectCaptcha(page);
  
  if (captchaDetected) {
    return await handleCaptcha(page);
  }
  
  return false;
}