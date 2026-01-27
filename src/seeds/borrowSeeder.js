const mongoose = require("mongoose");
const Borrow = require("../models/Borrow");
const User = require("../models/User");
const Course = require("../models/course");
const { createBorrow } = require("../utils/borrowHelper");
require("dotenv").config();

const seedBorrows = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB");

    const students = await User.find({ role: "student" }).limit(5);
    const courses = await Course.find({ isPublished: true }).limit(10);

    if (students.length === 0 || courses.length === 0) {
      console.log("No students or courses found. Please create some first.");
      process.exit(0);
    }

    await Borrow.deleteMany({ resourceType: "course" });
    console.log("Cleared existing course borrows");

    const borrowPromises = [];

    students.forEach((student, idx) => {
      const activeCourse = courses[idx % courses.length];
      borrowPromises.push(createBorrow(student._id, activeCourse._id, 14));

      if (courses[idx + 1]) {
        const expiredDate = new Date();
        expiredDate.setDate(expiredDate.getDate() - 5);
        borrowPromises.push(
          Borrow.create({
            userId: student._id,
            resourceId: courses[idx + 1]._id,
            resourceType: "course",
            resourceTitle: courses[idx + 1].title,
            borrowDate: new Date(
              expiredDate.getTime() - 14 * 24 * 60 * 60 * 1000,
            ),
            expiryDate: expiredDate,
            status: "expired",
            progress: 45,
          }),
        );
      }

      if (courses[idx + 2]) {
        borrowPromises.push(
          Borrow.create({
            userId: student._id,
            resourceId: courses[idx + 2]._id,
            resourceType: "course",
            resourceTitle: courses[idx + 2].title,
            borrowDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
            expiryDate: new Date(Date.now() - 16 * 24 * 60 * 60 * 1000),
            returnDate: new Date(Date.now() - 16 * 24 * 60 * 60 * 1000),
            status: "completed",
            progress: 100,
          }),
        );
      }
    });

    await Promise.all(borrowPromises);
    console.log(`Created ${borrowPromises.length} sample borrows`);

    await mongoose.disconnect();
    console.log("Seeding completed successfully");
    process.exit(0);
  } catch (error) {
    console.error("Seeding error:", error);
    process.exit(1);
  }
};

seedBorrows();
