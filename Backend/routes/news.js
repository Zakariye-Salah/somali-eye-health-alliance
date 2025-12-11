// routes/news.js
const express = require('express');
const router = express.Router();
const News = require('../models/News');
const auth = require('../middleware/auth');
const isAdmin = require('../middleware/isAdmin');
const { body, validationResult } = require('express-validator');

// GET list (pagination)
router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 12);
    const filter = {};
    const [items, total] = await Promise.all([
      News.find(filter).skip((page-1)*limit).limit(limit).sort({ publishedAt: -1 }),
      News.countDocuments(filter)
    ]);
    res.json({ items, total, page, limit });
  } catch (err) { next(err); }
});

// GET single
router.get('/:id', async (req, res, next) => {
  try {
    const n = await News.findById(req.params.id);
    if (!n) return res.status(404).json({ message: 'Not found' });
    res.json(n);
  } catch (err) { next(err); }
});

// POST create (admin)
router.post('/', auth, isAdmin, [
  body('title').notEmpty().withMessage('Title required')
], async (req, res, next) => {
  try {
    const errs = validationResult(req); if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });
    const news = new News(req.body);
    await news.save();
    res.status(201).json(news);
  } catch (err) { next(err); }
});

// PUT update (admin)
router.put('/:id', auth, isAdmin, async (req, res, next) => {
  try {
    const upd = await News.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!upd) return res.status(404).json({ message: 'Not found' });
    res.json(upd);
  } catch (err) { next(err); }
});

// DELETE (admin)
router.delete('/:id', auth, isAdmin, async (req, res, next) => {
  try {
    await News.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
