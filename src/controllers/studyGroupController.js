const StudyGroup = require('../models/studyGroup');
const StudyGroupMember = require('../models/studyGroupMember');
const StudyGroupDiscussion = require('../models/studyGroupDiscussion');
const StudyGroupFile = require('../models/studyGroupFile');
const Course = require('../models/course');
const { sendNotification } = require('../utils/notifications');
const { uploadFile } = require('../utils/fileStorage');
const { rateLimit } = require('../utils/rateLimit');
const mongoose = require('mongoose');

/**
 * Create a new study group
 * @route POST /api/study-groups/create
 */
exports.createStudyGroup = async (req, res) => {
	try {
		const { courseId, groupName, description, privacy } = req.body;
		const userId = req.user._id;

		// Validate required fields
		if (!courseId || !groupName || !description || !privacy) {
			return res.status(400).json({ error: 'Missing required fields' });
		}

		// Validate that privacy is either "Public" or "Private"
		if (privacy !== 'Public' && privacy !== 'Private') {
			return res
				.status(400)
				.json({ error: "Privacy must be either 'Public' or 'Private'" });
		}

		// Verify user is enrolled in the course
		const enrollment = await Course.findOne({
			_id: courseId,
			'enrollments.userId': userId,
			'enrollments.status': 'ACTIVE',
		});

		if (!enrollment) {
			return res
				.status(403)
				.json({
					error: 'You must be enrolled in this course to create a study group',
				});
		}

		// Create the study group with a transaction
		const session = await mongoose.startSession();
		session.startTransaction();

		try {
			// Create the study group
			const studyGroup = new StudyGroup({
				name: groupName,
				description,
				privacy,
				courseId,
				createdBy: userId,
			});

			await studyGroup.save({ session });

			// Add creator as an admin member
			const membership = new StudyGroupMember({
				userId,
				studyGroupId: studyGroup._id,
				role: 'ADMIN',
				status: 'ACTIVE',
			});

			await membership.save({ session });

			await session.commitTransaction();
			session.endSession();

			// Populate the study group with course details
			const populatedGroup = await StudyGroup.findById(studyGroup._id)
				.populate('courseId', 'title')
				.populate('createdBy', 'name email');

			return res.status(201).json({
				message: 'Study group created successfully',
				studyGroup: populatedGroup,
			});
		} catch (error) {
			await session.abortTransaction();
			session.endSession();
			throw error;
		}
	} catch (error) {
		console.error('Error creating study group:', error);
		return res.status(500).json({ error: 'Failed to create study group' });
	}
};

/**
 * Join a study group
 * @route POST /api/study-groups/join
 */
exports.joinStudyGroup = async (req, res) => {
	try {
		const { groupId } = req.body;
		const userId = req.user._id;

		if (!groupId) {
			return res.status(400).json({ error: 'Group ID is required' });
		}

		// Get the study group
		const studyGroup = await StudyGroup.findById(groupId);

		if (!studyGroup) {
			return res.status(404).json({ error: 'Study group not found' });
		}

		// Verify user is enrolled in the course
		const enrollment = await Course.findOne({
			_id: studyGroup.courseId,
			'enrollments.userId': userId,
			'enrollments.status': 'ACTIVE',
		});

		if (!enrollment) {
			return res
				.status(403)
				.json({
					error: 'You must be enrolled in this course to join this study group',
				});
		}

		// Check if user is already a member
		const existingMembership = await StudyGroupMember.findOne({
			userId,
			studyGroupId: groupId,
		});

		if (existingMembership) {
			return res
				.status(400)
				.json({ error: 'You are already a member of this study group' });
		}

		// Handle joining based on privacy setting
		if (studyGroup.privacy === 'Public') {
			// For public groups, add the user directly
			const membership = new StudyGroupMember({
				userId,
				studyGroupId: groupId,
				role: 'MEMBER',
				status: 'ACTIVE',
			});

			await membership.save();

			// Get all group members for notification
			const groupMembers = await StudyGroupMember.find({
				studyGroupId: groupId,
				status: 'ACTIVE',
				userId: { $ne: userId },
			});

			// Send notification to all group members
			const recipients = groupMembers.map((member) => member.userId);
			if (recipients.length > 0) {
				await sendNotification({
					recipients,
					title: 'New Member Joined',
					message: `A new member has joined the study group: ${studyGroup.name}`,
					type: 'GROUP_MEMBER_ADDED',
					resourceId: groupId,
				});
			}

			return res.status(200).json({
				message: 'Successfully joined the study group',
				membership,
			});
		} else {
			// For private groups, create a pending request
			const membershipRequest = new StudyGroupMember({
				userId,
				studyGroupId: groupId,
				role: 'MEMBER',
				status: 'PENDING',
			});

			await membershipRequest.save();

			// Notify group admins about the request
			const groupAdmins = await StudyGroupMember.find({
				studyGroupId: groupId,
				role: 'ADMIN',
			});

			const adminIds = groupAdmins.map((admin) => admin.userId);
			if (adminIds.length > 0) {
				await sendNotification({
					recipients: adminIds,
					title: 'New Join Request',
					message: `A user has requested to join your study group: ${studyGroup.name}`,
					type: 'GROUP_JOIN_REQUEST',
					resourceId: groupId,
				});
			}

			return res.status(200).json({
				message: 'Join request submitted. Waiting for approval.',
				membershipRequest,
			});
		}
	} catch (error) {
		console.error('Error joining study group:', error);
		return res.status(500).json({ error: 'Failed to join study group' });
	}
};

/**
 * Get all study groups
 * @route GET /api/study-groups/all
 */
exports.getAllStudyGroups = async (req, res) => {
	try {
		const userId = req.user._id;
		const { courseId } = req.query;

		// Build the query
		const query = {};

		if (courseId) {
			query.courseId = courseId;

			// Verify user is enrolled in the course if courseId is provided
			const enrollment = await Course.findOne({
				_id: courseId,
				'enrollments.userId': userId,
				'enrollments.status': 'ACTIVE',
			});

			if (!enrollment) {
				return res
					.status(403)
					.json({
						error:
							'You must be enrolled in this course to view its study groups',
					});
			}
		} else {
			// If no courseId is provided, only show groups from courses the user is enrolled in
			const enrolledCourses = await Course.find({
				'enrollments.userId': userId,
				'enrollments.status': 'ACTIVE',
			});

			query.courseId = { $in: enrolledCourses.map((course) => course._id) };
		}

		// Get study groups
		const studyGroups = await StudyGroup.find(query)
			.populate('courseId', 'title')
			.sort({ createdAt: -1 });

		// Get counts for each study group
		const studyGroupsWithCounts = await Promise.all(
			studyGroups.map(async (group) => {
				const membersCount = await StudyGroupMember.countDocuments({
					studyGroupId: group._id,
					status: 'ACTIVE',
				});

				const discussionsCount = await StudyGroupDiscussion.countDocuments({
					studyGroupId: group._id,
				});

				const filesCount = await StudyGroupFile.countDocuments({
					studyGroupId: group._id,
				});

				return {
					...group.toObject(),
					_count: {
						members: membersCount,
						discussions: discussionsCount,
						files: filesCount,
					},
				};
			})
		);

		return res.status(200).json({ studyGroups: studyGroupsWithCounts });
	} catch (error) {
		console.error('Error retrieving study groups:', error);
		return res.status(500).json({ error: 'Failed to retrieve study groups' });
	}
};

/**
 * Get a single study group
 * @route GET /api/study-groups/:groupId
 */
exports.getStudyGroup = async (req, res) => {
	try {
		const userId = req.user._id;
		const { groupId } = req.params;

		// Get the study group with related data
		const studyGroup = await StudyGroup.findById(groupId)
			.populate('courseId', 'title')
			.populate('createdBy', 'name email');

		if (!studyGroup) {
			return res.status(404).json({ error: 'Study group not found' });
		}

		// Verify user is enrolled in the course
		const enrollment = await Course.findOne({
			_id: studyGroup.courseId,
			'enrollments.userId': userId,
			'enrollments.status': 'ACTIVE',
		});

		if (!enrollment) {
			return res
				.status(403)
				.json({
					error: 'You must be enrolled in this course to view this study group',
				});
		}

		// Get members
		const members = await StudyGroupMember.find({
			studyGroupId: groupId,
		}).populate('userId', 'name email image');

		// Check if user is a member of the group
		const isMember = members.some(
			(member) =>
				member.userId._id.toString() === userId && member.status === 'ACTIVE'
		);

		// For private groups, only members can see details
		if (studyGroup.privacy === 'Private' && !isMember) {
			return res.status(403).json({
				error:
					'This is a private study group. You must be a member to view details.',
			});
		}

		// Get discussions (limited to most recent)
		const discussions = await StudyGroupDiscussion.find({
			studyGroupId: groupId,
		})
			.populate('userId', 'name email image')
			.sort({ createdAt: -1 })
			.limit(20);

		// Get files
		const files = await StudyGroupFile.find({ studyGroupId: groupId })
			.populate('userId', 'name email image')
			.sort({ createdAt: -1 });

		// Combine all data
		const fullStudyGroup = {
			...studyGroup.toObject(),
			members,
			discussions,
			files,
		};

		return res.status(200).json({ studyGroup: fullStudyGroup });
	} catch (error) {
		console.error('Error retrieving study group:', error);
		return res.status(500).json({ error: 'Failed to retrieve study group' });
	}
};

/**
 * Create a discussion post
 * @route POST /api/study-groups/:groupId/discussions
 */
exports.createDiscussion = async (req, res) => {
	try {
		const userId = req.user._id;
		const { groupId } = req.params;
		const { message } = req.body;

		// Apply rate limiting (5 messages per minute)
		const identifier = `discussion_${userId}`;
		const { success } = await rateLimit(identifier, 5, 60);

		if (!success) {
			return res
				.status(429)
				.json({ error: 'Rate limit exceeded. Please try again later.' });
		}

		// Validate required fields
		if (!message || message.trim() === '') {
			return res.status(400).json({ error: 'Message content is required' });
		}

		// Get the study group
		const studyGroup = await StudyGroup.findById(groupId);

		if (!studyGroup) {
			return res.status(404).json({ error: 'Study group not found' });
		}

		// Check if user is a member of the group
		const membership = await StudyGroupMember.findOne({
			userId,
			studyGroupId: groupId,
			status: 'ACTIVE',
		});

		if (!membership) {
			return res
				.status(403)
				.json({
					error: 'You must be a member of this study group to post messages',
				});
		}

		// Create the discussion post
		const discussion = new StudyGroupDiscussion({
			message,
			userId,
			studyGroupId: groupId,
		});

		await discussion.save();

		// Populate user data
		const populatedDiscussion = await StudyGroupDiscussion.findById(
			discussion._id
		).populate('userId', 'name email image');

		// Send notification to all group members except the poster
		const groupMembers = await StudyGroupMember.find({
			studyGroupId: groupId,
			userId: { $ne: userId },
			status: 'ACTIVE',
		});

		const recipients = groupMembers.map((member) => member.userId);
		if (recipients.length > 0) {
			await sendNotification({
				recipients,
				title: 'New Discussion Post',
				message: `New message in ${studyGroup.name}: ${message.substring(
					0,
					50
				)}${message.length > 50 ? '...' : ''}`,
				type: 'GROUP_DISCUSSION',
				resourceId: groupId,
			});
		}

		return res.status(201).json({
			message: 'Discussion post created successfully',
			discussion: populatedDiscussion,
		});
	} catch (error) {
		console.error('Error creating discussion post:', error);
		return res.status(500).json({ error: 'Failed to create discussion post' });
	}
};

/**
 * Get discussions for a study group
 * @route GET /api/study-groups/:groupId/discussions
 */
exports.getDiscussions = async (req, res) => {
	try {
		const userId = req.user._id;
		const { groupId } = req.params;

		// Get query parameters for pagination
		const page = Number.parseInt(req.query.page) || 1;
		const limit = Number.parseInt(req.query.limit) || 20;
		const skip = (page - 1) * limit;

		// Get the study group
		const studyGroup = await StudyGroup.findById(groupId);

		if (!studyGroup) {
			return res.status(404).json({ error: 'Study group not found' });
		}

		// For private groups, verify membership
		if (studyGroup.privacy === 'Private') {
			const membership = await StudyGroupMember.findOne({
				userId,
				studyGroupId: groupId,
				status: 'ACTIVE',
			});

			if (!membership) {
				return res.status(403).json({
					error:
						'You must be a member of this private study group to view discussions',
				});
			}
		}

		// Get discussions with pagination
		const discussions = await StudyGroupDiscussion.find({
			studyGroupId: groupId,
		})
			.populate('userId', 'name email image')
			.sort({ createdAt: -1 })
			.skip(skip)
			.limit(limit);

		// Get total count for pagination
		const totalCount = await StudyGroupDiscussion.countDocuments({
			studyGroupId: groupId,
		});

		return res.status(200).json({
			discussions,
			pagination: {
				page,
				limit,
				totalCount,
				totalPages: Math.ceil(totalCount / limit),
			},
		});
	} catch (error) {
		console.error('Error retrieving discussions:', error);
		return res.status(500).json({ error: 'Failed to retrieve discussions' });
	}
};

/**
 * Upload a file to a study group
 * @route POST /api/study-groups/:groupId/files
 */
exports.uploadFile = async (req, res) => {
	try {
		const userId = req.user._id;
		const { groupId } = req.params;

		// Get the study group
		const studyGroup = await StudyGroup.findById(groupId);

		if (!studyGroup) {
			return res.status(404).json({ error: 'Study group not found' });
		}

		// Check if user is a member of the group
		const membership = await StudyGroupMember.findOne({
			userId,
			studyGroupId: groupId,
			status: 'ACTIVE',
		});

		if (!membership) {
			return res
				.status(403)
				.json({
					error: 'You must be a member of this study group to upload files',
				});
		}

		// Check if file was uploaded
		if (!req.file) {
			return res.status(400).json({ error: 'No file provided' });
		}

		const file = req.file;

		// Validate file size (10MB limit)
		const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
		if (file.size > MAX_FILE_SIZE) {
			return res
				.status(400)
				.json({ error: 'File size exceeds the 10MB limit' });
		}

		// Validate file type
		const allowedTypes = [
			'application/pdf',
			'application/msword',
			'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
			'application/vnd.ms-excel',
			'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'application/vnd.ms-powerpoint',
			'application/vnd.openxmlformats-officedocument.presentationml.presentation',
			'text/plain',
			'image/jpeg',
			'image/png',
			'image/gif',
		];

		if (!allowedTypes.includes(file.mimetype)) {
			return res.status(400).json({ error: 'File type not allowed' });
		}

		// Upload the file to storage
		const { url, key } = await uploadFile(file, `study-groups/${groupId}`);

		// Create file record in the database
		const fileRecord = new StudyGroupFile({
			name: file.originalname,
			size: file.size,
			type: file.mimetype,
			url,
			key,
			userId,
			studyGroupId: groupId,
		});

		await fileRecord.save();

		// Populate user data
		const populatedFile = await StudyGroupFile.findById(
			fileRecord._id
		).populate('userId', 'name email image');

		// Send notification to all group members except the uploader
		const groupMembers = await StudyGroupMember.find({
			studyGroupId: groupId,
			userId: { $ne: userId },
			status: 'ACTIVE',
		});

		const recipients = groupMembers.map((member) => member.userId);
		if (recipients.length > 0) {
			const userName = req.user.name || 'A user';
			await sendNotification({
				recipients,
				title: 'New File Uploaded',
				message: `${userName} uploaded a file to ${studyGroup.name}: ${file.originalname}`,
				type: 'GROUP_FILE_UPLOAD',
				resourceId: groupId,
			});
		}

		return res.status(201).json({
			message: 'File uploaded successfully',
			file: populatedFile,
		});
	} catch (error) {
		console.error('Error uploading file:', error);
		return res.status(500).json({ error: 'Failed to upload file' });
	}
};

/**
 * Get files for a study group
 * @route GET /api/study-groups/:groupId/files
 */
exports.getFiles = async (req, res) => {
	try {
		const userId = req.user._id;
		const { groupId } = req.params;

		// Get the study group
		const studyGroup = await StudyGroup.findById(groupId);

		if (!studyGroup) {
			return res.status(404).json({ error: 'Study group not found' });
		}

		// For private groups, verify membership
		if (studyGroup.privacy === 'Private') {
			const membership = await StudyGroupMember.findOne({
				userId,
				studyGroupId: groupId,
				status: 'ACTIVE',
			});

			if (!membership) {
				return res.status(403).json({
					error:
						'You must be a member of this private study group to view files',
				});
			}
		}

		// Get files
		const files = await StudyGroupFile.find({ studyGroupId: groupId })
			.populate('userId', 'name email image')
			.sort({ createdAt: -1 });

		return res.status(200).json({ files });
	} catch (error) {
		console.error('Error retrieving files:', error);
		return res.status(500).json({ error: 'Failed to retrieve files' });
	}
};

/**
 * Approve or reject a membership request
 * @route PATCH /api/study-groups/:groupId/members/:memberId
 */
exports.updateMembershipStatus = async (req, res) => {
	try {
		const userId = req.user._id;
		const { groupId, memberId } = req.params;
		const { status } = req.body;

		if (!status || (status !== 'ACTIVE' && status !== 'REJECTED')) {
			return res
				.status(400)
				.json({ error: "Status must be either 'ACTIVE' or 'REJECTED'" });
		}

		// Check if the user is an admin of the group
		const adminMembership = await StudyGroupMember.findOne({
			userId,
			studyGroupId: groupId,
			role: 'ADMIN',
			status: 'ACTIVE',
		});

		if (!adminMembership) {
			return res
				.status(403)
				.json({
					error: 'Only group admins can approve or reject membership requests',
				});
		}

		// Get the membership request
		const membershipRequest = await StudyGroupMember.findById(
			memberId
		).populate('userId', 'name email');

		if (!membershipRequest) {
			return res.status(404).json({ error: 'Membership request not found' });
		}

		if (membershipRequest.studyGroupId.toString() !== groupId) {
			return res
				.status(400)
				.json({ error: 'Membership request does not belong to this group' });
		}

		if (membershipRequest.status !== 'PENDING') {
			return res
				.status(400)
				.json({ error: 'This membership request has already been processed' });
		}

		// Update the membership status
		membershipRequest.status = status;
		await membershipRequest.save();

		// Get the study group for notification
		const studyGroup = await StudyGroup.findById(groupId);

		// Send notification to the user
		await sendNotification({
			recipients: [membershipRequest.userId._id],
			title:
				status === 'ACTIVE'
					? 'Membership Request Approved'
					: 'Membership Request Rejected',
			message:
				status === 'ACTIVE'
					? `Your request to join ${studyGroup.name} has been approved.`
					: `Your request to join ${studyGroup.name} has been rejected.`,
			type: 'GROUP_MEMBERSHIP_UPDATE',
			resourceId: groupId,
		});

		// If approved, send notification to all group members
		if (status === 'ACTIVE') {
			const groupMembers = await StudyGroupMember.find({
				studyGroupId: groupId,
				userId: { $ne: membershipRequest.userId._id },
				status: 'ACTIVE',
			});

			const recipients = groupMembers.map((member) => member.userId);
			if (recipients.length > 0) {
				await sendNotification({
					recipients,
					title: 'New Member Joined',
					message: `${membershipRequest.userId.name} has joined the study group: ${studyGroup.name}`,
					type: 'GROUP_MEMBER_ADDED',
					resourceId: groupId,
				});
			}
		}

		return res.status(200).json({
			message:
				status === 'ACTIVE'
					? 'Membership request approved successfully'
					: 'Membership request rejected successfully',
			membership: membershipRequest,
		});
	} catch (error) {
		console.error('Error updating membership status:', error);
		return res
			.status(500)
			.json({ error: 'Failed to update membership status' });
	}
};
