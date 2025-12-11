// models/Booking.js
const mongoose = require('mongoose');

const BookingSchema = new mongoose.Schema({
  doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // optional for guests
  guest: {
    name: String,
    email: String,
    notes: String
  },
  datetime: { type: Date },
  status: { type: String, enum: ['pending','approved','rejected'], default: 'pending' },
  meta: { type: Object }
}, { timestamps: true });

module.exports = mongoose.model('Booking', BookingSchema);
