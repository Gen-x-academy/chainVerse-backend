const Student = require("../models/student");

const createStudent = async (studentId, studentMail) => {
  let student = new Student({
    _id: studentId,
    email: studentMail,
  });
  student = await student.save();
  return student;
};

module.exports = { createStudent };