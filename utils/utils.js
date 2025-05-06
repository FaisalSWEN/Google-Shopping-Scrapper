/**
 * Utility functions for the Google Shopping scraper
 */

/**
 * Converts Arabic numerals and decimal separators to Western format
 * @param {string} text - Text that may contain Arabic numerals
 * @returns {string|null} - Converted text with Western numerals or null if empty
 */
export function convertArabicNumerals(text) {
  if (!text) return null;
  
  // Map of Arabic numerals to Western numerals
  const arabicToWesternNumerals = {
    '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
    '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
    '٬': ',', '٫': '.' // Arabic thousand separator and decimal point
  };
  
  // Convert Arabic numerals to Western (if any)
  let westernizedText = '';
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    westernizedText += arabicToWesternNumerals[char] || char;
  }
  
  return westernizedText;
}

/**
 * Extracts numeric values from a string, handling both Western and Arabic numerals
 * @param {string} text - Text containing price information
 * @returns {number|null} - Extracted numeric value as number or null if not found
 */
export function extractNumbers(text) {
  if (!text) return null;
  
  // First convert any Arabic numerals to Western
  const westernizedText = convertArabicNumerals(text);
  
  // Then extract the numeric part (now with western numerals)
  const match = westernizedText.match(/[\d,\.]+/g);
  if (!match) return null;
  
  // Convert to number, removing commas
  const numericValue = parseFloat(match.join('').replace(/,/g, ''));
  return isNaN(numericValue) ? null : numericValue;
}

/**
 * Converts a string or number rating to a proper numeric rating value
 * @param {string|number} rating - Rating value to convert
 * @returns {number|null} - Numeric rating or null if invalid
 */
export function formatRating(rating) {
  if (rating === null || rating === undefined) return null;
  
  // If it's already a number, ensure it's properly formatted
  if (typeof rating === 'number') {
    return Number(rating.toFixed(1));
  }
  
  // If it's a string, convert to number
  const numericRating = parseFloat(rating.replace(/,/g, '.'));
  return isNaN(numericRating) ? null : Number(numericRating.toFixed(1));
}

/**
 * Function to find the lowest price among all stores
 * @param {Array} stores - Array of store objects
 * @returns {number|null} - Lowest price as number or null if none found
 */
export function getLowestPrice(stores) {
  if (!stores || stores.length === 0) return null;
  
  // Filter out stores with no valid price and find the minimum
  const validPrices = stores
    .filter(store => store.current_price !== null && store.current_price !== undefined)
    .map(store => typeof store.current_price === 'number' ? 
          store.current_price : 
          parseFloat(String(store.current_price).replace(/,/g, '')));
  
  if (validPrices.length === 0) return null;
  return Math.min(...validPrices);
}

/**
 * Function to find the highest price among all stores
 * @param {Array} stores - Array of store objects
 * @returns {number|null} - Highest price as number or null if none found
 */
export function getHighestPrice(stores) {
  if (!stores || stores.length === 0) return null;
  
  // Filter out stores with no valid price and find the maximum
  const validPrices = stores
    .filter(store => store.current_price !== null && store.current_price !== undefined)
    .map(store => typeof store.current_price === 'number' ? 
          store.current_price : 
          parseFloat(String(store.current_price).replace(/,/g, '')));
  
  if (validPrices.length === 0) return null;
  return Math.max(...validPrices);
}

/**
 * Function to calculate the average price among all stores
 * @param {Array} stores - Array of store objects
 * @returns {number|null} - Average price as number or null if none found
 */
export function getAveragePrice(stores) {
  if (!stores || stores.length === 0) return null;
  
  // Filter out stores with no valid price
  const validPrices = stores
    .filter(store => store.current_price !== null && store.current_price !== undefined)
    .map(store => typeof store.current_price === 'number' ? 
          store.current_price : 
          parseFloat(String(store.current_price).replace(/,/g, '')));
  
  if (validPrices.length === 0) return null;
  
  // Calculate the average price
  const sum = validPrices.reduce((acc, price) => acc + price, 0);
  return Number((sum / validPrices.length).toFixed(2));
}