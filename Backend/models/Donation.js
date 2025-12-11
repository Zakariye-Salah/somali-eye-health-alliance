// models/Donation.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const DonationSchema = new Schema({
  donorName: { type: String, trim: true },
  donorEmail: { type: String, trim: true, lowercase: true },
  user: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  amount: { type: Number, required: true },
  currency: { type: String, default: 'USD' },
  frequency: { type: String, enum: ['one-time','monthly'], default: 'one-time' },
  method: { type: String, enum: ['offline','mobile','paypal','stripe','other'], default: 'offline' },
  message: { type: String },
  mobileNumber: { type: String },
  transactionId: { type: String },
  status: { type: String, enum: ['initiated','pending','pending_confirmation','approved','rejected','failed'], default: 'initiated' },
  meta: { type: Schema.Types.Mixed },
  createdByIp: { type: String },
  approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  approvedAt: { type: Date },
}, { timestamps: true });

module.exports = mongoose.model('Donation', DonationSchema);
