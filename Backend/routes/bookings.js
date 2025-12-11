// routes/bookings.js
const express = require('express');
const router = express.Router();
const Booking = require('../models/Booking');
const auth = require('../middleware/auth');
const isAdmin = require('../middleware/isAdmin');
const { body, validationResult } = require('express-validator');

// POST create booking (guest or logged user)
router.post('/', [
  body('doctorId').notEmpty().withMessage('doctorId required'),
], async (req, res, next) => {
  try {
    const errs = validationResult(req); if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });
    const payload = req.body;
    const b = new Booking(payload);
    await b.save();
    res.status(201).json(b);
  } catch (err) { next(err); }
});

// GET bookings (admin) or user (their bookings)
router.get('/', auth, async (req, res, next) => {
  try {
    if (req.user.role === 'admin') {
      const list = await Booking.find().sort({ createdAt: -1 }).limit(500).populate('doctorId').populate('userId', '-password');
      return res.json(list);
    }
    const list = await Booking.find({ userId: req.user._id }).sort({ createdAt: -1 }).populate('doctorId');
    res.json(list);
  } catch (err) { next(err); }
});

// approve/reject (admin)
router.post('/:id/approve', auth, isAdmin, async (req, res, next) => {
  try {
    const b = await Booking.findByIdAndUpdate(req.params.id, { status: 'approved' }, { new: true });
    if (!b) return res.status(404).json({ message: 'Not found' });
    res.json(b);
  } catch (err) { next(err); }
});
router.post('/:id/reject', auth, isAdmin, async (req, res, next) => {
  try {
    const b = await Booking.findByIdAndUpdate(req.params.id, { status: 'rejected' }, { new: true });
    if (!b) return res.status(404).json({ message: 'Not found' });
    res.json(b);
  } catch (err) { next(err); }
});

module.exports = router;
