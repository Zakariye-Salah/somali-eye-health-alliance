// middleware/isAdmin.js
module.exports = function (req, res, next) {
  const u = req.user;
  if (!u) return res.status(401).json({ message: 'Unauthorized' });
  if (u.role !== 'admin') return res.status(403).json({ message: 'Forbidden - admin only' });
  next();
};
