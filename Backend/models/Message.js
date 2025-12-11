// models/Message.js
const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  type: { type: String, enum: ['message','booking'], default: 'message' },
  subject: { type: String },
  participants: [String], // e.g. usernames or admin
  fullName: String,
  email: String,
  messages: [{ from: String, text: String, at: { type: Date, default: Date.now } }],
  unreadCount: { type: Number, default: 0 },
  meta: { type: Object }
}, { timestamps: true });

module.exports = mongoose.model('Message', MessageSchema);
