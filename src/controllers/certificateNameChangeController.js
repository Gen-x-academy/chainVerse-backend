const CertificateNameChangeRequest = require('../models/CertificateNameChangeRequest');
const User = require('../models/User');
const logger = require('../utils/logger');

/**
 * Submit a name change request for certificates
 * POST /certificates/name-change/request
 */
exports.submitNameChangeRequest = async (req, res) => {
  try {
    const { newFullName, reason, certificateId } = req.body;
    const studentId = req.user._id;

    // Verify user is a verified student
    const user = await User.findById(studentId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if user account is verified
    if (!user.isVerified) {
      return res.status(403).json({
        success: false,
        message: 'Only verified student accounts can request name changes'
      });
    }

    // Handle file upload if supporting document was provided
    let supportingDocumentUrl = null;
    if (req.file) {
      // File is already uploaded via multer middleware
      supportingDocumentUrl = req.file.path || req.file.location;
    }

    // Create the name change request
    const nameChangeRequest = await CertificateNameChangeRequest.create({
      studentId,
      certificateId: certificateId || undefined,
      newFullName,
      reason,
      supportingDocumentUrl,
      status: 'Pending',
      requestedDate: new Date()
    });

    logger.info(`Name change request submitted by user ${studentId}`);

    return res.status(201).json({
      success: true,
      message: 'Name change request submitted successfully',
      data: {
        requestId: nameChangeRequest._id,
        newFullName: nameChangeRequest.newFullName,
        status: nameChangeRequest.status,
        requestedDate: nameChangeRequest.requestedDate
      }
    });
  } catch (error) {
    logger.error(`Error submitting name change request: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: 'Failed to submit name change request',
      error: error.message
    });
  }
};

/**
 * View all name change requests submitted by the student
 * GET /certificates/name-change/my-requests
 */
exports.getMyNameChangeRequests = async (req, res) => {
  try {
    const studentId = req.user._id;
    const { status } = req.query;

    // Build query
    const query = { studentId };
    if (status) {
      query.status = status;
    }

    // Fetch requests
    const requests = await CertificateNameChangeRequest.find(query)
      .populate('certificateId', 'courseId issueDate')
      .sort({ requestedDate: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      count: requests.length,
      data: requests
    });
  } catch (error) {
    logger.error(`Error fetching name change requests: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch name change requests',
      error: error.message
    });
  }
};

/**
 * Get a single name change request by ID
 * GET /certificates/name-change/request/:requestId
 */
exports.getNameChangeRequestById = async (req, res) => {
  try {
    const { requestId } = req.params;
    const studentId = req.user._id;

    const request = await CertificateNameChangeRequest.findOne({
      _id: requestId,
      studentId
    })
      .populate('certificateId', 'courseId issueDate')
      .populate('reviewedBy', 'name email')
      .lean();

    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Name change request not found'
      });
    }

    return res.status(200).json({
      success: true,
      data: request
    });
  } catch (error) {
    logger.error(`Error fetching name change request: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch name change request',
      error: error.message
    });
  }
};
