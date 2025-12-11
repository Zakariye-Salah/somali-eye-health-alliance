const mongoose = require('mongoose');

const MessageSub = new mongoose.Schema({
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // null for system
  senderName: String,
  senderRole: { type: String, enum: ['user','admin','system'], default: 'user' },
  body: String,
  createdAt: { type: Date, default: Date.now },
  readByAdmin: { type: Boolean, default: false },
  readByUser: { type: Boolean, default: false }
}, { _id: true });

const schema = new mongoose.Schema({
  type: { type: String, enum: ['message','contact','booking','appointment'], default: 'message' },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  userName: String,
  lastMessage: String,
  unreadForAdmin: { type: Number, default: 0 },
  unreadForUser: { type: Number, default: 0 },
  bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },
  messages: [MessageSub],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

schema.pre('save', function(next){
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('Conversation', schema);
