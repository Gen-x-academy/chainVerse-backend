const mongoose = require("mongoose");

const materialSchema = new mongoose.Schema({
  tutor: { type: mongoose.Schema.Types.ObjectId, ref: "Tutor" },
  title: String,
  uploadedAt: Date
});

module.exports = mongoose.model("Material", materialSchema);
