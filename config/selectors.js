/**
 * Configuration file for HTML selectors used in scraping Google Shopping
 * This centralizes all CSS selectors, making it easier to maintain and update
 * when Google's HTML structure changes.
 */

export const googleSelectors = {
  // Store selectors
  stores: {
    container: ".R5K7Cb.SPI3ee",
    name: ".hP4iBf.gUf0b",
    productTitle: ".Rp8BL",
    productUrl: "a.P9159d",
    currentPrice: [
      ".Pgbknd span",
      ".GBgquf.JIep9e span",
      ".GBgquf span", 
      ".Xs9evb .Pgbknd span",
      ".HDOUoe span"
    ],
    originalPrice: [
      ".AoPnCe.JPwIxc span",
      ".AoPnCe span",
      ".UPworb .AoPnCe span",
      ".AoPnCe.JPwIxc span span"
    ],
    rating: ".NFq8Ad.cHaqb",
    delivery: ".gASiG"
  },
  
  // Product selectors
  product: {
    images: ".ThT8pe img, .KfAt4d",
    type: ".PQev6c",
    mainImage: ".KAZc4e img"
  },
  
  // Review selectors
  reviews: {
    container: ".wKtRYe.PZPZlf",
    reviewerName: ".cbsD0d",
    ratingContainer: ".Y0A0hc",
    ratingValue: ".yi40Hd.YrbPuc",
    fullText: ".Htu6gf .v168Le",
    shortText: ".rUzIc .v168Le",
    storeSource: ".xuBzLd"
  },
  
  // Rating distribution selectors
  ratingDistribution: {
    averageRating: ".yv5MZc .zEd9te",
    totalReviews: ".yv5MZc .pQKCOd",
    distributionContainer: ".lsA2Je .liSKFd",
    starValue: ".QGLeic",
    percentage: ".batFvf",
    reviewCount: ".KCjXZe"
  },
  
  // Button selectors for expandSection function
  buttons: {
    stores: ".jgbNbb.YbJ8Df",
    reviews: ".jgbNbb.MpEZrd.YbJ8Df.g5UPGe",
    storesAlternate: [
      ".fYRLcd.tHYb7d.lWlLJb.FWMb9e.o4qwAe",
      "div[role='button'].YbJ8Df",
      ".YbJ8Df"
    ],
    reviewsAlternate: [
      ".fYRLcd.tHYb7d.lWlLJb.FWMb9e.MpEZrd",
      "div[role='button'].g5UPGe",
      ".g5UPGe"
    ]
  },
  
  // Main product container
  mainContainer: ".bWXikd",
  
  // Review section detection selectors
  reviewSection: [
    ".wKtRYe.PZPZlf",
    ".afKV8.OgnHP",
    "[data-review-id]",
    ".QcJav"
  ],
  
  // Text patterns for button detection
  buttonTexts: {
    stores: ["المزيد من المتاجر", "عرض المزيد", "المزيد من", "المزيد"],
    reviews: ["المزيد من المراجعات", "عرض المزيد من المراجعات", "المزيد"]
  },
  
  // Text patterns for review section detection
  reviewSectionTexts: ["المراجعات", "reviews", "التقييمات"]
};