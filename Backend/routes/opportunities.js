// routes/opportunities.js
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { Parser } = require('json2csv');
const mongoose = require('mongoose');
const auth = require('../middleware/auth'); // reuse your auth middleware
const OpportunityApplication = require('../models/OpportunityApplication');

// Helper: requireRole (same pattern as your memberships route)
function requireRole(...roles) {
  return (req, res, next) => {
    const role = req.user && req.user.role ? String(req.user.role).toLowerCase() : null;
    if (!role || !roles.map(r => r.toLowerCase()).includes(role)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    next();
  };
}

/** Set up uploads folder for opportunity CVs **/
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'opportunities');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// multer storage & limits
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const safe = Date.now() + '-' + Math.random().toString(36).slice(2, 10) + path.extname(file.originalname);
    cb(null, safe);
  }
});
function fileFilter(req, file, cb) {
  // allow pdf/doc/docx/rtf/txt
  const allowed = /\.(pdf|docx?|rtf|txt)$/i;
  if (allowed.test(file.originalname)) cb(null, true);
  else cb(null, false);
}
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 }, fileFilter });

/* PUBLIC: apply to opportunity
   Accepts multipart/form-data (preferred) OR application/json (fallback).
   Fields: name or fullName, email, phone, location, type, statement, availableFrom, opportunityId, opportunityTitle
   Optional file field: cv
*/
router.post('/apply', upload.single('cv'), async (req, res, next) => {
  try {
    // normalize body for both form-data and json
    const body = req.body || {};
    const name = (body.fullName || body.name || '').trim();
    const email = (body.email || '').trim();
    const phone = (body.phone || '').trim();
    const location = (body.location || '').trim();
    const type = (body.type || '').trim();
    const statement = (body.statement || '').trim();
    const availableFrom = (body.availableFrom || '').trim();
    const opportunityId = (body.opportunityId || '').trim();
    const opportunityTitle = (body.opportunityTitle || body.opportunityTitleRaw || '').trim();

    if (!name || !email || !statement) {
      return res.status(400).json({ message: 'Missing required fields: name, email, statement' });
    }

    const doc = new OpportunityApplication({
      opportunityId: opportunityId || null,
      opportunityTitle: opportunityTitle || null,
      name, email, phone, location, type, statement, availableFrom,
      ip: req.ip,
      meta: { ua: req.get('User-Agent') || null }
    });

    // handle uploaded cv
    if (req.file) {
      doc.cvName = req.file.originalname;
      // public url for file - ensure your server serves /uploads
      doc.cvUrl = `/uploads/opportunities/${req.file.filename}`;
    }

    await doc.save();
    return res.status(201).json({ application: doc });
  } catch (err) {
    next(err);
  }
});

/* PUBLIC: get an application by id (for "Check status" button) */
router.get('/application/:id', async (req, res, next) => {
  try {
    const id = req.params.id;
    if (!id) return res.status(400).json({ message: 'Missing id' });
    // allow local "local-" ids used in browser
    if (id.startsWith('local-')) return res.status(404).json({ message: 'Local-only application' });

    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid id' });
    const app = await OpportunityApplication.findById(id).lean();
    if (!app) return res.status(404).json({ message: 'Application not found' });
    res.json({ application: app });
  } catch (err) { next(err); }
});

/* ADMIN: list applications (paginated, searchable) */
router.get('/admin/applications',
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
        filter.$or = [
          { name: re },
          { email: re },
          { phone: re },
          { opportunityTitle: re },
          { opportunityId: re }
        ];
      }

      const skip = (page - 1) * limit;
      const docs = await OpportunityApplication.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean();
      const total = await OpportunityApplication.countDocuments(filter);
      res.json({ applications: docs, total });
    } catch (err) { next(err); }
  }
);

/* ADMIN: view single application */
router.get('/admin/application/:id',
  (auth && auth.optional) ? auth.optional : (req,res,next)=>next(),
  requireRole('admin','superadmin'),
  async (req,res,next) => {
    try {
      const id = req.params.id;
      if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid id' });
      const app = await OpportunityApplication.findById(id).lean();
      if (!app) return res.status(404).json({ message: 'Not found' });
      res.json({ application: app });
    } catch (err) { next(err); }
  }
);

/* ADMIN: delete application (permanent) */
router.delete('/admin/application/:id',
  (auth && auth.required) ? auth.required : (req,res,next)=>next(),
  requireRole('admin','superadmin'),
  async (req,res,next) => {
    try {
      const id = req.params.id;
      if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid id' });
      const deleted = await OpportunityApplication.findByIdAndDelete(id).exec();
      if (!deleted) return res.status(404).json({ message: 'Application not found' });
      return res.json({ message: 'Application deleted', id: deleted._id });
    } catch (err) { next(err); }
  }
);

/* ADMIN: export CSV */
router.get('/admin/export',
  (auth && auth.optional) ? auth.optional : (req,res,next)=>next(),
  requireRole('admin','superadmin'),
  async (req,res,next) => {
    try {
      const docs = await OpportunityApplication.find({ deleted: { $ne: true } }).sort({ createdAt: -1 }).lean();
      const fields = ['_id','opportunityId','opportunityTitle','name','email','phone','location','type','availableFrom','cvName','cvUrl','status','createdAt'];
      const parser = new Parser({ fields });
      const csv = parser.parse(docs);
      res.header('Content-Type', 'text/csv');
      res.attachment(`opportunities-applications-${Date.now()}.csv`);
      res.send(csv);
    } catch (err) { next(err); }
  }
);

module.exports = router;
