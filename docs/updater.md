# Product Updater

The product updater is an automated tool that maintains your database with the most current product information from Google Shopping. It re-scrapes all existing products to update prices, reviews, and store information.

## Features

- **Automatic Database Maintenance**: Re-scrapes all products in your database to keep information current
- **Price History Tracking**: Records historical price changes for trend analysis
- **CAPTCHA Handling**: Uses persistent browser profiles to minimize verification challenges
- **Rate Limiting Protection**: Implements delays between requests to avoid IP blocking
- **Detailed Logging**: Creates comprehensive logs of all update activities
- **Category Consistency**: Preserves existing product categorization during updates

## Usage

```bash
# Using npm script
npm run update

# Direct node execution
node updater.js

# Show all available options
node updater.js --help

# Only update products in a specific category
node updater.js --category=laptops

# Limit updates to a specific number of products
node updater.js --limit=10
```

## Configuration

The updater uses the same environment variables as the main scraper, defined in `config/config.env`. You can adjust settings like delay between products to optimize for your specific needs.