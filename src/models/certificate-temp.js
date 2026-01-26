const mongoose = require("mongoose");

const certificateSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: "Student" },
  issuedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Tutor" }
});

module.exports = mongoose.models.CertificateTemp || mongoose.model("CertificateTemp", certificateSchema);
