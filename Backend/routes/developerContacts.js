// routes/developerContacts.js
const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const DeveloperContact = require('../models/DeveloperContact');
const auth = require('../middleware/auth'); // required & optional

function requireSuperadmin(req, res, next) {
  if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
  if (String(req.user.role) !== 'superadmin') {
    return res.status(403).json({ message: 'Forbidden — superadmin only' });
  }
  return next();
}

/* Public POST */
router.post('/',
  auth.optional,
  [
    body('name').notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Valid email required'),
    body('project').optional().isString(),
    body('message').optional().isString()
  ],
  async (req, res, next) => {
    try {
      const errs = validationResult(req);
      if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });

      const { name, email, phone, whatsapp, project, message, source } = req.body;

      const ip = (req.headers['x-forwarded-for'] || req.ip || (req.connection && req.connection.remoteAddress) || '').split(',')[0].trim() || null;
      const userAgent = req.get('User-Agent') || null;
      const createdBy = (req.user && req.user._id) ? req.user._id : null;

      const doc = new DeveloperContact({
        name: String(name).trim(),
        email: String(email).trim().toLowerCase(),
        phone: phone ? String(phone).trim() : null,
        whatsapp: whatsapp ? String(whatsapp).trim() : null,
        project: project ? String(project).trim() : null,
        message: message ? String(message).trim() : '',
        source: source ? String(source).trim() : 'site',
        ip,
        userAgent,
        createdBy
      });

      await doc.save();

      // If you want realtime push: emit on app.locals.io (optional)
      try {
        if (req.app && req.app.locals && req.app.locals.io) {
          req.app.locals.io.to('admins').emit('developer-contact.new', { contact: doc });
        }
      } catch (e) {}

      return res.status(201).json({ ok: true, id: doc._id, createdAt: doc.createdAt });
    } catch (err) {
      return next(err);
    }
  }
);

/* Admin-only: list */
router.get('/', auth.required, requireSuperadmin, async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    const limit = Math.min(1000, parseInt(req.query.limit || '200', 10) || 200);
    const skip = parseInt(req.query.skip || '0', 10) || 0;
    const filter = {};
    if (q) {
      const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [
        { name: regex },
        { email: regex },
        { phone: regex },
        { whatsapp: regex },
        { project: regex }
      ];
    }

    const docs = await DeveloperContact.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean();
    const showMessage = String(req.query.showMessage || '') === '1';
    const output = docs.map(d => showMessage ? d : Object.assign({}, d, { message: undefined }));
    return res.json(output);
  } catch (err) { next(err); }
});

router.get('/:id', auth.required, requireSuperadmin, async (req, res, next) => {
  try {
    const doc = await DeveloperContact.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ message: 'Not found' });
    return res.json(doc);
  } catch (err) { next(err); }
});

router.delete('/:id', auth.required, requireSuperadmin, async (req, res, next) => {
  try {
    const doc = await DeveloperContact.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Not found' });
    await doc.deleteOne();
    // optional emit
    try {
      if (req.app && req.app.locals && req.app.locals.io) {
        req.app.locals.io.to('admins').emit('developer-contact.deleted', { id: req.params.id });
      }
    } catch (e) {}
    return res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
