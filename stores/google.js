/**
 * Contains the specialized parsing functions for Google Shopping pages.
 *
 * Extracts product details, store prices, reviews, and rating distribution from the HTML using Cheerio selectors.
 *
 * Calculates price statistics and structures the data for database storage.
 */

import {
  convertArabicNumerals,
  extractNumbers,
  formatRating,
  getLowestPrice,
  getHighestPrice,
  getAveragePrice,
} from "../utils/utils.js";
import { googleSelectors } from "../config/selectors.js";

/**
 * Scrapes product data from Google Shopping
 * @param {Object} $ - Cheerio instance loaded with HTML content
 * @param {string} url - Original URL that was scraped
 * @param {Object} options - Options for customizing the scrape
 * @param {string} options.category - Product category (e.g., 'phones', 'laptops')
 * @param {string} options.brand - Product brand (e.g., 'Apple', 'Samsung')
 * @returns {Object} Structured product data
 */
function scrapeGoogleShopping($, url, options = {}) {
  // Get all store containers
  const storeContainers = $(googleSelectors.stores.container);

  const productName =
    storeContainers.first().find(googleSelectors.stores.productTitle).text().trim() || null;
  const stores = [];

  // Extract product images (limited to 4)
  const photoLinks = [];
  $(googleSelectors.product.images).each((i, el) => {
    if (photoLinks.length < 4) {
      const imgSrc = $(el).attr("src");
      if (imgSrc && !photoLinks.includes(imgSrc)) {
        photoLinks.push(imgSrc);
      }
    }
  });

  // Extract product type information
  let productType = null;
  $(googleSelectors.product.type).each((i, el) => {
    const typeText = $(el).text().trim();
    if (typeText) {
      productType = typeText;
    }
  });

  // Use provided options or try to detect from content
  const category = options.category || detectCategoryFromName(productName);
  const brand = options.brand || detectBrandFromName(productName);

  storeContainers.each((i, el) => {
    const container = $(el);
    const storeData = {};

    // Store name extraction
    storeData.store = container.find(googleSelectors.stores.name).text().trim() || null;

    // Current price extraction - try multiple selectors
    let priceText = null;

    for (const selector of googleSelectors.stores.currentPrice) {
      const priceEl = container.find(selector).first();
      if (priceEl.length > 0) {
        priceText = priceEl.text().trim();
        break;
      }
    }

    storeData.current_price = extractNumbers(priceText);

    // Original price extraction - look for multiple possible classes
    let oldPriceText = null;
    
    for (const selector of googleSelectors.stores.originalPrice) {
      const oldPriceEl = container.find(selector).first();
      if (oldPriceEl.length > 0) {
        oldPriceText = oldPriceEl.text().trim();
        if (oldPriceText) break;
      }
    }

    storeData.original_price =
      extractNumbers(oldPriceText) || storeData.current_price;

    // Rating extraction with proper number formatting
    const ratingText = container.find(googleSelectors.stores.rating).first().text().trim();
    storeData.rating = formatRating(ratingText);

    // Free delivery check
    const deliveryText = container.find(googleSelectors.stores.delivery).text().toLowerCase();
    storeData.free_delivery =
      deliveryText.includes("مجاني") ||
      deliveryText.includes("free") ||
      deliveryText.includes("مجانا");

    // Product details
    storeData.product_title = container.find(googleSelectors.stores.productTitle).text().trim() || null;
    storeData.product_url = container.find(googleSelectors.stores.productUrl).attr("href") || null;

    stores.push(storeData);
  });

  // Scrape reviews (without limit)
  const reviews = scrapeReviews($);

  // Scrape rating distribution
  const ratingDistribution = scrapeRatingDistribution($);

  return {
    category,
    brand,
    product_name: productName,
    product_type: productType,
    photo_links: photoLinks,
    stores: stores,
    reviews: reviews,
    rating_distribution: ratingDistribution,
    source_url: url,
    lowestPrice: getLowestPrice(stores),
    highestPrice: getHighestPrice(stores),
    averagePrice: getAveragePrice(stores),
    priceHistory: [],
    users: [],
  };
}

/**
 * Attempts to detect product brand from the product name
 * @param {string} productName - The product name
 * @returns {string} Detected brand or "Unknown"
 */
function detectBrandFromName(productName) {
  if (!productName) return "Unknown";
  
  const productNameLower = productName.toLowerCase();
  
  // Brand detection patterns with both English and Arabic names
  const brandPatterns = [
    // Apple products
    {
      brand: "Apple",
      patterns: [
        /iphone|آيفون|أيفون|ايفون/, // iPhone variations in English and Arabic
        /ipad|آيباد|أيباد|ايباد/, // iPad variations
        /macbook|ماك بوك|ماكبوك/, // MacBook variations
        /apple watch|ساعة ابل|ساعة آبل|أبل واتش/, // Apple Watch variations
        /airpods|ايربودز|إيربودز/, // AirPods variations
        /^apple |^أبل |^آبل |^ابل /, // Starts with Apple
      ]
    },
    // Samsung products
    {
      brand: "Samsung",
      patterns: [
        /galaxy|جالاكسي|جالكسي/, // Galaxy variations
        /samsung|سامسونج|سامسونغ/, // Samsung variations
        /note\s*\d+|نوت\s*\d+/, // Note series
        /s\s*\d+\s*(plus|ultra)?|اس\s*\d+/, // S series
        /tab\s*[a-s]\d*|تاب\s*[a-s]\d*/, // Tab series
      ]
    },
    // Google products
    {
      brand: "Google",
      patterns: [
        /pixel|بيكسل/, // Pixel phones
        /google|جوجل/, // Google branded
      ]
    },
    // Xiaomi products
    {
      brand: "Xiaomi",
      patterns: [
        /xiaomi|شاومي|شياومي/, // Xiaomi variations
        /redmi|ريدمي/, // Redmi variations
        /poco|بوكو/, // Poco variations
        /mi\s*\d+|مي\s*\d+/, // Mi series
      ]
    },
    // Huawei products
    {
      brand: "Huawei",
      patterns: [
        /huawei|هواوي|هواويه/, // Huawei variations
        /mate\s*\d+|ميت\s*\d+/, // Mate series
        /p\s*\d+\s*(pro|lite)?|بي\s*\d+/, // P series
      ]
    },
    // Sony products
    {
      brand: "Sony",
      patterns: [
        /sony|سوني/, // Sony variations
        /xperia|اكسبيريا|إكسبيريا/, // Xperia variations
        /playstation|بلايستيشن|بلاي ستيشن|بلاي ستيشن/, // PlayStation variations
      ]
    },
    // LG products
    {
      brand: "LG",
      patterns: [
        /^lg\s|^ال جي\s/, // LG at the beginning
        /lg\s*([a-z])?\d+|ال جي\s*([a-z])?\d+/, // LG models
      ]
    },
    // Nokia products
    {
      brand: "Nokia",
      patterns: [
        /nokia|نوكيا/, // Nokia variations
      ]
    },
    // OnePlus products
    {
      brand: "OnePlus",
      patterns: [
        /oneplus|ون بلس|وان بلس/, // OnePlus variations
      ]
    },
    // Oppo products
    {
      brand: "Oppo",
      patterns: [
        /oppo|أوبو|اوبو/, // Oppo variations
        /reno\s*\d+|رينو\s*\d+/, // Reno series
        /find\s*x\d*|فايند\s*[إكس]\d*/, // Find X series
      ]
    },
    // Vivo products
    {
      brand: "Vivo",
      patterns: [
        /vivo|فيفو/, // Vivo variations
      ]
    },
    // Realme products
    {
      brand: "Realme",
      patterns: [
        /realme|ريلمي|ريلمى/, // Realme variations
      ]
    }
  ];
  
  // Check each brand's patterns
  for (const { brand, patterns } of brandPatterns) {
    for (const pattern of patterns) {
      if (pattern.test(productNameLower)) {
        return brand;
      }
    }
  }
  
  return "Unknown";
}

/**
 * Attempts to detect product category from the product name
 * @param {string} productName - The product name
 * @returns {string} Detected category or "other"
 */
function detectCategoryFromName(productName) {
  if (!productName) return "other";
  
  const productNameLower = productName.toLowerCase();
  
  // Check for specific high-priority identifiers first
  // Laptops - check first to ensure MacBooks are properly identified
  if (/macbook|ماك بوك|ماكبوك/.test(productNameLower) ||
      /laptop|لابتوب|نوت بوك/.test(productNameLower) ||
      /notebook|نوتبوك/.test(productNameLower) ||
      /chromebook|كروم بوك/.test(productNameLower) ||
      /thinkpad|ثينك باد/.test(productNameLower) ||
      /surface book|سيرفس/.test(productNameLower) ||
      /dell xps|ديل/.test(productNameLower) ||
      /hp spectre|إتش بي/.test(productNameLower)) {
    return "laptops";
  }
  
  // iPads/Tablets - check these next
  if (/ipad|آيباد|أيباد|ايباد/.test(productNameLower) ||
      /tablet|تابلت|لوحي/.test(productNameLower) ||
      /galaxy tab|جالاكسي تاب/.test(productNameLower) ||
      /mi pad|شاومي باد/.test(productNameLower)) {
    return "tablets";
  }
  
  // Full category detection patterns
  const categoryPatterns = [
    // Smartphones
    {
      category: "phones",
      patterns: [
        /iphone|آيفون|أيفون|ايفون/, // iPhone in English and Arabic
        /galaxy\s*[a-z]?\d+|جالاكسي|جالكسي/, // Galaxy phones
        /pixel\s*\d+|بيكسل/, // Google Pixel
        /redmi|ريدمي/, // Xiaomi Redmi
        /poco|بوكو/, // Xiaomi Poco
        /هاتف|موبايل|جوال|تليفون/, // Generic Arabic terms for phone
        /smartphone|phone|mobile|جوال/, // Generic English terms
        /xiaomi|شاومي|هواوي/, // Common phone brands
        /\d+g|5g|4g/, // Network indicators often for phones
        /128gb|256gb|512gb|128 جيجا|256 جيجا/, // Common phone storage sizes
        /pro\s*max|برو\s*ماكس/, // Pro Max suffix common in phones
        /faceTime/i, // FaceTime (for iPhones)
      ]
    },
    // Audio products
    {
      category: "audio",
      patterns: [
        /airpods|ايربودز|إيربودز/, // AirPods variations
        /headphone|سماعة رأس|سماعات/, // Headphones
        /earbuds|سماعات أذن/, // Earbuds
        /speaker|مكبر صوت|سبيكر/, // Speakers
        /bose|بوز/, // Bose audio brand
        /sony wh|سوني/, // Sony headphones
        /homepod|هوم بود/, // Apple HomePod
        /echo dot|إيكو دوت/, // Amazon Echo
      ]
    },
    // Smartwatches
    {
      category: "watches",
      patterns: [
        /watch|ساعة|ووتش/, // Generic watch terms
        /apple watch|ساعة ابل|أبل واتش/, // Apple Watch
        /galaxy watch|ساعة جالاكسي/, // Samsung Galaxy Watch
        /mi band|مي باند/, // Xiaomi Mi Band
        /fitbit|فيت بيت/, // Fitbit
        /garmin|جارمن/, // Garmin
        /الساعة الذكية|smartwatch/, // Generic "smartwatch" terms
      ]
    },
    // TVs
    {
      category: "tvs",
      patterns: [
        /tv|تلفزيون|تلفاز|شاشة/, // TV generic terms
        /(\d+)\s*inch tv|(\d+)\s*بوصة/, // TV sizes
        /oled|qled|mini led/, // TV technologies
        /smart tv|التلفزيون الذكي/, // Smart TV terminology
      ]
    },
    // Gaming
    {
      category: "gaming",
      patterns: [
        /playstation|بلايستيشن|ps5|ps4/, // PlayStation
        /xbox|إكس بوكس|اكس بوكس/, // Xbox
        /nintendo switch|نينتندو/, // Nintendo
        /gaming|الألعاب|للألعاب/, // Gaming generic
        /controller|يد التحكم|جويستيك/, // Controllers
      ]
    },
    // Cameras
    {
      category: "cameras",
      patterns: [
        /camera|كاميرا/, // Generic camera terms
        /dslr|digital camera/, // Digital camera types
        /canon eos|كانون/, // Canon cameras
        /nikon|نيكون/, // Nikon cameras
        /sony a\d+|سوني/, // Sony cameras
        /gopro|جو برو/, // Action cameras
      ]
    }
  ];
  
  // Check each category's patterns
  for (const { category, patterns } of categoryPatterns) {
    for (const pattern of patterns) {
      if (pattern.test(productNameLower)) {
        return category;
      }
    }
  }
  
  return "other";
}

// Function to scrape rating distribution
function scrapeRatingDistribution($) {
  const ratingDistribution = {
    average_rating: null,
    total_reviews: null,
    distribution: {},
  };

  // Get the average rating
  const averageRatingEl = $(".yv5MZc .zEd9te");
  if (averageRatingEl.length > 0) {
    const ratingText = averageRatingEl.text().trim();
    ratingDistribution.average_rating = formatRating(
      convertArabicNumerals(ratingText)
    );
  }

  // Get the total number of reviews
  const totalReviewsEl = $(".yv5MZc .pQKCOd");
  if (totalReviewsEl.length > 0) {
    const reviewsText = totalReviewsEl.text().trim();
    // Extract just the number from text like "1,435 مراجعة"
    const match = reviewsText.match(/[\d,٠-٩]+/);
    if (match) {
      const westernizedNumber = convertArabicNumerals(match[0]);
      ratingDistribution.total_reviews = parseInt(
        westernizedNumber.replace(/,/g, ""),
        10
      );
    }
  }

  // Get the distribution for each star rating
  $(".lsA2Je .liSKFd").each((i, el) => {
    const container = $(el);

    // Process each star rating row
    for (let i = 0; i < 5; i++) {
      // Get the star value (5, 4, 3, 2, 1)
      const starValue = container.find(".QGLeic").eq(i).text().trim();
      if (!starValue) continue;

      // Get the percentage from the style attribute
      const percentageEl = container.find(".batFvf").eq(i);
      let percentage = null;
      if (percentageEl.length > 0) {
        const styleAttr = percentageEl.attr("style");
        const percentMatch = styleAttr.match(/width:(\d+)%/);
        if (percentMatch) {
          percentage = parseInt(percentMatch[1], 10);
        }
      }

      // Get the review count
      const reviewCountEl = container.find(".KCjXZe").eq(i);
      let reviewCount = null;
      if (reviewCountEl.length > 0) {
        const reviewText = reviewCountEl.text().trim();
        // Extract just the number from text like "1,285 مراجعة"
        const match = reviewText.match(/[\d,٠-٩]+/);
        if (match) {
          const westernizedCount = convertArabicNumerals(match[0]);
          reviewCount = parseInt(westernizedCount.replace(/,/g, ""), 10);
        }
      }

      // Add to distribution object
      if (starValue && (percentage !== null || reviewCount !== null)) {
        const westernStarValue = parseInt(convertArabicNumerals(starValue), 10);
        ratingDistribution.distribution[westernStarValue] = {
          percentage: percentage,
          review_count: reviewCount,
        };
      }
    }
  });

  return ratingDistribution;
}

// Function to scrape reviews
function scrapeReviews($) {
  const reviews = [];

  // Select all review containers
  const reviewContainers = $(".wKtRYe.PZPZlf");
  
  console.log(`🔍 Found ${reviewContainers.length} review containers to parse`);

  // For each review container, extract details (without the 10 review limit)
  reviewContainers.each((i, el) => {
    // Remove the previous 10 review limit check
    // if (reviews.length >= 10) return false; // This was limiting to 10 reviews
    
    const container = $(el);
    const reviewData = {};

    // Extract reviewer name
    reviewData.reviewer_name = container.find(".cbsD0d").text().trim() || null;

    // Extract reviewer rating
    const ratingContainer = container.find(".Y0A0hc");
    let rating = null;

    if (ratingContainer.length > 0) {
      const ratingText = ratingContainer.find(".yi40Hd.YrbPuc").text().trim();
      // Convert Arabic numerals if present and format as number
      rating = formatRating(convertArabicNumerals(ratingText));
    }

    reviewData.rating = rating;

    // Extract review text (full or short version)
    let reviewText = container.find(".Htu6gf .v168Le").text().trim();
    if (!reviewText) {
      reviewText = container.find(".rUzIc .v168Le").text().trim();
    }
    reviewData.review_text = reviewText || null;

    // Extract store source
    reviewData.store_source =
      container.find(".xuBzLd").text().trim().replace("مراجعة من ", "") || null;

    // Only add reviews with valid names
    if (reviewData.reviewer_name) {
      reviews.push(reviewData);
    }
  });

  console.log(`✅ Successfully parsed ${reviews.length} reviews`);
  return reviews;
}

export default scrapeGoogleShopping;
