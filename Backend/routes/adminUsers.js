// routes/adminUsers.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { body, validationResult } = require('express-validator');
const auth = require('../middleware/auth');

// middleware: allow only admin or superadmin to access these admin routes
function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
  if (req.user.role === 'admin' || req.user.role === 'superadmin') return next();
  return res.status(403).json({ message: 'Forbidden' });
}

// GET /api/admin/users  — list users (admin or superadmin)
router.get('/users', auth, requireAdmin, async (req, res, next) => {
  try {
    const users = await User.find({})
      .select('-password') // never send password
      .sort({ createdAt: -1 })
      .lean();
    res.json({ users });
  } catch (err) { next(err); }
});

// POST /api/admin/users  — create a new user
router.post('/users', auth, requireAdmin, [
  body('fullName').notEmpty().withMessage('Full name required'),
  body('username').isLength({ min: 3 }).withMessage('Username min 3 chars'),
  body('password').isLength({ min: 6 }).withMessage('Password min 6 chars'),
  body('role').optional().isIn(['user','admin','superadmin']).withMessage('Invalid role')
], async (req, res, next) => {
  try {
    const errs = validationResult(req);
    if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });

    const { fullName, username, password, email, role = 'user' } = req.body;
    const usernameLc = String(username).trim().toLowerCase();
    const emailLc = email ? String(email).trim().toLowerCase() : null;

    // Only superadmin can create another superadmin
    if (role === 'superadmin' && req.user.role !== 'superadmin') {
      return res.status(403).json({ message: 'Cannot create superadmin' });
    }

    // Create and save (UserSchema pre-save will hash the password)
    const user = new User({
      fullName,
      username: usernameLc,
      password,
      email: emailLc,
      role
    });

    await user.save();
    res.status(201).json({ user: user.toJSON() });
  } catch (err) {
    // handle duplicate key
    if (err && err.code === 11000) {
      const field = Object.keys(err.keyValue || {})[0] || 'field';
      return res.status(400).json({ message: `${field} already exists` });
    }
    next(err);
  }
});

// PUT /api/admin/users/:id  — edit user
router.put('/users/:id', auth, requireAdmin, [
  body('fullName').optional().notEmpty().withMessage('Full name required'),
  body('email').optional().isEmail().withMessage('Invalid email'),
  body('password').optional().isLength({ min: 6 }).withMessage('Password min 6 chars'),
  body('role').optional().isIn(['user','admin','superadmin']).withMessage('Invalid role')
], async (req, res, next) => {
  try {
    const errs = validationResult(req);
    if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });

    const targetId = req.params.id;
    const actor = req.user; // user performing the action
    const target = await User.findById(targetId);
    if (!target) return res.status(404).json({ message: 'User not found' });

    // Authorization rules:
    // - admin may NOT edit users who are admin/superadmin
    // - superadmin can edit any user
    if (actor.role === 'admin' && target.role !== 'user') {
      return res.status(403).json({ message: 'Admins can only edit normal users' });
    }

    // If changing role to superadmin, only superadmin can do that
    if (req.body.role === 'superadmin' && actor.role !== 'superadmin') {
      return res.status(403).json({ message: 'Only superadmin can assign superadmin role' });
    }

    // apply updates
    const { fullName, email, password, role } = req.body;
    if (fullName) target.fullName = fullName;
    if (email) target.email = String(email).trim().toLowerCase();
    if (typeof role !== 'undefined') target.role = role;
    if (password) target.password = password; // pre-save will hash

    await target.save();
    res.json({ user: target.toJSON() });
  } catch (err) {
    if (err && err.code === 11000) {
      const field = Object.keys(err.keyValue || {})[0] || 'field';
      return res.status(400).json({ message: `${field} already exists` });
    }
    next(err);
  }
});

// DELETE /api/admin/users/:id  — delete user
router.delete('/users/:id', auth, requireAdmin, async (req, res, next) => {
  try {
    const actor = req.user;
    const targetId = req.params.id;

    if (actor._id.toString() === targetId) {
      return res.status(400).json({ message: 'You cannot delete yourself' });
    }

    const target = await User.findById(targetId);
    if (!target) return res.status(404).json({ message: 'User not found' });

    // admin may only delete users with role 'user'
    if (actor.role === 'admin' && target.role !== 'user') {
      return res.status(403).json({ message: 'Admins can only delete normal users' });
    }

    await target.deleteOne();
    res.json({ ok: true, message: 'User deleted' });
  } catch (err) { next(err); }
});

module.exports = router;
