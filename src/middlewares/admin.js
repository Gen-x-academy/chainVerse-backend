const User = require('../models/User');

exports.ensureAdmin = async (req, res, next) => {
  try {
    // Assumes req.user is already set by earlier auth middleware (e.g., passport)
    if (!req.user || !req.user._id) {
      return res.status(401).json({ msg: 'Unauthorized: No user info found' });
    }

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }

    if (!user.isAdmin) {
      return res.status(403).json({ msg: 'Access denied: Admin privileges required' });
    }

    // User is admin, proceed
    next();
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
};
