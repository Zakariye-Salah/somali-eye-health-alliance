const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const Booking = require('../models/Booking');
const Contact = require('../models/Contact');
const Newsletter = require('../models/Newsletter');
const User = require('../models/User');
const auth = require('../middleware/auth');
const isAdmin = require('../middleware/isAdmin');
const { body, validationResult } = require('express-validator');

/**
 * Helper: annotate a message doc for frontend convenience:
 */
async function annotateListItem(doc) {
  const out = doc.toObject ? doc.toObject() : Object.assign({}, doc);
  const last = (doc.messages && doc.messages.length) ? doc.messages[doc.messages.length - 1] : null;
  out.lastMessage = last ? (last.text || '') : (doc.lastMessage || '');
  out.lastFrom = last ? (last.from || '') : null;
  out.lastFromIsAdmin = false;
  try {
    if (out.lastFrom) {
      const u = await User.findOne({ $or: [{ username: out.lastFrom }, { email: out.lastFrom }] }).select('role').lean();
      if (u && (u.role === 'admin' || u.role === 'superadmin')) out.lastFromIsAdmin = true;
    }
  } catch(e) { /* ignore */ }

  if (out.lastFromIsAdmin) out.displayName = 'Arag Hospital';
  else out.displayName = out.fullName || out.userName || out.username || (out.email || '').split('@')[0] || 'User';

  return out;
}

/** Helper: check if a given authenticated user should be considered part of a conversation */
function userMatchesConv(conv, user) {
  if (!user || !conv) return false;
  // by user._id (if conv has userId)
  if (conv.userId && String(conv.userId) === String(user._id)) return true;
  const uname = (user.username || '').toLowerCase();
  const uemail = (user.email || '').toLowerCase();
  // check participants array (lowercase compare)
  if (Array.isArray(conv.participants) && conv.participants.some(p => String(p || '').toLowerCase() === uname || String(p || '').toLowerCase() === uemail)) return true;
  // check conv.email / conv.fullName
  if (conv.email && String(conv.email).toLowerCase() === uemail) return true;
  if (conv.fullName && String(conv.fullName).toLowerCase() === String(user.fullName || '').toLowerCase()) return true;
  return false;
}

/**
 * GET /api/messages?filter=...
 */
router.get('/', auth, async (req, res, next) => {
  try {
    const filter = (req.query.filter || 'all').toLowerCase();

    if (req.user.role === 'admin' || req.user.role === 'superadmin') {
      if (filter === 'subscribed') {
        const subs = await Newsletter.find().select('email createdAt -_id').sort({ createdAt: -1 }).limit(1000).lean();
        return res.json({ type: 'subscribed', items: subs });
      }
      if (filter === 'contacts') {
        const contacts = await Contact.find().sort({ createdAt: -1 }).limit(1000).lean();
        return res.json({ type: 'contacts', items: contacts });
      }
      if (filter === 'bookings') {
        const bookings = await Booking.find().sort({ createdAt: -1 }).limit(1000).populate('doctorId').populate('userId','fullName username email').lean();
        return res.json({ type: 'bookings', items: bookings });
      }

      const docs = await Message.find().sort({ updatedAt: -1 }).limit(1000);
      const items = await Promise.all(docs.map(d => annotateListItem(d)));
      return res.json({ type: 'messages', items });
    }

    // normal user
    const username = req.user.username;
    const email = req.user.email;

    if (filter === 'bookings') {
      const bookings = await Booking.find({ userId: req.user._id }).sort({ createdAt: -1 }).populate('doctorId').lean();
      return res.json({ type: 'bookings', items: bookings });
    }

    if (filter === 'subscribed') {
      if (!email) return res.json({ type: 'subscribed', subscribed: false });
      const found = await Newsletter.findOne({ email: email.toLowerCase() }).lean();
      return res.json({ type: 'subscribed', subscribed: !!found, email: email });
    }

    // default: find convs where participants include username or email OR conv.email matches
    const q = {
      $or: [
        { participants: username },
        { participants: email },
        { email: email },
        { userId: req.user._id }
      ]
    };

    const list = await Message.find(q).sort({ updatedAt: -1 }).limit(500);
    const items = await Promise.all(list.map(d => annotateListItem(d)));
    return res.json({ type: 'messages', items });

  } catch (err) { next(err); }
});

/**
 * GET /api/messages/:id
 */
router.get('/:id', auth, async (req, res, next) => {
  try {
    const c = await Message.findById(req.params.id);
    if (!c) return res.status(404).json({ message: 'Not found' });

    // allow if admin OR user matches the conversation by participants/email/userId
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
      if (!userMatchesConv(c, req.user)) {
        return res.status(403).json({ message: 'Forbidden' });
      }
    }

    const annotated = await annotateListItem(c);
    return res.json(annotated);
  } catch (err) { next(err); }
});

/**
 * POST /api/messages/:id -> reply
 */
router.post('/:id', auth, [
  body('text').notEmpty()
], async (req, res, next) => {
  try {
    const errs = validationResult(req); if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });
    const conv = await Message.findById(req.params.id);
    if (!conv) return res.status(404).json({ message: 'Not found' });

    // permission: admin OR participant OR (match by email/userId)
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
      if (!userMatchesConv(conv, req.user)) {
        return res.status(403).json({ message: 'Forbidden' });
      }
    }

    // push message
    const senderLabel = req.user.username || req.user.email || req.user.fullName || 'User';
    conv.messages.push({ from: senderLabel, text: req.body.text, at: new Date() });

    // if the sender is not admin, increment unread for admin (simple unread count)
    // if sender is admin, ensure the end-user remains in participants (so they can open conv)
    if (req.user.role === 'admin' || req.user.role === 'superadmin') {
      // add participants for end-user if possible (so user can open the convo)
      if (conv.email && !conv.participants.includes(conv.email)) conv.participants.push(conv.email);
      if (conv.userId && !conv.participants.some(p => String(p) === String(conv.userId))) {
        // store identifier by string form if helpful (we keep participants as strings - add email/username)
        if (conv.email) conv.participants.push(conv.email);
      }
    } else {
      // normal user sent: ensure their identifiers present in participants
      if (req.user.username && !conv.participants.includes(req.user.username)) conv.participants.push(req.user.username);
      if (req.user.email && !conv.participants.includes(req.user.email)) conv.participants.push(req.user.email);
      if (req.user._id && (!conv.userId || String(conv.userId) !== String(req.user._id))) conv.userId = req.user._id;
    }

    conv.unreadCount = (conv.unreadCount || 0) + 1;
    conv.lastMessage = req.body.text;
    await conv.save();

    const annotated = await annotateListItem(conv);
    return res.json(annotated);
  } catch (err) { next(err); }
});

/**
 * POST /api/messages  -> create conversation (public OR authenticated)
 * - If a conversation already exists for same user (by email/username/userId) append a message instead of creating duplicate.
 */
router.post('/', [
  body('fullName').notEmpty(),
  body('text').notEmpty()
], async (req, res, next) => {
  try {
    const errs = validationResult(req); if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });

    let { fullName, email, text, type = 'message' } = req.body;
    const participants = [];
    let existingConv = null;

    // normalize incoming email
    email = email ? String(email).toLowerCase() : undefined;

    // if authenticated, prefer user identity
    if (req.user) {
      if (!fullName) fullName = req.user.fullName || req.user.username;
      if (!email && req.user.email) email = req.user.email;
      if (req.user.username) participants.push(req.user.username);
      if (req.user.email) participants.push(req.user.email);
      // try to find existing conv by userId OR by participants including username/email
      existingConv = await Message.findOne({
        $or: [
          { userId: req.user._id },
          { participants: req.user.username },
          { participants: req.user.email },
          { email: email }
        ]
      });
    } else {
      // guest: try to find by email (if provided) or by fullName
      if (email) {
        existingConv = await Message.findOne({ email: email });
      } else if (fullName) {
        existingConv = await Message.findOne({ fullName: fullName });
      }
      if (email) participants.push(email);
      else if (fullName) participants.push(fullName);
    }

    if (existingConv) {
      // append to existing conversation
      const sender = (req.user ? (req.user.username || req.user.email || fullName) : fullName);
      existingConv.messages.push({ from: sender, text, at: new Date() });
      existingConv.lastMessage = text;
      existingConv.unreadCount = (existingConv.unreadCount || 0) + 1;
      // ensure user identifiers present
      if (req.user) {
        if (req.user.username && !existingConv.participants.includes(req.user.username)) existingConv.participants.push(req.user.username);
        if (req.user.email && !existingConv.participants.includes(req.user.email)) existingConv.participants.push(req.user.email);
        existingConv.userId = existingConv.userId || req.user._id;
      } else if (email && !existingConv.participants.includes(email)) {
        existingConv.participants.push(email);
      }
      await existingConv.save();
      const annotated = await annotateListItem(existingConv);
      return res.status(200).json(annotated);
    }

    // create brand new conversation
    const conv = new Message({
      type,
      fullName,
      email,
      participants,
      messages: [{ from: fullName, text, at: new Date() }],
      lastMessage: text,
      unreadCount: 1
    });

    if (req.user) {
      conv.userId = req.user._id;
      if (req.user.username && !conv.participants.includes(req.user.username)) conv.participants.push(req.user.username);
      if (req.user.email && !conv.participants.includes(req.user.email)) conv.participants.push(req.user.email);
    }

    await conv.save();
    const annotated = await annotateListItem(conv);
    res.status(201).json(annotated);
  } catch (err) { next(err); }
});

// GET /api/messages/unread-count
router.get('/unread-count', auth, async (req, res, next) => {
  try {
    // Admin: return total unread across all conversations
    if (req.user && (req.user.role === 'admin' || req.user.role === 'superadmin')) {
      const docs = await Message.find().select('unreadCount').lean();
      const total = (docs || []).reduce((s, d) => s + (Number(d.unreadCount) || 0), 0);
      return res.json({ total });
    }

    // Normal user: sum unread counts for conversations that belong to them
    const email = (req.user.email || '').toLowerCase();
    const username = (req.user.username || '');
    const q = {
      $or: [
        { participants: username },
        { participants: email },
        { email: email },
        { userId: req.user._id }
      ]
    };
    const list = await Message.find(q).select('unreadCount').lean();
    const total = (list || []).reduce((s, d) => s + (Number(d.unreadCount) || 0), 0);
    return res.json({ total });
  } catch (err) { next(err); }
});

// POST /api/messages/:id/mark-read
router.post('/:id/mark-read', auth, async (req, res, next) => {
  try {
    const conv = await Message.findById(req.params.id);
    if (!conv) return res.status(404).json({ message: 'Not found' });

    // authorize: admin OR participant OR owner by userId/email
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
      const allowed = userMatchesConv(conv, req.user);
      if (!allowed) return res.status(403).json({ message: 'Forbidden' });
    }

    // mark read for the conversation: (simple model) set unreadCount = 0
    conv.unreadCount = 0;
    await conv.save();

    const annotated = await annotateListItem(conv);
    return res.json({ ok: true, conv: annotated });
  } catch (err) { next(err); }
});

/**
 * DELETE /api/messages/:convId/message/:msgId -> delete a sub-message
 */
router.delete('/:convId/message/:msgId', auth, async (req, res, next) => {
  try {
    const { convId, msgId } = req.params;
    const conv = await Message.findById(convId);
    if (!conv) return res.status(404).json({ message: 'Conversation not found' });

    const found = conv.messages.find(m => String(m._id || m.id || '') === String(msgId));
    if (!found) return res.status(404).json({ message: 'Message not found' });

    if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
      const allowedNames = [ req.user.username, req.user.email, req.user.fullName ].filter(Boolean);
      if (!allowedNames.includes(found.from)) {
        return res.status(403).json({ message: 'Forbidden to delete this message' });
      }
    }

    conv.messages = conv.messages.filter(m => String(m._id || m.id || '') !== String(msgId));
    conv.lastMessage = conv.messages.length ? conv.messages[conv.messages.length - 1].text : '';
    conv.unreadCount = Math.max(0, (conv.unreadCount || 0) - 1);

    await conv.save();
    const annotated = await annotateListItem(conv);
    res.json({ ok: true, conv: annotated });
  } catch (err) { next(err); }
});

module.exports = router;
