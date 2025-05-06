import mongoose from "mongoose";

// Define schema for stores
const storeSchema = new mongoose.Schema({
  store: String,
  current_price: Number,
  original_price: Number,
  rating: Number,
  free_delivery: Boolean,
  product_title: String,
  product_url: String,
});

// Define schema for reviews
const reviewSchema = new mongoose.Schema({
  reviewer_name: String,
  rating: Number,
  review_text: String,
  store_source: String,
});

// Define schema for rating distribution
const ratingDistributionSchema = new mongoose.Schema({
  average_rating: Number,
  total_reviews: Number,
  distribution: {
    1: { percentage: Number, review_count: Number },
    2: { percentage: Number, review_count: Number },
    3: { percentage: Number, review_count: Number },
    4: { percentage: Number, review_count: Number },
    5: { percentage: Number, review_count: Number },
  },
});

// Define schema for price history
const priceHistorySchema = new mongoose.Schema({
  date: {
    type: Date,
    default: Date.now,
  },
  lowestPrice: Number,
  highestPrice: Number,
  averagePrice: Number,
  currency: {
    type: String,
    default: "SAR",
  },
});

// Define schema for users (extensible for future)
const userSchema = new mongoose.Schema({
  phone: {
    type: String,
    required: true,
    unique: true,
  },
  notificationPreferences: {
    priceDrops: {
      type: Boolean,
      default: true,
    },
    newStores: {
      type: Boolean,
      default: false,
    },
  },
  productsWatching: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
    },
  ],
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Main product schema
const productSchema = new mongoose.Schema({
  productId: {
    type: String,
    required: true,
    unique: true,
  },
  category: String,
  brand: String,
  product_name: String,
  product_type: String,
  photo_links: [String],
  stores: [storeSchema],
  reviews: {
    type: [reviewSchema],
    validate: {
      validator: function (reviews) {
        return reviews.length <= 1000; // Allow up to 1000 reviews (adjust as needed)
      },
      message: "Reviews array exceeds maximum size",
    },
  },
  rating_distribution: ratingDistributionSchema,
  source_url: String,
  lowestPrice: Number,
  highestPrice: Number,
  averagePrice: Number,
  priceHistory: [priceHistorySchema],
  users: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  ],
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Update the updatedAt field on save
productSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

// Create models
const Product = mongoose.model("Product", productSchema);
const User = mongoose.model("User", userSchema);

export { Product, User };
