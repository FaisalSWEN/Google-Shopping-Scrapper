# 🛒 Google Shopping Scraper

## 📋 Overview

A sophisticated web scraping tool designed to extract product information from Google Shopping. This tool handles CAPTCHA challenges, maintains persistent sessions, and provides comprehensive data extraction capabilities for product details, reviews, and store listings.

## ✨ Features

- 🔍 **Product Data Extraction**: Comprehensive scraping of product details, specifications, and pricing
- 💬 **Reviews Collection**: Gathers customer reviews with ratings and timestamps
- 🏪 **Store Comparison**: Collects pricing data from multiple stores
- 🔄 **Automated Updates**: [Keeps product data current with the updater tool](docs/updater.md)
- 🤖 **Intelligent CAPTCHA Handling**:
  - Automatic detection of CAPTCHA challenges
  - Seamless switching to visible browser for human intervention
  - Session persistence to minimize future CAPTCHA encounters
- 🍪 **Cookie Management**: Stores and reuses authenticated sessions
- 📊 **MongoDB Integration**: Saves all scraped data to MongoDB for analysis
- 🕵️ **Stealth Mode**: Advanced browser fingerprinting evasion
- 📱 **Category Detection**: Intelligent product categorization (phones, laptops, audio, etc.)
- 🌐 **Multi-language Support**: Works with both English and Arabic content

## 🔧 Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/google-shopping-scraper.git
cd google-shopping-scraper

# Install dependencies
npm install
```

## ⚙️ Configuration

Create a `config.env` file in the `config` directory with the following variables:

```env
# MongoDB connection string
MONGODB_URI=mongodb+srv://your-username:your-password@your-cluster.mongodb.net/your-database

# Scraping settings
MAX_CLICK_ATTEMPTS_STORES=2
MAX_CLICK_ATTEMPTS_REVIEWS=7
DEFAULT_CLICK_DELAY=1500
```

## 🚀 Usage

### Basic Usage

```javascript
// Import the scraper
import { scrapeProduct } from './scrapper.js';

// Scrape a product
const url = 'https://www.google.com/shopping/product/...';
const options = {
  maxClicksStores: 2,    // Maximum clicks on "Show more stores" button
  maxClicksReviews: 7,   // Maximum clicks on "Show more reviews" button
  clickDelay: 1500       // Delay between clicks in ms
};

// Run the scraper
await scrapeProduct(url, options);
```

### Command Line Usage

```bash
# Basic usage with URL
node scrapper.js "https://www.google.com/shopping/product/..."

# With optional category and brand parameters
node scrapper.js "https://www.google.com/shopping/product/..." "laptops" "Apple"

# With all parameters including click settings
node scrapper.js "https://www.google.com/shopping/product/..." "laptops" "Apple" 2 7
```

### Handling CAPTCHAs

When a CAPTCHA is detected:

1. The tool automatically switches to a visible browser window
2. Follow the on-screen instructions to solve the CAPTCHA
3. Press ENTER in the console after solving
4. The scraper will continue automatically
5. Future scraping sessions will reuse the authenticated session

## 🏗️ Architecture

The scraper consists of several components:

- `scrapper.js`: Main entry point for the scraping process
- `utils/enhancedBrowserLauncher.js`: Handles browser instantiation with CAPTCHA detection
- `utils/captchaHandler.js`: Manages CAPTCHA detection and resolution
- `stores/google.js`: Parsing logic for Google Shopping pages
- `models/Product.js`: MongoDB schema for product data
- `config/selectors.js`: Centralized CSS selectors for HTML parsing

## 📁 Directory Structure

```
scrape/
├── config/           # Configuration files
│   ├── config.env
│   ├── database.js
│   └── selectors.js
├── models/           # Database models
├── screenshots/      # CAPTCHA and debug screenshots
│   ├── captcha/
│   └── debug/
├── browser-data/     # Persistent browser profile
├── data/             # Session cookies and state
├── stores/           # Store-specific parsers
│   └── google.js
├── utils/            # Utility functions
│   ├── enhancedBrowserLauncher.js
│   ├── captchaHandler.js
│   └── utils.js
└── scrapper.js       # Main entry point
```

## 🔍 Key Features Explained

### Persistent Browser Profiles

The scraper maintains a persistent browser profile in the `browser-data` directory. This helps:
- Reduce CAPTCHA frequency
- Maintain authenticated sessions
- Appear more like a legitimate user

### Cookie Management

Cookies are saved after each successful scraping session and loaded for future runs, which:
- Preserves authentication state
- Significantly reduces CAPTCHA challenges
- Improves overall reliability

### CAPTCHA Handling

The tool uses a sophisticated approach to CAPTCHA detection:
- URL pattern recognition
- DOM element detection
- Text content analysis
- Seamless switching to visible mode when needed

### Category Detection

Products are intelligently categorized based on name patterns:
- Laptops (MacBook, ThinkPad, etc.)
- Phones (iPhone, Galaxy, etc.)
- Audio devices (AirPods, speakers, etc.)
- And many more categories

## 📊 Data Structure

The scraper extracts and organizes the following data:

```javascript
{
  category: "laptops",
  brand: "Apple",
  product_name: "MacBook Air M4",
  product_type: "Laptop",
  photo_links: ["url1", "url2", ...],
  stores: [
    {
      store: "Amazon",
      current_price: 3999,
      original_price: 4299,
      rating: 4.7,
      free_delivery: true,
      product_url: "https://..."
    },
    // More stores...
  ],
  reviews: [
    {
      reviewer_name: "John Doe",
      rating: 5,
      review_text: "Great product!",
      store_source: "Amazon"
    },
    // More reviews...
  ],
  rating_distribution: {
    "5": 45,
    "4": 20,
    "3": 10,
    "2": 5,
    "1": 3
  },
  lowestPrice: 3999,
  highestPrice: 4599,
  averagePrice: 4250
}
```

## ⚠️ Troubleshooting

### Frequent CAPTCHAs

If you're encountering too many CAPTCHAs:
- Try using the scraper less frequently
- Rotate between different IP addresses
- Set `forceVisible: true` in the options to always use visible mode
- Clear the `browser-data` directory to start fresh

### Database Connection Issues

Ensure your MongoDB connection string is correct in the config file and that your IP address is whitelisted in the MongoDB Atlas settings.

### Page Detection Failures

If the scraper fails to recognize Google Shopping pages:
- Check if Google has changed their HTML structure
- Update the selectors in `config/selectors.js`
- Provide a screenshot when submitting an issue

## 🛠️ Advanced Configuration

For production use, you may want to modify:

```javascript
// Always use visible browser (helpful during development)
const browserData = await launchBrowserWithPersistence(url, { forceVisible: true });
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

⭐ Star this repository if you find it useful! ⭐