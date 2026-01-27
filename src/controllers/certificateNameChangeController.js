const CertificateNameChangeRequest = require("../models/CertificateNameChangeRequest");
const Certificate = require("../models/certificate");
const Notification = require("../models/Notification");
const User = require("../models/User");
const logger = require("../utils/logger");

/**
 * Submit a name change request for certificates (Student endpoint)
 * POST /certificates/name-change/request
 */
exports.submitNameChangeRequest = async (req, res) => {
  try {
    const { newFullName, requestedName, reason, certificateId } = req.body;
    const studentId = req.user._id;

    // Verify user is a verified student
    const user = await User.findById(studentId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // Check if user account is verified
    if (!user.isVerified) {
      return res.status(403).json({
        success: false,
        message: "Only verified student accounts can request name changes"
      });
    }

    // Handle file upload if supporting document was provided
    let supportingDocumentUrl = null;
    const supportingDocuments = [];
    
    if (req.file) {
      supportingDocumentUrl = req.file.path || req.file.location;
      supportingDocuments.push(supportingDocumentUrl);
    }

    // Create the name change request
    const nameChangeRequest = await CertificateNameChangeRequest.create({
      studentId,
      certificateId: certificateId || undefined,
      requestedName: newFullName || requestedName,
      currentName: user.name,
      reason,
      supportingDocumentUrl,
      supportingDocuments,
      status: "Pending",
      submittedAt: new Date()
    });

    logger.info(`Name change request submitted by user ${studentId}`);

    return res.status(201).json({
      success: true,
      message: "Name change request submitted successfully",
      data: {
        requestId: nameChangeRequest._id,
        newFullName: nameChangeRequest.requestedName,
        status: nameChangeRequest.status,
        requestedDate: nameChangeRequest.submittedAt
      }
    });
  } catch (error) {
    logger.error(`Error submitting name change request: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: "Failed to submit name change request",
      error: error.message
    });
  }
};

/**
 * View all name change requests submitted by the student (Student endpoint)
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
      .populate("certificateId", "courseId issueDate")
      .sort({ submittedAt: -1 })
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
      message: "Failed to fetch name change requests",
      error: error.message
    });
  }
};

/**
 * Get a single name change request by ID (Student endpoint)
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
      .populate("certificateId", "courseId issueDate")
      .populate("reviewedBy", "name email")
      .lean();

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "Name change request not found"
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
      message: "Failed to fetch name change request",
      error: error.message
    });
  }
};

/**
 * Get all name change requests (Admin endpoint)
 * GET /admin/certificate-name-change/requests
 */
exports.getAllRequests = async (req, res) => {
  try {
    const { status, studentId } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (studentId) filter.studentId = studentId;

    const requests = await CertificateNameChangeRequest.find(filter)
      .populate("studentId", "name email")
      .populate("certificateId", "courseId issueDate")
      .sort({ submittedAt: -1 });

    res.status(200).json({
      success: true,
      data: requests,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error retrieving requests",
      error: error.message,
    });
  }
};

/**
 * Get a specific request by ID (Admin endpoint)
 * GET /admin/certificate-name-change/request/:requestId
 */
exports.getRequestById = async (req, res) => {
  try {
    const { requestId } = req.params;
    const request = await CertificateNameChangeRequest.findById(requestId)
      .populate("studentId", "name email")
      .populate("certificateId", "courseId issueDate")
      .populate("reviewedBy", "name email");

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "Request not found",
      });
    }

    res.status(200).json({
      success: true,
      data: request,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error retrieving request",
      error: error.message,
    });
  }
};

/**
 * Make a decision on a name change request (Admin endpoint)
 * PUT /admin/certificate-name-change/request/:requestId/decision
 */
exports.makeDecision = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { status, feedback } = req.body;
    const adminId = req.user.id || req.user._id;

    if (!["Approved", "Rejected"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status. Must be Approved or Rejected.",
      });
    }

    const request = await CertificateNameChangeRequest.findById(requestId);
    if (!request) {
      return res.status(404).json({
        success: false,
        message: "Request not found",
      });
    }

    if (request.status !== "Pending") {
      return res.status(400).json({
        success: false,
        message: "Request has already been reviewed",
      });
    }

    // Update request
    request.status = status;
    request.feedback = feedback;
    request.reviewedAt = new Date();
    request.reviewedBy = adminId;
    await request.save();

    if (status === "Approved" && request.certificateId) {
      await Certificate.findByIdAndUpdate(request.certificateId, {
        studentName: request.requestedName,
      });
    }

    const notification = new Notification({
      userId: request.studentId,
      title: "Certificate Name Change Request Update",
      message: `Your certificate name change request has been ${status.toLowerCase()}. ${feedback ? "Feedback: " + feedback : ""}`,
      type: "certificate_update",
    });
    await notification.save();

    res.status(200).json({
      success: true,
      message: `Request ${status.toLowerCase()} successfully`,
      data: request,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error processing decision",
      error: error.message,
    });
  }
};
