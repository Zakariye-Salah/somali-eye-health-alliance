// routes/doctors.js
const express = require('express');
const router = express.Router();
const Doctor = require('../models/Doctor');
const auth = require('../middleware/auth');
const isAdmin = require('../middleware/isAdmin');
const { body, validationResult } = require('express-validator');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g,'_'))
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// helper to normalize tags (accept array, JSON string, or comma string)
function normalizeTags(tagsField) {
  if (!tagsField) return [];
  if (Array.isArray(tagsField)) return tagsField.map(s => String(s).trim()).filter(Boolean);
  if (typeof tagsField === 'string') {
    try {
      const parsed = JSON.parse(tagsField);
      if (Array.isArray(parsed)) return parsed.map(s => String(s).trim()).filter(Boolean);
    } catch (e) { /* not JSON */ }
    return tagsField.split(',').map(s => s.trim()).filter(Boolean);
  }
  return [];
}

// safely unlink local upload if it exists
function safeUnlink(localPath) {
  if (!localPath) return;
  // ensure we remove a leading slash so path.join won't treat it as absolute
  const rel = localPath.replace(/^\/+/, '');
  const filePath = path.join(__dirname, '..', rel);
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    // don't block the API if unlink fails; just log
    console.warn('safeUnlink failed for', filePath, err && err.message);
  }
}

// GET /api/doctors  (public)
router.get('/', async (req, res, next) => {
  try {
    const q = (req.query.search || '').trim();
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 12);
    const filter = q ? { $or: [{ name: new RegExp(q, 'i') }, { title: new RegExp(q, 'i') }, { tags: new RegExp(q, 'i') }] } : {};
    const [items, total] = await Promise.all([
      Doctor.find(filter).skip((page-1)*limit).limit(limit).sort({ createdAt: -1 }),
      Doctor.countDocuments(filter)
    ]);
    res.json({ items, total, page, limit });
  } catch (err) { next(err); }
});

// GET single
router.get('/:id', async (req, res, next) => {
  try {
    const d = await Doctor.findById(req.params.id);
    if (!d) return res.status(404).json({ message: 'Not found' });
    res.json(d);
  } catch (err) { next(err); }
});

// POST create (admin) - multipart with optional 'photo' file
router.post('/', auth, isAdmin, upload.single('photo'), [
  body('name').notEmpty().withMessage('Name required')
], async (req, res, next) => {
  try {
    const errs = validationResult(req); if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });

    const payload = {};
    payload.name = (req.body.name || '').trim();
    if (req.body.title) payload.title = String(req.body.title).trim();
    if (req.body.overview) payload.overview = String(req.body.overview).trim();

    // normalize tags
    payload.tags = normalizeTags(req.body.tags);

    

    // allow selecting a gallery image via `photo` string if no file uploaded
if (!req.file && req.body && typeof req.body.photo === 'string' && req.body.photo.trim()) {
  // sanitize - allow either absolute url or a path starting with /images or /uploads
  const p = req.body.photo.trim();
  if (/^https?:\/\//i.test(p)) {
    payload.photo = p;
  } else {
    // ensure it begins with a slash
    payload.photo = p.startsWith('/') ? p : ('/' + p);
  }
}

    if (req.file) {
      payload.photo = '/uploads/' + req.file.filename;
    }
    if (typeof req.body.available !== 'undefined') payload.available = req.body.available === 'true' || req.body.available === true;

    const doc = new Doctor(payload);
    await doc.save();
    res.status(201).json(doc);
  } catch (err) { next(err); }
});

// PUT update (admin) - support photo upload; delete previous file when replaced
router.put('/:id', auth, isAdmin, upload.single('photo'), async (req, res, next) => {
  try {
    const doc = await Doctor.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Not found' });

    if (typeof req.body.name !== 'undefined') doc.name = String(req.body.name).trim();
    if (typeof req.body.title !== 'undefined') doc.title = String(req.body.title).trim();
    if (typeof req.body.overview !== 'undefined') doc.overview = String(req.body.overview).trim();
    if (typeof req.body.available !== 'undefined') doc.available = req.body.available === 'true' || req.body.available === true;

    if (typeof req.body.tags !== 'undefined') {
      doc.tags = normalizeTags(req.body.tags);
    }

    // if no new file but client provided a photo path (e.g. chosen gallery image)
if (!req.file && req.body && typeof req.body.photo === 'string' && req.body.photo.trim()) {
  // remove old if local
  if (doc.photo && doc.photo.startsWith('/uploads/')) safeUnlink(doc.photo);
  const p = req.body.photo.trim();
  doc.photo = /^https?:\/\//i.test(p) ? p : (p.startsWith('/') ? p : ('/' + p));
}

    if (req.file) {
      // remove old photo file if local path (starts with /uploads/)
      if (doc.photo && doc.photo.startsWith('/uploads/')) safeUnlink(doc.photo);
      doc.photo = '/uploads/' + req.file.filename;
    }

    await doc.save();
    res.json(doc);
  } catch (err) { next(err); }
});

// DELETE (admin)
router.delete('/:id', auth, isAdmin, async (req, res, next) => {
  try {
    // find by id
    const doc = await Doctor.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Not found' });

    // delete file first (if local)
    if (doc.photo && doc.photo.startsWith('/uploads/')) safeUnlink(doc.photo);

    // perform deletion - use model method to avoid doc.remove issues
    await Doctor.findByIdAndDelete(doc._id);

    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
