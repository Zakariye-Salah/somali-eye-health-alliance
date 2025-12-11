// routes/auth.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { body, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const auth = require('../middleware/auth');
const config = require('../config'); // centralized config (JWT_SECRET, JWT_EXPIRES_IN)

// POST /api/auth/register
router.post('/register', [
  body('fullName').notEmpty().withMessage('Full name required'),
  body('username').isLength({ min: 3 }).withMessage('Username min 3 chars'),
  body('password').isLength({ min: 6 }).withMessage('Password min 6 chars')
], async (req, res, next) => {
  try {
    const errs = validationResult(req);
    if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });

    const { fullName, username, password, email } = req.body;
    const usernameLc = username ? String(username).trim().toLowerCase() : '';
    const emailLc = (email && String(email).trim()) ? String(email).trim().toLowerCase() : null;

    console.info('Register attempt:', { username: usernameLc, email: emailLc });

    // check username
    const exists = await User.findOne({ username: usernameLc });
    if (exists) return res.status(400).json({ message: 'Username already taken' });

    // check email only when present and non-empty
    if (emailLc) {
      const emailExists = await User.findOne({ email: emailLc });
      if (emailExists) return res.status(400).json({ message: 'Email already registered' });
    }

    const user = new User({ fullName, username: usernameLc, password, email: emailLc });
    await user.save();

    // sign token with central secret/expiry
    const token = jwt.sign({ id: user._id }, config.JWT_SECRET, { expiresIn: config.JWT_EXPIRES_IN });

    res.json({ token, user: user.toJSON() });

  } catch (err) {
    console.error('Register route error:', err && err.message ? err.message : err);
    // handle duplicate key errors (E11000)
    if (err && err.code === 11000) {
      const dupField = Object.keys(err.keyValue || {})[0] || 'field';
      // map common fields to friendly messages
      if (dupField === 'email') return res.status(400).json({ message: 'Email already exists' });
      if (dupField === 'username') return res.status(400).json({ message: 'Username already exists' });
      return res.status(400).json({ message: `${dupField} already exists` });
    }
    next(err);
  }
});

// POST /api/auth/login
router.post('/login', [
  // accept either username OR usernameOrEmail from client, only validate password here
  body('password').notEmpty().withMessage('password required')
], async (req, res, next) => {
  try {
    const errs = validationResult(req);
    if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });

    // Accept either `username` (as before) or `usernameOrEmail` from client
    const usernameOrEmail = (req.body.username || req.body.usernameOrEmail || '').toLowerCase().trim();
    const password = req.body.password;

    if (!usernameOrEmail) return res.status(400).json({ message: 'Invalid credentials' });

    // Try find by username first, then by email
    let user = await User.findOne({ username: usernameOrEmail });
    if (!user) user = await User.findOne({ email: usernameOrEmail });

    if (!user) return res.status(400).json({ message: 'Invalid credentials' });

    const ok = await user.comparePassword(password);
    if (!ok) return res.status(400).json({ message: 'Invalid credentials' });

    // sign token with central secret/expiry
    const token = jwt.sign({ id: user._id }, config.JWT_SECRET, { expiresIn: config.JWT_EXPIRES_IN });

    res.json({ token, user: user.toJSON() });
  } catch (err) { next(err); }
});

// PUT /api/auth/me  (update current user's profile)
router.put('/me', auth, [
  body('fullName').optional().notEmpty().withMessage('Full name required'),
  body('email').optional().isEmail().withMessage('Invalid email'),
  body('password').optional().isLength({ min: 6 }).withMessage('Password min 6 chars')
], async (req, res, next) => {
  try {
    const errs = validationResult(req);
    if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });

    const userId = req.user._id;
    const { fullName, email, password } = req.body;

    const update = {};
    if (fullName) update.fullName = fullName;
    if (email) {
      const e = String(email).trim().toLowerCase();
      const found = await User.findOne({ email: e, _id: { $ne: userId } });
      if (found) return res.status(400).json({ message: 'Email already registered' });
      update.email = e;
    }
    if (password) update.password = password; // UserSchema pre('save') will hash only if .save() called below

    // fetch and modify
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    Object.assign(user, update);
    await user.save();

    res.json({ user: user.toJSON() });
  } catch (err) { next(err); }
});

// GET /api/auth/check-username?username=...
router.get('/check-username', async (req, res, next) => {
  try {
    const username = (req.query.username || '').toLowerCase().trim();
    if (!username) return res.json({ available: false });
    const user = await User.findOne({ username });
    res.json({ available: !user });
  } catch (err) { next(err); }
});

// GET /api/auth/me
router.get('/me', auth, async (req, res) => {
  res.json({ user: req.user });
});

// GET /api/auth/google (placeholder)
router.get('/google', (req, res) => {
  // Implement OAuth redirect flow here
  res.status(501).json({ message: 'Not implemented' });
});

module.exports = router;
