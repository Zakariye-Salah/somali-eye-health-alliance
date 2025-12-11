// routes/newsletter.js
const express = require('express');
const router = express.Router();
const Newsletter = require('../models/Newsletter');
const auth = require('../middleware/auth');
const isAdmin = require('../middleware/isAdmin');
const { body, validationResult } = require('express-validator');

// POST subscribe
router.post('/', [
  body('email').isEmail()
], async (req, res, next) => {
  try {
    const errs = validationResult(req); if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });
    const { email } = req.body;
    try {
      const doc = new Newsletter({ email: email.toLowerCase() });
      await doc.save();
    } catch (e) {
      // unique constraint -> already subscribed, ignore
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// GET /api/newsletter/check?email= — public helper to check subscription for a specific email
router.get('/check', async (req, res, next) => {
  try {
    const email = (req.query.email || '').toLowerCase().trim();
    if (!email) return res.json({ subscribed: false });
    const found = await Newsletter.findOne({ email }).lean();
    res.json({ subscribed: !!found, email });
  } catch (err) { next(err); }
});

// GET /api/newsletter/subscribers  — admin only (list subscribers)
router.get('/subscribers', auth, isAdmin, async (req, res, next) => {
  try {
    const list = await Newsletter.find().sort({ createdAt: -1 }).limit(1000).lean();
    res.json({ subscribers: list });
  } catch (err) { next(err); }
});

module.exports = router;
