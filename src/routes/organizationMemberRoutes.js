const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const organizationAdmin = require('../middlewares/organizationAdmin');
const organizationMemberController = require('../controllers/organizationMemberController');

// @route   POST /organization/member/add
// @desc    Add new organization member (creates user account and sends welcome email with credentials)
// @access  Organization Admin
router.post(
  '/member/add',
  auth.authenticate,
  organizationAdmin.ensureOrganizationAdmin,
  organizationMemberController.addMember
);

// @route   GET /organization/members
// @desc    Get all organization members
// @access  Organization Admin
router.get(
  '/members',
  auth.authenticate,
  organizationAdmin.ensureOrganizationAdmin,
  organizationMemberController.getAllMembers
);

// @route   GET /organization/member/:id
// @desc    Get single member details
// @access  Organization Admin
router.get(
  '/member/:id',
  auth.authenticate,
  organizationAdmin.ensureOrganizationAdmin,
  organizationMemberController.getMemberById
);

// @route   PUT /organization/member/:id/update-role
// @desc    Update member role
// @access  Organization Admin
router.put(
  '/member/:id/update-role',
  auth.authenticate,
  organizationAdmin.ensureOrganizationAdmin,
  organizationMemberController.updateMemberRole
);

// @route   DELETE /organization/member/:id/remove
// @desc    Remove organization member (sends removal notification email)
// @access  Organization Admin
router.delete(
  '/member/:id/remove',
  auth.authenticate,
  organizationAdmin.ensureOrganizationAdmin,
  organizationMemberController.removeMember
);

module.exports = router;