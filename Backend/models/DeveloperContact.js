// models/DeveloperContact.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const DeveloperContactSchema = new Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, trim: true, lowercase: true },
  phone: { type: String, trim: true, default: null },
  whatsapp: { type: String, trim: true, default: null },
  project: { type: String, trim: true, default: null },
  message: { type: String, trim: true, default: '' },
  source: { type: String, trim: true, default: 'site' },
  ip: { type: String, trim: true, default: null },
  userAgent: { type: String, trim: true, default: null },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

// index for fast listing sorted by newest
DeveloperContactSchema.index({ createdAt: -1 });

module.exports = mongoose.model('DeveloperContact', DeveloperContactSchema);
