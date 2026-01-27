# chainVerse-backend academy

```
chainVerse-backend
├─ API_DOCS.md
├─ app.js
├─ CODE_OF_CONDUCT.md
├─ CONTRIBUTING.md
├─ controllers
│  └─ tutorController.js
├─ index.js
├─ jest.config.js
├─ package.json
├─ README.md
├─ server.js
├─ src
│  ├─ config
│  │  ├─ database
│  │  │  ├─ connection.js
│  │  │  └─ passport.js
│  │  ├─ multerConfig.js
│  │  └─ swaggerConfig.js
│  ├─ controllers
│  │  ├─ aboutSectionController.js
│  │  ├─ adminAccountController.js       <-- NEW FILE
│  │  ├─ adminFinancialAidController.js
│  │  ├─ Auth2FAController.js
│  │  ├─ authController.js
│  │  ├─ badgeController.js
│  │  ├─ careerController.js
│  │  ├─ certificateController.js
│  │  ├─ certificates.js
│  │  ├─ contactMessageController.js
│  │  ├─ courseController.js
│  │  ├─ courseRatingController.js
│  │  ├─ courseReportController.js
│  │  ├─ faqController.js
│  │  ├─ financialAidController.js
│  │  ├─ guestCartController.js
│  │  ├─ loginLogController.js
│  │  ├─ nftController.js
│  │  ├─ notificationController.js
│  │  ├─ organizationController.js
│  │  ├─ organizationMemberController.js
│  │  ├─ platformInfoController.js
│  │  ├─ pointsController.js
│  │  ├─ privacyPolicyController.js
│  │  ├─ removalRequestController.js
│  │  ├─ reportAbuseController.js
│  │  ├─ reportController.js
│  │  ├─ sessionController.js
│  │  ├─ ShareAnalytics.js
│  │  ├─ studyGroupController.js
│  │  ├─ subscriptionPlanController.js
│  │  ├─ termsController.js
│  │  ├─ tutorController.js
│  │  ├─ tutorReportController.js
│  │  ├─ userOrganizationController.js
│  │  └─ verificationController.js
│  ├─ docs
│  │  └─ tutorAuth.md
│  ├─ emailUtils.js
│  ├─ index.js
│  ├─ middlewares
│  │  ├─ admin.js
│  │  ├─ adminAuthorization.js
│  │  ├─ auth.js
│  │  ├─ authMiddleware.js
│  │  ├─ errorHandler.js
│  │  ├─ fileUpload.js
│  │  ├─ roleMiddleware.js
│  │  ├─ tutorAuth.js
│  │  ├─ validatePrivacyPolicy.js
│  │  └─ validateSection.js
│  ├─ models
│  │  ├─ AboutSection.js
│  │  ├─ badge.js
│  │  ├─ careers.js
│  │  ├─ certificate.js
│  │  ├─ ContactMessage.js
│  │  ├─ course.js
│  │  ├─ courseRating.js
│  │  ├─ courseReport.js
│  │  ├─ faq.js
│  │  ├─ financialAid.js
│  │  ├─ guestCart.js
│  │  ├─ loginsLog.js
│  │  ├─ material.js
│  │  ├─ NftAchievement.js
│  │  ├─ organization.js
│  │  ├─ OrganizationMember.js
│  │  ├─ PlatformInfo.js
│  │  ├─ privacyPolicy.js
│  │  ├─ reportAbuse.js
│  │  ├─ requestRemoval.js
│  │  ├─ sessionModel.js
│  │  ├─ student.js
│  │  ├─ studentBadge.js
│  │  ├─ studentPoints.js
│  │  ├─ studyGroup.js
│  │  ├─ studyGroupDiscussion.js
│  │  ├─ studyGroupFile.js
│  │  ├─ studyGroupMember.js
│  │  ├─ SubscriptionPlan.js
│  │  ├─ Terms.js
│  │  ├─ Thread.ts
│  │  ├─ tutors.js
│  │  └─ User.js
│  ├─ README.md
│  ├─ routes
│  │  ├─ 2factorRoute.js
│  │  ├─ aboutSectionRoutes.js
│  │  ├─ accountRemovalRoute.js
│  │  ├─ admin.js
│  │  ├─ adminAccountRoutes.js        <-- NEW FILE
│  │  ├─ adminFinancialAidRoutes.js
│  │  ├─ authRoute.js
│  │  ├─ careerRoutes.js
│  │  ├─ certificateRoutes.js
│  │  ├─ certificates.js
│  │  ├─ contactMessageRoute.js
│  │  ├─ courseRatingRoutes.js
│  │  ├─ courseReportRoutes.js
│  │  ├─ courseRoute.js
│  │  ├─ faqRoute.js
│  │  ├─ financialAidRoute.js
│  │  ├─ guestCartRoute.js
│  │  ├─ index.js
│  │  ├─ loginLogRoute.js
│  │  ├─ nftRoute.js
│  │  ├─ notificationRoutes.js
│  │  ├─ organization.js
│  │  ├─ organizationMemberRoutes.js
│  │  ├─ platformInfo.js
│  │  ├─ pointsRoutes.js
│  │  ├─ privacyPolicyRoutes.js
│  │  ├─ reportAbuseRoute.js
│  │  ├─ reportRoutes.js
│  │  ├─ sessionRoute.js
│  │  ├─ studentReports.js
│  │  ├─ studyGroupRoutes.js
│  │  ├─ subscriptionPlanRoutes.js
│  │  ├─ termsRoute.js
│  │  ├─ tutorReportRoutes.js
│  │  └─ tutorRoutes.js
│  ├─ seeds
│  │  └─ badgeSeeder.js
│  ├─ services
│  │  ├─ careerService.js
│  │  ├─ emailService.js
│  │  ├─ reportScheduler.js
│  │  └─ sectionService.js
│  ├─ src
│  │  └─ templates
│  │     └─ certificateTemplate.html
│  ├─ tests
│  │  ├─ controllers
│  │  │  └─ certificateController.test.js
│  │  ├─ courseReport.test.js
│  │  ├─ forum.test.ts
│  │  ├─ integration
│  │  │  ├─ aboutSectionRoutes.test.js
│  │  │  ├─ adminAccount.test.js      <-- NEW FILE
│  │  │  ├─ certificateRoutes.test.js
│  │  │  ├─ gamification.test.js
│  │  │  ├─ guestCart.test.js
│  │  │  ├─ sessionTest.js
│  │  │  ├─ studentReports.test.js
│  │  │  └─ tutorAuth.test.js
│  │  ├─ organizationEmailService.test.js
│  │  ├─ organizationMember.test.js
│  │  ├─ organizationMemberController.test.js
│  │  └─ unit
│  │     ├─ aboutSection.test.js
│  │     ├─ certificate.test.js
│  │     ├─ contactUsMessage.test.js
│  │     ├─ financialAid.test.js
│  │     ├─ gamification.test.js
│  │     ├─ organizationMember.test.js
│  │     └─ report.test.js
│  ├─ uploads
│  │  └─ profile-images
│  │     └─ profile-6800bf229c392aaf3d90976c-1744885624965-165966296.png
│  ├─ utils
│  │  ├─ auditLogger.js
│  │  ├─ certificateGenerator.js
│  │  ├─ cloudStorage.js
│  │  ├─ email.js
│  │  ├─ fieldValidation.js
│  │  ├─ fileStorage.js
│  │  ├─ gamificationService.js
│  │  ├─ hashGenerator.js
│  │  ├─ hashing.js
│  │  ├─ logger.js
│  │  ├─ nftService.js
│  │  ├─ notifications.js
│  │  ├─ notificationService.js
│  │  ├─ organizationEmailService.js
│  │  ├─ pdfGenerator.js
│  │  ├─ rateLimit.js
│  │  ├─ s3Uploader.js
│  │  ├─ sanitizeHtmlContent.js
│  │  ├─ sanitizer.js
│  │  ├─ sendMail.js
│  │  ├─ slugify.js
│  │  └─ tokenHelper.js
│  └─ validators
│     ├─ adminAccountValidator.js      <-- NEW FILE
│     ├─ authValidator.js
│     ├─ faqValidator.js
│     ├─ platformInfoValidator.js
│     ├─ ratingValidator.js
│     ├─ termsValidator.js
│     └─ tutorValidator.js
=======
│  ├─ config
│  │  ├─ database
│  │  │  ├─ connection.js
│  │  │  └─ passport.js
│  │  ├─ multerConfig.js
│  │  └─ swaggerConfig.js
│  ├─ controllers
│  │  ├─ aboutSectionController.js
│  │  ├─ adminFinancialAidController.js
│  │  ├─ Auth2FAController.js
│  │  ├─ authController.js
│  │  ├─ badgeController.js
│  │  ├─ careerController.js
│  │  ├─ certificateController.js
│  │  ├─ certificates.js
│  │  ├─ contactMessageController.js
│  │  ├─ courseController.js
│  │  ├─ courseRatingController.js
│  │  ├─ courseReportController.js
│  │  ├─ faqController.js
│  │  ├─ financialAidController.js
│  │  ├─ guestCartController.js
│  │  ├─ leaderboardController.js
│  │  ├─ loginLogController.js
│  │  ├─ nftController.js
│  │  ├─ notificationController.js
│  │  ├─ organizationController.js
│  │  ├─ organizationMemberController.js
│  │  ├─ platformInfoController.js
│  │  ├─ pointsController.js
│  │  ├─ privacyPolicyController.js
│  │  ├─ removalRequestController.js
│  │  ├─ reportAbuseController.js
│  │  ├─ reportController.js
│  │  ├─ sessionController.js
│  │  ├─ ShareAnalytics.js
│  │  ├─ studyGroupController.js
│  │  ├─ subscriptionPlanController.js
│  │  ├─ termsController.js
│  │  ├─ tutorController.js
│  │  ├─ tutorReportController.js
│  │  ├─ userOrganizationController.js
│  │  └─ verificationController.js
│  ├─ docs
│  │  └─ tutorAuth.md
│  ├─ emailUtils.js
│  ├─ index.js
│  ├─ middlewares
│  │  ├─ admin.js
│  │  ├─ adminAuthorization.js
│  │  ├─ auth.js
│  │  ├─ authMiddleware.js
│  │  ├─ errorHandler.js
│  │  ├─ fileUpload.js
│  │  ├─ roleMiddleware.js
│  │  ├─ tutorAuth.js
│  │  ├─ validatePrivacyPolicy.js
│  │  └─ validateSection.js
│  ├─ models
│  │  ├─ AboutSection.js
│  │  ├─ badge.js
│  │  ├─ careers.js
│  │  ├─ certificate.js
│  │  ├─ ContactMessage.js
│  │  ├─ course.js
│  │  ├─ courseRating.js
│  │  ├─ courseReport.js
│  │  ├─ faq.js
│  │  ├─ financialAid.js
│  │  ├─ guestCart.js
│  │  ├─ loginsLog.js
│  │  ├─ material.js
│  │  ├─ NftAchievement.js
│  │  ├─ organization.js
│  │  ├─ OrganizationMember.js
│  │  ├─ PlatformInfo.js
│  │  ├─ privacyPolicy.js
│  │  ├─ reportAbuse.js
│  │  ├─ requestRemoval.js
│  │  ├─ sessionModel.js
│  │  ├─ student.js
│  │  ├─ studentBadge.js
│  │  ├─ studentPoints.js
│  │  ├─ studyGroup.js
│  │  ├─ studyGroupDiscussion.js
│  │  ├─ studyGroupFile.js
│  │  ├─ studyGroupMember.js
│  │  ├─ SubscriptionPlan.js
│  │  ├─ Terms.js
│  │  ├─ Thread.ts
│  │  ├─ tutors.js
│  │  └─ User.js
│  ├─ README.md
│  ├─ routes
│  │  ├─ 2factorRoute.js
│  │  ├─ aboutSectionRoutes.js
│  │  ├─ accountRemovalRoute.js
│  │  ├─ admin.js
│  │  ├─ adminFinancialAidRoutes.js
│  │  ├─ authRoute.js
│  │  ├─ careerRoutes.js
│  │  ├─ certificateRoutes.js
│  │  ├─ certificates.js
│  │  ├─ contactMessageRoute.js
│  │  ├─ courseRatingRoutes.js
│  │  ├─ courseReportRoutes.js
│  │  ├─ courseRoute.js
│  │  ├─ faqRoute.js
│  │  ├─ financialAidRoute.js
│  │  ├─ guestCartRoute.js
│  │  ├─ index.js
│  │  ├─ leaderboardRoutes.js
│  │  ├─ loginLogRoute.js
│  │  ├─ nftRoute.js
│  │  ├─ notificationRoutes.js
│  │  ├─ organization.js
│  │  ├─ organizationMemberRoutes.js
│  │  ├─ platformInfo.js
│  │  ├─ pointsRoutes.js
│  │  ├─ privacyPolicyRoutes.js
│  │  ├─ reportAbuseRoute.js
│  │  ├─ reportRoutes.js
│  │  ├─ sessionRoute.js
│  │  ├─ studentReports.js
│  │  ├─ studyGroupRoutes.js
│  │  ├─ subscriptionPlanRoutes.js
│  │  ├─ termsRoute.js
│  │  ├─ tutorReportRoutes.js
│  │  └─ tutorRoutes.js
│  ├─ seeds
│  │  └─ badgeSeeder.js
│  ├─ services
│  │  ├─ careerService.js
│  │  ├─ emailService.js
│  │  ├─ reportScheduler.js
│  │  └─ sectionService.js
│  ├─ src
│  │  └─ templates
│  │     └─ certificateTemplate.html
│  ├─ tests
│  │  ├─ controllers
│  │  │  └─ certificateController.test.js
│  │  ├─ courseReport.test.js
│  │  ├─ forum.test.ts
│  │  ├─ integration
│  │  │  ├─ aboutSectionRoutes.test.js
│  │  │  ├─ certificateRoutes.test.js
│  │  │  ├─ gamification.test.js
│  │  │  ├─ guestCart.test.js
│  │  │  ├─ leaderboard.test.js
│  │  │  ├─ sessionTest.js
│  │  │  ├─ studentReports.test.js
│  │  │  └─ tutorAuth.test.js
│  │  ├─ organizationEmailService.test.js
│  │  ├─ organizationMember.test.js
│  │  ├─ organizationMemberController.test.js
│  │  └─ unit
│  │     ├─ aboutSection.test.js
│  │     ├─ certificate.test.js
│  │     ├─ contactUsMessage.test.js
│  │     ├─ financialAid.test.js
│  │     ├─ gamification.test.js
│  │     ├─ organizationMember.test.js
│  │     └─ report.test.js
│  ├─ uploads
│  │  └─ profile-images
│  │     └─ profile-6800bf229c392aaf3d90976c-1744885624965-165966296.png
│  ├─ utils
│  │  ├─ auditLogger.js
│  │  ├─ certificateGenerator.js
│  │  ├─ cloudStorage.js
│  │  ├─ email.js
│  │  ├─ fieldValidation.js
│  │  ├─ fileStorage.js
│  │  ├─ gamificationService.js
│  │  ├─ hashGenerator.js
│  │  ├─ hashing.js
│  │  ├─ logger.js
│  │  ├─ nftService.js
│  │  ├─ notifications.js
│  │  ├─ notificationService.js
│  │  ├─ organizationEmailService.js
│  │  ├─ pdfGenerator.js
│  │  ├─ rateLimit.js
│  │  ├─ s3Uploader.js
│  │  ├─ sanitizeHtmlContent.js
│  │  ├─ sanitizer.js
│  │  ├─ sendMail.js
│  │  ├─ slugify.js
│  │  └─ tokenHelper.js
│  └─ validators
│     ├─ authValidator.js
│     ├─ faqValidator.js
│     ├─ platformInfoValidator.js
│     ├─ ratingValidator.js
│     ├─ termsValidator.js
│     └─ tutorValidator.js
└─ tsconfig.json

```
