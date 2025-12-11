// routes/memberships.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const { Parser } = require('json2csv');
const multer = require('multer');
const auth = require('../middleware/auth');
const Membership = require('../models/Membership');

// Ensure uploads folder exists
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'memberships');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Multer storage config
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOAD_DIR);
  },
  filename: function (req, file, cb) {
    // keep original name with timestamp prefix to avoid collisions
    const safe = Date.now() + '-' + file.originalname.replace(/\s+/g, '_');
    cb(null, safe);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB (adjust if needed)
  fileFilter: function (req, file, cb) {
    // allow common doc types & pdf
    const allowed = /pdf|doc|docx|rtf|txt/;
    const ext = (file.originalname || '').split('.').pop().toLowerCase();
    if (allowed.test(ext)) return cb(null, true);
    cb(new Error('Invalid file type. Allowed: pdf, doc, docx, rtf, txt'));
  }
});

/* Helper: requireRole */
function requireRole(...roles) {
  return (req, res, next) => {
    const role = req.user && req.user.role ? String(req.user.role).toLowerCase() : null;
    if (!role || !roles.map(r => r.toLowerCase()).includes(role)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    next();
  };
}

/* Dev: seed sample data if empty */
async function seedIfEmpty() {
  const count = await Membership.countDocuments({});
  if (count > 0) return;
  const seed = [
    { _id: mongoose.Types.ObjectId('601111111111111111111111'), fullName: 'Amina Ali', email: 'amina@example.org', phone: '+252700000001', type: 'individual', status: 'approved', organization: 'Burao Eye Clinic' },
    { _id: mongoose.Types.ObjectId('602222222222222222222222'), fullName: 'Mohamed Yusuf', email: 'm.yusuf@example.org', phone: '+252700000002', type: 'institution', status: 'approved', organization: 'Hargeisa Optical' },
    { _id: mongoose.Types.ObjectId('603333333333333333333333'), fullName: 'Fatima Warsame', email: 'fatima@example.org', phone: '+252700000003', type: 'individual', status: 'pending' }
  ];
  await Membership.insertMany(seed);
}

/* PUBLIC: list basic members (non-admin) */
router.get('/', async (req, res, next) => {
  try {
    await seedIfEmpty();
    const docs = await Membership.find({ deleted: { $ne: true } }).sort({ createdAt: -1 }).lean();
    res.json({ members: docs });
  } catch (err) { next(err); }
});

/* PUBLIC: create membership (accepts optional cv file) */
router.post('/', upload.single('cv'), async (req, res, next) => {
  try {
    const { fullName, email, phone, type, notes, organization } = req.body || {};

    if (!fullName || !email || !phone) {
      return res.status(400).json({ message: 'Missing required fields: fullName, email, phone' });
    }

    const doc = {
      fullName: String(fullName).trim(),
      email: String(email).trim().toLowerCase(),
      phone: String(phone).trim(),
      type: type ? String(type).trim() : 'individual',
      notes: notes ? String(notes).trim() : null,
      organization: organization ? String(organization).trim() : '',
      ip: req.ip,
      meta: { submittedFrom: req.get('User-Agent') || null }
    };

    if (req.file) {
      doc.cvName = req.file.originalname;
      // store relative path and public URL
      doc.cvPath = path.join('memberships', req.file.filename).replace(/\\/g, '/');
      const protocol = req.protocol;
      const host = req.get('host');
      doc.cvUrl = `${protocol}://${host}/uploads/${doc.cvPath}`;
    }

    const m = new Membership(doc);
    await m.save();

    // respond with cleaned up object (lean-like)
    const out = m.toObject({ getters: true, virtuals: false });
    return res.status(201).json({ membership: out });
  } catch (err) {
    // multer file type error will appear here as Error
    if (err && err.message) {
      return res.status(400).json({ message: err.message });
    }
    next(err);
  }
});

/* ADMIN: list (paginated) */
router.get('/admin/list',
  (auth && auth.optional) ? auth.optional : (req,res,next)=>next(),
  requireRole('admin','superadmin'),
  async (req, res, next) => {
    try {
      const page = Math.max(1, parseInt(req.query.page||1));
      const limit = Math.max(1, Math.min(500, parseInt(req.query.limit||50)));
      const q = (req.query.q || '').trim();

      const filter = { deleted: { $ne: true } };
      if (q) {
        const re = new RegExp(q, 'i');
        filter.$or = [{ fullName: re }, { email: re }, { phone: re }, { organization: re }];
      }

      const skip = (page - 1) * limit;
      const docs = await Membership.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean();
      const total = await Membership.countDocuments(filter);
      res.json({ members: docs, total });
    } catch (err) { next(err); }
  }
);

/* ADMIN: count */
router.get('/admin/count',
  (auth && auth.optional) ? auth.optional : (req,res,next)=>next(),
  requireRole('admin','superadmin'),
  async (req, res, next) => {
    try {
      const count = await Membership.countDocuments({ deleted: { $ne: true } });
      res.json({ count });
    } catch (err) { next(err); }
  }
);

/* ADMIN: view single membership */
router.get('/admin/membership/:id',
  (auth && auth.optional) ? auth.optional : (req,res,next)=>next(),
  requireRole('admin','superadmin'),
  async (req,res,next) => {
    try {
      const id = req.params.id;
      if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid id' });
      const m = await Membership.findById(id).lean();
      if (!m) return res.status(404).json({ message: 'Not found' });
      res.json({ member: m });
    } catch (err) { next(err); }
  }
);

/* ADMIN: delete membership (permanent) */
router.delete('/admin/membership/:id',
  (auth && auth.required) ? auth.required : (req,res,next)=>next(),
  requireRole('admin','superadmin'),
  async (req, res, next) => {
    try {
      const id = req.params.id;
      if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid id' });
      const deleted = await Membership.findByIdAndDelete(id).exec();
      if (!deleted) return res.status(404).json({ message: 'Membership not found' });
      // also remove file if exists
      if (deleted.cvPath) {
        const fp = path.join(__dirname, '..', 'uploads', deleted.cvPath);
        fs.unlink(fp, (err) => { /* ignore unlink errors */ });
      }
      return res.json({ message: 'Membership deleted', id: deleted._id });
    } catch (err) { next(err); }
  }
);

/* ADMIN: export CSV */
router.get('/admin/export',
  (auth && auth.optional) ? auth.optional : (req,res,next)=>next(),
  requireRole('admin','superadmin'),
  async (req,res,next) => {
    try {
      const docs = await Membership.find({ deleted: { $ne: true } }).sort({ createdAt: -1 }).lean();
      const fields = ['_id','fullName','email','phone','organization','type','status','cvName','cvUrl','createdAt'];
      const parser = new Parser({ fields });
      const csv = parser.parse(docs);
      res.header('Content-Type', 'text/csv');
      res.attachment(`memberships-${Date.now()}.csv`);
      res.send(csv);
    } catch (err) { next(err); }
  }
);

module.exports = router;
