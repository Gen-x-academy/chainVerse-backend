const CertificateNameChangeRequest = require("../models/CertificateNameChangeRequest");
const Certificate = require("../models/certificate");
const Notification = require("../models/Notification");
const User = require("../models/User");
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

exports.makeDecision = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { status, feedback } = req.body;
    const adminId = req.user.id;

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

    if (status === "Approved") {
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
