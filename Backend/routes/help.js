// routes/help.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Conversation = require('../models/HelpConversation');

// optional auth & permit
let auth = (req,res,next)=>next();
let permit = (...r)=> (req,res,next)=> next();
try { auth = require('../middleware/auth'); } catch(e) {}
try { permit = require('../middleware/permit'); } catch(e) {}

// basic in-memory cache for admin list (reduce DB calls)
const NodeCache = require('node-cache');
const adminListCache = new NodeCache({ stdTTL: 2, checkperiod: 1 });

// optional rate limiter (if installed)
let rateLimit;
try { rateLimit = require('express-rate-limit'); } catch(e) { rateLimit = null; }
const mildLimiter = rateLimit ? rateLimit({
  windowMs: 15 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
}) : (req,res,next) => next();

function now(){ return new Date(); }
function makeMessage(sender='user', text='', senderName=null, meta=null) {
  return { sender, senderName, text, meta, createdAt: now(), status: 'sent' };
}
function anonLabelFromAnonId(anonId) {
  if (!anonId) return 'Anonymous';
  return `Anonymous-${String(anonId).slice(-6)}`;
}

/* ---------- create conversation ---------- */
router.post('/conversations', (auth && auth.optional) ? auth.optional : (req,res,next)=>next(), async (req,res) => {
  try {
    const { title, name, anonId, initialMessage, topic, details } = req.body || {};
    if (!initialMessage || !String(initialMessage).trim()) return res.status(400).json({ message: 'initialMessage required' });
    const user = req.user || null;
    const conv = new Conversation({
      title: title || name || (user ? (user.fullName || user.name) : anonLabelFromAnonId(anonId)),
      name: name || (user ? (user.fullName || user.name) : null),
      anonId: user ? null : (anonId || ('anon-' + Math.random().toString(36).slice(2,8))),
      userId: user ? (user._id || user.id) : null,
      messages: [ makeMessage('user', String(initialMessage).trim(), (name || (user ? (user.fullName || user.name) : null)), { topic, details }) ],
      unreadCount: 1,
      status: 'open',
      meta: { topic: topic || null, details: details || null }
    });
    await conv.save();
    const io = req.app && req.app.locals && req.app.locals.io;
    if (io) io.to('admins').emit('help.new', { conversation: conv });
    return res.status(201).json({ conversation: conv });
  } catch (err) {
    console.error('help:create', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

/* ---------- append message ---------- */
router.post('/conversations/:id/messages', (auth && auth.optional) ? auth.optional : (req,res,next)=>next(), async (req,res) => {
  try {
    const convId = req.params.id;
    const { text, topic, details } = req.body || {};
    if (!text || !String(text).trim()) return res.status(400).json({ message: 'text required' });

    let conv = null;
    if (mongoose.Types.ObjectId.isValid(convId)) conv = await Conversation.findById(convId);
    if (!conv) conv = await Conversation.findOne({ anonId: convId });
    if (!conv) return res.status(404).json({ message: 'Conversation not found' });

    const user = req.user || null;
    const isAdmin = user && (['admin','superadmin'].includes((user.role||'').toString().toLowerCase()));
    const msg = makeMessage(isAdmin ? 'admin' : 'user', String(text).trim(), (user ? (user.fullName || user.name) : (conv.name || null)), { topic, details });
    conv.messages.push(msg);
    conv.updatedAt = now();

    if (!isAdmin) conv.unreadCount = (conv.unreadCount || 0) + 1;
    else {
      conv.unreadCount = 0;
      conv.messages.forEach(m => { if (m.sender === 'user') m.status = 'read'; });
    }

    if (!conv.userId && user && !isAdmin) conv.userId = user._id;
    await conv.save();

    const io = req.app && req.app.locals && req.app.locals.io;
    if (io) {
      io.to('admins').emit('help.updated', { conversationId: conv._id, conversation: conv });
      io.to(String(conv._id)).emit('help.message', { message: msg, conversationId: conv._id });
    }

    return res.status(201).json({ message: msg, conversation: conv });
  } catch (err) {
    console.error('help:append', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

/* ---------- get conversation by id ---------- */
router.get('/conversations/:id', (auth && auth.optional) ? auth.optional : (req,res,next)=>next(), async (req,res) => {
  try {
    const convId = req.params.id;
    let conv = null;
    if (mongoose.Types.ObjectId.isValid(convId)) conv = await Conversation.findById(convId).lean();
    if (!conv) conv = await Conversation.findOne({ anonId: convId }).lean();
    if (!conv) return res.status(404).json({ message: 'Not found' });

    const user = req.user || null;
    const isAdmin = user && (['admin','superadmin'].includes((user.role||'').toString().toLowerCase()));
    const isOwner = user && conv.userId && String(conv.userId) === String(user._id || user.id);
    if (!isAdmin && !isOwner) return res.status(403).json({ message: 'Forbidden' });

    return res.json({ conversation: conv });
  } catch (err) {
    console.error('help:get', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

/* ---------- conversation for logged-in user ---------- */
router.get('/conversations/me', (auth && auth.required) ? auth.required : (req,res,next)=>next(), async (req,res) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ message: 'Not authenticated' });
    const conv = await Conversation.findOne({ userId: user._id }).lean();
    if (!conv) return res.status(404).json({ message: 'No conversation' });
    return res.json({ conversation: conv });
  } catch (err) {
    console.error('help:me', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

/* ---------- anon lookup ---------- */
router.get('/conversations/anon/:anonId', async (req,res) => {
  try {
    const conv = await Conversation.findOne({ anonId: req.params.anonId }).lean();
    if (!conv) return res.status(404).json({ message: 'Not found' });
    return res.json({ conversation: conv });
  } catch (err) {
    console.error('help:anon', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

/* ---------- admin list (cached) ---------- */
router.get('/conversations/admin/list',
  mildLimiter,
  (auth && auth.required) ? auth.required : (req,res,next)=>next(),
  permit('admin','superadmin'),
  async (req,res) => {
    try {
      const cacheKey = 'adminList:v2:' + (req.query.page || 1) + ':' + (req.query.limit || 200);
      const cached = adminListCache.get(cacheKey);
      if (cached) return res.json(cached);

      const page = Math.max(1, parseInt(req.query.page||1));
      const limit = Math.max(1, Math.min(200, parseInt(req.query.limit||50)));
      const skip = (page-1)*limit;
      const docs = await Conversation.find({}).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean();
      const list = docs.map(conv => {
        const last = conv.messages && conv.messages.length ? conv.messages[conv.messages.length - 1] : null;
        return {
          _id: conv._id,
          title: conv.title || conv.name || (conv.anonId ? anonLabelFromAnonId(conv.anonId) : 'Anonymous'),
          name: conv.name || null,
          anonId: conv.anonId || null,
          userId: conv.userId || null,
          lastMessageText: last ? last.text : '',
          lastMessageAt: last ? last.createdAt : conv.updatedAt,
          unreadCount: conv.unreadCount || 0,
          status: conv.status
        };
      });
      const total = await Conversation.countDocuments({});
      const payload = { conversations: list, total };
      adminListCache.set(cacheKey, payload);
      return res.json(payload);
    } catch (err) {
      console.error('help:admin list', err);
      return res.status(500).json({ message: 'Server error' });
    }
  }
);

/* ---------- admin mark read ---------- */
router.put('/conversations/:id/mark-read', (auth && auth.required) ? auth.required : (req,res,next)=>next(), permit('admin','superadmin'), async (req,res) => {
  try {
    const conv = await Conversation.findById(req.params.id);
    if (!conv) return res.status(404).json({ message: 'Not found' });
    conv.unreadCount = 0;
    conv.messages.forEach(m => { if (m.sender === 'user') m.status = 'read'; });
    await conv.save();
    return res.json({ ok: true, conversation: conv });
  } catch (err) {
    console.error('help:mark-read', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

/* ---------- admin close ---------- */
router.put('/conversations/:id/close', (auth && auth.required) ? auth.required : (req,res,next)=>next(), permit('admin','superadmin'), async (req,res) => {
  try {
    const conv = await Conversation.findById(req.params.id);
    if (!conv) return res.status(404).json({ message: 'Not found' });
    conv.status = 'closed';
    await conv.save();
    return res.json({ ok: true, conversation: conv });
  } catch (err) {
    console.error('help:close', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

/* ---------- admin delete conversation (hard delete) ---------- */
router.delete('/conversations/:id',
  (auth && auth.required) ? auth.required : (req,res,next)=>next(),
  permit('admin','superadmin'),
  async (req,res) => {
    try {
      const id = req.params.id;
      let conv = null;
      if (mongoose.Types.ObjectId.isValid(id)) conv = await Conversation.findById(id);
      if (!conv) conv = await Conversation.findOne({ anonId: id });
      if (!conv) return res.status(404).json({ message: 'Not found' });

      await conv.remove();

      // notify clients
      const io = req.app && req.app.locals && req.app.locals.io;
      if (io) {
        io.to('admins').emit('help.deleted', { conversationId: id });
        io.to(String(id)).emit('help.deleted', { conversationId: id });
      }

      return res.json({ ok: true });
    } catch (err) {
      console.error('help:delete', err);
      return res.status(500).json({ message: 'Server error' });
    }
});

/* ---------- admin delete single message (hard delete) ---------- */
router.delete('/conversations/:id/messages/:mid',
  (auth && auth.required) ? auth.required : (req,res,next)=>next(),
  permit('admin','superadmin'),
  async (req,res) => {
    try {
      const convId = req.params.id;
      const mid = req.params.mid;
      let conv = null;
      if (mongoose.Types.ObjectId.isValid(convId)) conv = await Conversation.findById(convId);
      if (!conv) conv = await Conversation.findOne({ anonId: convId });
      if (!conv) return res.status(404).json({ message: 'Conversation not found' });

      const before = conv.messages.length;
      conv.messages = conv.messages.filter(m => String(m._id) !== String(mid));
      if (conv.messages.length === before) return res.status(404).json({ message: 'Message not found' });

      conv.updatedAt = now();
      await conv.save();

      const io = req.app && req.app.locals && req.app.locals.io;
      if (io) {
        io.to('admins').emit('help.updated', { conversation: conv });
        io.to(String(conv._id)).emit('help.updated', { conversation: conv });
      }

      return res.json({ ok: true, conversation: conv });
    } catch (err) {
      console.error('help:delete-message', err);
      return res.status(500).json({ message: 'Server error' });
    }
});

/* ---------- admin: delete all conversations/messages for a user ---------- */
/*
  DELETE /conversations/user/:id
  Query: ?anon=true  -> treat :id as anonId instead of userId
  This removes entire conversations matching userId (hard delete).
*/
// replace current DELETE '/conversations/:id' handler with this
router.delete('/conversations/:id',
  (auth && auth.required) ? auth.required : (req,res,next)=>next(),
  permit('admin','superadmin'),
  async (req,res) => {
    try {
      const id = req.params.id;
      // Try to delete by _id OR anonId (without causing CastError)
      const cond = mongoose.Types.ObjectId.isValid(id) ? { $or: [{ _id: id }, { anonId: id }] } : { anonId: id };
      const conv = await Conversation.findOneAndDelete(cond);
      if (!conv) return res.status(404).json({ message: 'Not found' });

      const io = req.app && req.app.locals && req.app.locals.io;
      if (io) {
        io.to('admins').emit('help.deleted', { conversationId: conv._id });
        io.to(String(conv._id)).emit('help.deleted', { conversationId: conv._id });
      }

      return res.json({ ok: true });
    } catch (err) {
      console.error('help:delete', err);
      return res.status(500).json({ message: 'Server error' });
    }
});


module.exports = router;
