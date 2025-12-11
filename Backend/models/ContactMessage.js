// models/ContactMessage.js
const mongoose = require('mongoose');

const ContactSchema = new mongoose.Schema({
  name: { type: String, trim: true, default: null },
  email: { type: String, trim: true, lowercase: true, required: true },
  phone: { type: String, trim: true, default: null },
  subject: { type: String, trim: true, default: null },
  message: { type: String, trim: true, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  ip: { type: String, default: null },
  source: { type: String, default: 'site' }, // e.g. site-contact, mobile, etc.
  status: { type: String, enum: ['open','closed'], default: 'open' },
}, { timestamps: true });

module.exports = mongoose.model('ContactMessage', ContactSchema);
