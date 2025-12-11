// routes/contact.js
const express = require('express');
const router = express.Router();
const Contact = require('../models/ContactMessage');
const mongoose = require('mongoose');

// optional auth & permit (if available)
let auth = (req,res,next)=>next();
let permit = (...r)=> (req,res,next)=> next();
try { auth = require('../middleware/auth'); } catch(e) { /* noop */ }
try { permit = require('../middleware/permit'); } catch(e) { /* noop */ }

/**
 * Helper: sanitize incoming body
 */
function sanitizeBody(b) {
  return {
    name: b.name ? String(b.name).trim() : null,
    email: b.email ? String(b.email).trim().toLowerCase() : null,
    phone: b.phone ? String(b.phone).trim() : null,
    subject: b.subject ? String(b.subject).trim() : null,
    message: b.message ? String(b.message).trim() : null,
    source: b.source ? String(b.source).trim() : 'site'
  };
}

/**
 * Public: create a contact message
 * POST /api/contact
 */
router.post('/', async (req, res) => {
  try {
    const body = sanitizeBody(req.body || {});
    if (!body.email || !body.message) return res.status(400).json({ message: 'email and message required' });

    const user = req.user || null;
    const ip = (req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim() || null;

    const doc = new Contact({
      name: body.name,
      email: body.email,
      phone: body.phone,
      subject: body.subject,
      message: body.message,
      userId: user ? user._id : null,
      ip,
      source: body.source || 'site'
    });

    await doc.save();

    // notify admins in real time (if socket available)
    try {
      const io = req.app && req.app.locals && req.app.locals.io;
      if (io) {
        const total = await Contact.countDocuments({});
        io.to('admins').emit('contacts.new', { contact: doc, total });
      }
    } catch (e) {
      console.warn('contacts.new socket emit failed', e && e.message ? e.message : e);
    }

    return res.status(201).json({ ok: true, contact: doc });
  } catch (err) {
    console.error('contact:create error', err && err.stack ? err.stack : err);
    return res.status(500).json({ message: 'Server error' });
  }
});

/**
 * Admin: list contacts
 * GET /api/contact/admin/list
 */
router.get('/admin/list',
  (auth && auth.required) ? auth.required : (req,res,next)=>next(),
  permit('admin','superadmin'),
  async (req, res) => {
    try {
      const page = Math.max(1, parseInt(req.query.page || 1));
      const limit = Math.max(1, Math.min(500, parseInt(req.query.limit || 200)));
      const skip = (page - 1) * limit;

      const filter = {};
      if (req.query.q) {
        const q = new RegExp(String(req.query.q), 'i');
        filter.$or = [{ name: q }, { email: q }, { subject: q }, { message: q }];
      }
      if (req.query.status) filter.status = req.query.status;

      const docs = await Contact.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip).limit(limit)
        .lean();

      const total = await Contact.countDocuments(filter);
      return res.json({ contacts: docs, total });
    } catch (err) {
      console.error('contact:admin list', err && err.stack ? err.stack : err);
      return res.status(500).json({ message: 'Server error' });
    }
  });

/**
 * Admin: get single contact
 * GET /api/contact/:id
 */
router.get('/:id',
  (auth && auth.required) ? auth.required : (req,res,next)=>next(),
  permit('admin','superadmin'),
  async (req, res) => {
    try {
      const id = req.params.id;
      if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'invalid id' });
      const doc = await Contact.findById(id).lean();
      if (!doc) return res.status(404).json({ message: 'Not found' });
      return res.json({ contact: doc });
    } catch (err) {
      console.error('contact:get', err && err.stack ? err.stack : err);
      return res.status(500).json({ message: 'Server error' });
    }
  });

/**
 * Admin: close message
 * PUT /api/contact/:id/close
 */
router.put('/:id/close',
  (auth && auth.required) ? auth.required : (req,res,next)=>next(),
  permit('admin','superadmin'),
  async (req, res) => {
    try {
      const id = req.params.id;
      if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'invalid id' });
      const doc = await Contact.findById(id);
      if (!doc) return res.status(404).json({ message: 'Not found' });
      doc.status = 'closed';
      await doc.save();
      return res.json({ ok: true, contact: doc });
    } catch (err) {
      console.error('contact:close', err && err.stack ? err.stack : err);
      return res.status(500).json({ message: 'Server error' });
    }
  });

/**
 * Admin: delete contact
 * DELETE /api/contact/:id
 */
router.delete('/:id',
  (auth && auth.required) ? auth.required : (req,res,next)=>next(),
  permit('admin','superadmin'),
  async (req, res) => {
    try {
      const id = req.params.id;
      if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'invalid id' });

      const doc = await Contact.findByIdAndDelete(id);
      if (!doc) return res.status(404).json({ message: 'Not found' });

      // emit to admins so UIs can update
      try {
        const io = req.app && req.app.locals && req.app.locals.io;
        if (io) {
          const total = await Contact.countDocuments({});
          io.to('admins').emit('contacts.deleted', { id: id, total });
        }
      } catch (e) {
        console.warn('contacts.deleted emit failed', e && e.message ? e.message : e);
      }

      return res.json({ ok: true, id });
    } catch (err) {
      console.error('contact:delete', err && err.stack ? err.stack : err);
      return res.status(500).json({ message: 'Server error' });
    }
  });

module.exports = router;
