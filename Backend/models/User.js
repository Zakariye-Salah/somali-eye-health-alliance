// models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// models/User.js (update)
const UserSchema = new mongoose.Schema({
  fullName: { type: String, required: true, trim: true },
  username: { type: String, required: true, unique: true, index: true, trim: true, lowercase: true },
  email: { type: String, trim: true, lowercase: true, unique: true, sparse: true }, // make email unique when present
  password: { type: String, required: true },
  role: { type: String, enum: ['user', 'admin', 'superadmin'], default: 'user' }, // added superadmin
  avatar: { type: String },
}, { timestamps: true });

// hash password before save
UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

UserSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

UserSchema.set('toJSON', { transform(doc, ret) { delete ret.password; return ret; } });

module.exports = mongoose.model('User', UserSchema);
