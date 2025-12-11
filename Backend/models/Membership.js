// models/Membership.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const MembershipSchema = new Schema({
  fullName: { type: String, required: true, trim: true },
  email: { type: String, required: true, trim: true, lowercase: true },
  organization: { type: String, trim: true, default: '' },      // new
  type: { type: String, enum: ['individual','institution'], default: 'individual' },
  notes: { type: String },
  phone: { type: String },
  user: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  ip: { type: String },
  status: { type: String, enum: ['pending','approved','rejected'], default: 'pending' },
  deleted: { type: Boolean, default: false },

  // CV/file metadata
  cvName: { type: String, default: null },
  cvPath: { type: String, default: null },   // local path under uploads/...
  cvUrl: { type: String, default: null },    // public URL if file uploaded

  meta: Schema.Types.Mixed
}, { timestamps: true });

module.exports = mongoose.model('Membership', MembershipSchema);
