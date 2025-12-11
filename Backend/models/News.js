// models/News.js
const mongoose = require('mongoose');

const NewsSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  body: { type: String },
  author: { type: String, default: 'Admin' },
  image: { type: String },
  publishedAt: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('News', NewsSchema);
