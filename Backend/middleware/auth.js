// middleware/auth.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const config = require('../config');

const SECRET = config.JWT_SECRET;

// verify token, return user object when possible (lean)
async function verifyToken(token) {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, SECRET);
    if (payload && payload.id) {
      try {
        const user = await User.findById(payload.id).select('-password').lean();
        return user || payload;
      } catch (e) {
        return payload;
      }
    }
    return payload;
  } catch (err) {
    return null;
  }
}

async function required(req, res, next) {
  try {
    let token = null;
    const auth = req.get('Authorization') || req.headers.authorization || '';
    if (auth && auth.startsWith('Bearer ')) token = auth.slice(7).trim();
    if (!token && req.cookies && req.cookies.token) token = req.cookies.token;
    const user = await verifyToken(token);
    if (!user) return res.status(401).json({ message: 'No token or invalid token' });
    req.user = user;
    next();
  } catch (err) { next(err); }
}

async function optional(req, res, next) {
  try {
    let token = null;
    const auth = req.get('Authorization') || req.headers.authorization || '';
    if (auth && auth.startsWith('Bearer ')) token = auth.slice(7).trim();
    if (!token && req.cookies && req.cookies.token) token = req.cookies.token;
    const user = await verifyToken(token);
    if (user) req.user = user;
    return next();
  } catch (err) { return next(); }
}

const auth = (req, res, next) => required(req,res,next);
auth.required = required;
auth.optional = optional;
module.exports = auth;
