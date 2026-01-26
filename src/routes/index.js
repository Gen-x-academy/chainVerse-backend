const express = require("express");
const tutorRoutes = require("./tutorRoutes");
const subscriptionPlanRoutes = require("./subscriptionPlanRoutes");
const organizationRoutes = require("./organization");
const certificateRoutes = require("./certificateRoutes");
const certificateNameChangeRoutes = require("./certificateNameChangeRoutes");
const reportAbuseRoutes = require("./reportAbuseRoute");
const pointsRoutes = require("./pointsRoutes");
const notificationRoutes = require("./notifications");
const authRoutes = require('./authRoute');
const courseRoutes = require('./courseRoute');
const rateLimitRoutes = require('./rateLimitRoutes');
const courseUpdateRoutes = require('./courseUpdateRoutes');
const recommendationRoutes = require('../modules/recommendation.routes');
const studentCourseRoutes = require('./studentCourseRoutes');
const bookRoutes = require('./bookRoutes');

const router = express.Router();

router.use("/", tutorRoutes);
router.use("/", subscriptionPlanRoutes);
router.use("/", organizationRoutes);
router.use("/certificates", certificateRoutes);
router.use("/certificates/name-change", certificateNameChangeRoutes);
router.use("/reports/abuse", reportAbuseRoutes);
router.use("/notifications", notificationRoutes);
router.use("/", pointsRoutes);
router.use('/auth', authRoutes);
router.use('/courses', courseRoutes);
router.use('/rate-limit', rateLimitRoutes);
router.use('/', courseUpdateRoutes);
router.use('/recommendation', recommendationRoutes);
router.use('/', studentCourseRoutes);
router.use('/books', bookRoutes);

module.exports = router;