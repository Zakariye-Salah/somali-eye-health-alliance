// models/Doctor.js
const mongoose = require('mongoose');

const DoctorSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  title: { type: String, trim: true },
  overview: { type: String, trim: true },
  photo: { type: String },        // either "/uploads/..." or full URL
  tags: { type: [String], default: [] },
  available: { type: Boolean, default: true }
}, { timestamps: true });

// Ensure tags is always an array when returned
DoctorSchema.methods.toJSON = function () {
  const o = this.toObject({ virtuals: false });
  if (!Array.isArray(o.tags)) o.tags = (o.tags ? [o.tags] : []);
  return o;
};

module.exports = mongoose.model('Doctor', DoctorSchema);
