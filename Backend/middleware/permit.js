// middleware/permit.js
module.exports = function permit(...allowedRoles) {
  return function (req, res, next) {
    try {
      const user = req.user || null;
      if (!user) return res.status(401).json({ message: 'Unauthorized' });
      // if no roles provided -> any authenticated user allowed
      if (!allowedRoles || allowedRoles.length === 0) return next();
      const role = (user.role || '').toString().toLowerCase();
      const allowed = allowedRoles.map(r => r.toString().toLowerCase());
      if (allowed.includes(role)) return next();
      return res.status(403).json({ message: 'Forbidden' });
    } catch (err) {
      console.error('permit:error', err);
      return res.status(500).json({ message: 'Server error' });
    }
  };
};
