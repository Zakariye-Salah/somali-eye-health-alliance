// models/HelpConversation.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const MessageSchema = new Schema({
  sender: { type: String, enum: ['user','admin','system'], required: true },
  senderName: { type: String, default: null },
  text: { type: String, required: true },
  status: { type: String, enum: ['pending','sent','read','failed'], default: 'sent' },
  createdAt: { type: Date, default: Date.now },
  meta: Schema.Types.Mixed
}, { _id: true });

const HelpConversationSchema = new Schema({
  title: { type: String, trim: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  anonId: { type: String, trim: true, index: true, default: null },
  name: { type: String, trim: true, default: null },
  messages: { type: [MessageSchema], default: [] },
  unreadCount: { type: Number, default: 0 },
  status: { type: String, enum: ['open','closed'], default: 'open' },
  meta: Schema.Types.Mixed
}, { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } });

HelpConversationSchema.index({ updatedAt: -1 });

module.exports = mongoose.model('HelpConversation', HelpConversationSchema);
