const OrganizationMember = require('../models/OrganizationMember');

/**
 * Middleware to check if user is an organization admin
 * Requires authentication middleware to run first
 */
exports.ensureOrganizationAdmin = async (req, res, next) => {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({ 
        success: false,
        message: 'Unauthorized: No user info found' 
      });
    }

    // Find user's organization membership
    const member = await OrganizationMember.findOne({
      userId: req.user._id,
      status: 'Active'
    });

    if (!member) {
      return res.status(403).json({ 
        success: false,
        message: 'Access denied: You are not a member of any organization' 
      });
    }

    // Check if user is an organization admin
    if (member.role !== 'Admin') {
      return res.status(403).json({ 
        success: false,
        message: 'Access denied: Organization admin privileges required' 
      });
    }

    // Attach organizationId to request for use in controllers
    req.user.organizationId = member.organizationId;
    req.organizationMember = member;

    next();
  } catch (error) {
    console.error('Organization admin middleware error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error' 
    });
  }
};
