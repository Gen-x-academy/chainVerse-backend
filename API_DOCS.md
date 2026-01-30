# API Documentation

## Table of Contents

- [Authentication](#authentication)
- [Admin Account](#admin-account)
- [Courses](#courses)
- [Quizzes](#quizzes)
- [Course Moderators](#course-moderators)
- [Students](#students)
- [Student Account Settings](#student-account-settings)
- [Student Courses](#student-courses)
- [Certificate Name Change Requests](#certificate-name-change-requests)
- [Tutor Authentication](./src/docs/tutorAuth.md)
- [Tutor Performance Reports](#tutor-performance-reports)
- [Gamification System](#gamification-system)
- [Challenge Leaderboards](#challenge-leaderboards)
- [Tutor Account Management](#tutor-account-management)
- [Library (E-Library Books)](#library-e-library-books)

## Student Courses

Student course endpoints handle course enrollment, learning management, and crypto-based purchases/transfers.

### Get Student Learning Courses
`GET /api/student/learning`

Fetch all courses the authenticated student is enrolled in.

**Headers:**
- `Authorization: Bearer <token>` (required)

**Query Parameters:**
- `page` (optional): Page number for pagination (default: 1)
- `limit` (optional): Number of items per page (default: 10, max: 100)

**Response:**
```json
{
  "success": true,
  "message": "Student learning courses retrieved successfully",
  "data": {
    "courses": [
      {
        "_id": "course_id",
        "title": "Web3 Fundamentals",
        "description": "Learn the basics of Web3 development",
        "tutor": {
          "name": "John Doe",
          "email": "tutor@example.com"
        },
        "category": "Blockchain",
        "level": "Beginner",
        "price": 100
      }
    ],
    "totalCourses": 1
  }
}
```

---

### Get Student Learning Course by ID
`GET /api/student/learning/:id`

Fetch details for a specific enrolled course.

**Headers:**
- `Authorization: Bearer <token>` (required)

**URL Parameters:**
- `id`: The course ID (MongoDB ObjectId)

**Response:**
```json
{
  "success": true,
  "message": "Course details retrieved successfully",
  "data": {
    "_id": "course_id",
    "title": "Web3 Fundamentals",
    "description": "Learn the basics of Web3 development",
    "tutor": {
      "name": "John Doe",
      "email": "tutor@example.com"
    },
    "videos": [...],
    "enrollments": [...]
  }
}
```

**Error Responses:**
- `403 Forbidden`: Course not enrolled by student
- `404 Not Found`: Course not found

---

### Get All Available Courses
`GET /api/student/all/course`

Fetch all published courses available for enrollment.

**Headers:**
- `Authorization: Bearer <token>` (required)

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 10)
- `category` (optional): Filter by category
- `level` (optional): Filter by level (Beginner, Intermediate, Advanced)

**Response:**
```json
{
  "success": true,
  "message": "All available courses retrieved successfully",
  "data": {
    "courses": [...],
    "currentPage": 1,
    "totalPages": 5,
    "totalCourses": 50
  }
}
```

---

### Search Courses
`GET /api/student/search`

Search for courses by title, description, or tags.

**Headers:**
- `Authorization: Bearer <token>` (required)

**Query Parameters:**
- `searchTerm` (required): Search query (2-100 characters)
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 10)

**Response:**
```json
{
  "success": true,
  "message": "Courses search results retrieved successfully",
  "data": {
    "courses": [...],
    "currentPage": 1,
    "totalPages": 2,
    "totalCourses": 15,
    "searchTerm": "blockchain"
  }
}
```

**Error Responses:**
- `400 Bad Request`: Search term is required or invalid

---

### Purchase Course (Crypto Payment)
`POST /api/courses/:id/purchase`

Purchase a course using cryptocurrency payment.

**Headers:**
- `Authorization: Bearer <token>` (required)

**URL Parameters:**
- `id`: The course ID to purchase

**Request Body:**
```json
{
  "transactionHash": "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
  "cryptoCurrency": "ETH",
  "amount": 0.05
}
```

**Supported Cryptocurrencies:** ETH, BTC, MATIC, BNB, SOL

**Response:**
```json
{
  "success": true,
  "message": "Course purchased successfully",
  "data": {
    "course": {
      "_id": "course_id",
      "title": "Web3 Fundamentals",
      ...
    },
    "payment": {
      "success": true,
      "transactionId": "0x...",
      "verified": true,
      "amount": 0.05,
      "currency": "ETH",
      "timestamp": "2026-01-25T10:30:00Z",
      "message": "Payment verified and confirmed on blockchain"
    },
    "message": "Payment processed successfully and course enrolled"
  }
}
```

**Error Responses:**
- `400 Bad Request`: Invalid input, course already purchased, or course not available
- `404 Not Found`: Course not found

---

### Transfer Course Ownership
`POST /api/courses/:id/transfer`

Transfer course ownership to another user via smart contract.

**Headers:**
- `Authorization: Bearer <token>` (required)

**URL Parameters:**
- `id`: The course ID to transfer

**Request Body:**
```json
{
  "recipientEmail": "recipient@example.com",
  "transactionHash": "0x..." // Optional
}
```

**Response:**
```json
{
  "success": true,
  "message": "Course ownership transferred successfully",
  "data": {
    "courseId": "course_id",
    "from": "sender@example.com",
    "to": "recipient@example.com",
    "message": "Course transfer completed successfully"
  }
}
```

**Error Responses:**
- `400 Bad Request`: Missing or invalid recipient email
- `403 Forbidden`: You do not own this course
- `404 Not Found`: Course or recipient not found

---

## Course Moderators

Course Moderators are responsible for monitoring course activity, assisting students, and reporting issues to maintain course quality.

### Assign Course Moderator
`POST /course/moderator/assign`

Assign a moderator to monitor and support a specific course. **Admin access only.**

**Headers:**
- `Authorization: Bearer <token>` (required)

**Request Body:**
```json
{
  "courseId": "course_id",
  "moderatorId": "moderator_user_id"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Moderator assigned successfully",
  "data": {
    "courseId": "course_id",
    "moderatorId": "moderator_user_id",
    "assignedBy": "admin_user_id",
    "assignedAt": "2024-01-15T10:30:00Z",
    "isActive": true
  }
}
```

### Get Assigned Courses
`GET /course/moderator/courses`

Retrieve all courses assigned to a specific moderator.

**Headers:**
- `Authorization: Bearer <token>` (required)

**Query Parameters:**
- `moderatorId`: The ID of the moderator (required)

**Response:**
```json
{
  "success": true,
  "message": "Assigned courses retrieved successfully",
  "data": {
    "courses": [
      {
        "title": "Course Title",
        "description": "Course Description",
        "category": "Category",
        "level": "Beginner"
      }
    ],
    "total": 1
  }
}
```

### Monitor Course Activity
`GET /course/moderator/activity`

Retrieve activity data for a specific course, including enrollment and progress metrics.

**Headers:**
- `Authorization: Bearer <token>` (required)

**Query Parameters:**
- `courseId`: The ID of the course (required)

**Response:**
```json
{
  "success": true,
  "message": "Course activity retrieved successfully",
  "data": {
    "courseTitle": "Course Title",
    "totalEnrollments": 50,
    "activeStudents": 30,
    "completedStudents": 15,
    "averageProgress": 65.5,
    "averageRating": 4.2,
    "totalRatings": 25
  }
}
```

### Report Course Issue
`POST /course/moderator/report-issue`

Report an issue with a course for review and escalation.

**Headers:**
- `Authorization: Bearer <token>` (required)

**Request Body:**
```json
{
  "courseId": "course_id",
  "issueType": "Content Issue",
  "description": "Detailed description of the issue"
}
```

**Issue Types:** Content Issue, Technical Issue, Student Concern, Other

**Response:**
```json
{
  "success": true,
  "message": "Issue reported successfully",
  "data": {
    "courseId": "course_id",
    "reportedBy": "moderator_user_id",
    "issueType": "Content Issue",
    "description": "Detailed description",
    "status": "pending",
    "createdAt": "2024-01-15T10:30:00Z"
  }
}
```

### Get Course Reports
`GET /course/moderator/reports`

Retrieve all moderator-submitted reports, optionally filtered by course.

**Headers:**
- `Authorization: Bearer <token>` (required)

**Query Parameters:**
- `courseId`: Filter reports by course (optional)
- `page`: Page number (default: 1)
- `limit`: Number of reports per page (default: 10)

**Response:**
```json
{
  "success": true,
  "message": "Reports retrieved successfully",
  "data": {
    "reports": [
      {
        "courseId": {
          "title": "Course Title"
        },
        "reportedBy": {
          "name": "Moderator Name",
          "email": "moderator@example.com"
        },
        "issueType": "Technical Issue",
        "description": "Issue description",
        "status": "pending",
        "createdAt": "2024-01-15T10:30:00Z"
      }
    ],
    "currentPage": 1,
    "totalPages": 1,
    "totalReports": 1
  }
}
```

### Respond to Student Concern
`POST /course/moderator/respond`

Send a response to a student's concern regarding a course.

**Headers:**
- `Authorization: Bearer <token>` (required)

**Request Body:**
```json
{
  "courseId": "course_id",
  "studentId": "student_user_id",
  "message": "Response message to the student"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Response sent successfully"
}
```

## Student Account Settings

### Get Account Details

`GET /student/account`

Retrieve the logged-in student's account details. **Student access only.**

**Headers:**

- `Authorization: Bearer <token>` (required)

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "user_id",
    "fullName": "John Doe",
    "email": "john@example.com",
    "phoneNumber": "+1234567890",
    "profileImage": "/uploads/profile-images/profile-1234567890.jpg",
    "isEmailVerified": true,
    "createdAt": "2024-01-15T10:30:00Z",
    "updatedAt": "2024-01-15T10:30:00Z"
  }
}
```

### Update Profile

`PUT /student/account/update`

Update the student's profile information. **Student access only.**

**Headers:**

- `Authorization: Bearer <token>` (required)

**Request Body:**

```json
{
  "fullName": "John Updated",
  "email": "johnupdated@example.com",
  "phoneNumber": "+9876543210"
}
```

**Validation Rules:**

- `fullName`: 2-50 characters, letters, spaces, hyphens, and apostrophes only
- `email`: Valid email format (must be unique)
- `phoneNumber`: 10-20 characters, valid phone number format

**Response:**

```json
{
  "success": true,
  "message": "Profile updated successfully",
  "data": {
    "id": "user_id",
    "fullName": "John Updated",
    "email": "johnupdated@example.com",
    "phoneNumber": "+9876543210",
    "profileImage": "/uploads/profile-images/profile-1234567890.jpg",
    "isEmailVerified": false,
    "updatedAt": "2024-01-15T11:00:00Z"
  },
  "token": "new_jwt_token_if_email_updated"
}
```

**Note:** When email is updated, `isEmailVerified` is set to `false` and a verification email is sent.

### Change Password

`PUT /student/account/change-password`

Change the student's password. **Student access only.**

**Headers:**

- `Authorization: Bearer <token>` (required)

**Request Body:**

```json
{
  "currentPassword": "oldPassword123",
  "newPassword": "NewPassword123!"
}
```

**Validation Rules:**

- `currentPassword`: Required, minimum 6 characters
- `newPassword`: Required, minimum 8 characters, must contain:
  - At least one uppercase letter
  - At least one lowercase letter
  - At least one number
  - At least one special character (@$!%\*?&)

**Response:**

```json
{
  "success": true,
  "message": "Password changed successfully"
}
```

**Rate Limiting:** 3 attempts per 15 minutes per IP address.

### Upload Profile Image

`POST /student/account/upload-profile-image`

Upload or update the student's profile picture. **Student access only.**

**Headers:**

- `Authorization: Bearer <token>` (required)
- `Content-Type: multipart/form-data`

**Request Body:**

- `profileImage`: Image file (required)

**File Requirements:**

- **Format:** JPEG, JPG, PNG, GIF, WebP
- **Size:** Maximum 5MB
- **Type:** Image files only

**Response:**

```json
{
  "success": true,
  "message": "Profile image uploaded successfully",
  "data": {
    "profileImage": "/uploads/profile-images/profile-1234567890-1234567890.jpg"
  }
}
```

**Rate Limiting:** 5 uploads per 5 minutes per IP address.

## Error Responses

All endpoints return appropriate HTTP status codes and error messages:

```json
{
  "success": false,
  "message": "Error description",
  "errors": [
    {
      "field": "fieldName",
      "message": "Field validation error"
    }
  ]
}
```

**Common HTTP Status Codes:**

- `200` - Success
- `400` - Bad Request (validation errors)
- `401` - Unauthorized (no token or invalid token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found (user not found)
- `429` - Too Many Requests (rate limited)
- `500` - Internal Server Error

## Security Features

### Authentication

- All endpoints require JWT authentication
- Tokens are validated on each request
- User role verification for student-only access

### Rate Limiting

- Password changes: 3 attempts per 15 minutes
- Profile updates: 10 attempts per 10 minutes
- Profile image uploads: 5 attempts per 5 minutes

### Data Validation

- Input sanitization and validation on all endpoints
- Password strength requirements
- File type and size restrictions for uploads

### Email Verification

- Email updates require verification
- Verification emails sent automatically
- Account marked as unverified until email confirmed

## Certificate Name Change Requests

### Submit Name Change Request
`POST /certificates/name-change/request`

Submit a request to change the name on certificates. **Verified students only.**

**Headers:**
- `Authorization: Bearer <token>` (required)

**Request Body (multipart/form-data):**
```json
{
    "newFullName": "John Michael Doe",
    "reason": "Legal name change after marriage ceremony",
    "certificateId": "certificate_id_optional",
    "supportingDocument": "file (optional, PDF/JPG/PNG, max 5MB)"
}
```

**Response:**
```json
{
    "success": true,
    "message": "Name change request submitted successfully",
    "data": {
        "requestId": "request_id",
        "newFullName": "John Michael Doe",
        "status": "Pending",
        "requestedDate": "2024-01-15T10:30:00Z"
    }
}
```

**Error Responses:**
- `400 Bad Request`: Validation error (invalid name format, reason too short)
- `401 Unauthorized`: No authentication token provided
- `403 Forbidden`: Only verified student accounts can submit requests
- `429 Too Many Requests`: Rate limit exceeded
- `500 Internal Server Error`: Server error

### Get My Name Change Requests
`GET /certificates/name-change/my-requests`

Retrieve all name change requests submitted by the authenticated student. **Verified students only.**

**Headers:**
- `Authorization: Bearer <token>` (required)

**Query Parameters:**
- `status`: (optional) Filter by status - `Pending`, `Approved`, or `Rejected`

**Response:**
```json
{
    "success": true,
    "count": 2,
    "data": [
        {
            "_id": "request_id",
            "studentId": "user_id",
            "certificateId": "certificate_id",
            "newFullName": "John Michael Doe",
            "reason": "Legal name change after marriage",
            "supportingDocumentUrl": "https://...",
            "status": "Pending",
            "requestedDate": "2024-01-15T10:30:00Z",
            "createdAt": "2024-01-15T10:30:00Z",
            "updatedAt": "2024-01-15T10:30:00Z"
        }
    ]
}
```

**Error Responses:**
- `400 Bad Request`: Invalid status filter value
- `401 Unauthorized`: No authentication token provided
- `403 Forbidden`: Only verified student accounts can access this endpoint
- `500 Internal Server Error`: Server error

### Get Name Change Request by ID
`GET /certificates/name-change/request/:requestId`

Retrieve a specific name change request by its ID. **Verified students only.**

**Headers:**
- `Authorization: Bearer <token>` (required)

**Path Parameters:**
- `requestId`: The ID of the name change request

**Response:**
```json
{
    "success": true,
    "data": {
        "_id": "request_id",
        "studentId": "user_id",
        "certificateId": "certificate_id",
        "newFullName": "John Michael Doe",
        "reason": "Legal name change after marriage ceremony",
        "supportingDocumentUrl": "https://...",
        "status": "Pending",
        "requestedDate": "2024-01-15T10:30:00Z",
        "reviewedDate": null,
        "reviewedBy": null,
        "adminNotes": null,
        "createdAt": "2024-01-15T10:30:00Z",
        "updatedAt": "2024-01-15T10:30:00Z"
    }
}
```

**Error Responses:**
- `401 Unauthorized`: No authentication token provided
- `403 Forbidden`: Only verified student accounts can access this endpoint
- `404 Not Found`: Request not found or does not belong to the authenticated user
- `500 Internal Server Error`: Server error

**Validation Rules:**
- `newFullName`: 2-100 characters, letters, spaces, hyphens, and apostrophes only
- `reason`: 10-500 characters, required
- `supportingDocument`: Optional, PDF/JPG/JPEG/PNG only, max 5MB

**Rate Limiting:**
- Certificate name change request submissions are rate-limited to prevent abuse
- Default: 10 requests per hour per user (configurable)

## Tutor Course Management

### Create Course
`POST /api/courses`

Allows a tutor to create a new course. **Tutor access only.**

**Headers:**
- `Authorization: Bearer <token>` (required)

**Request Body:**
```json
{
  "title": "Advanced Web3 Security",
  "description": "Deep dive into smart contract vulnerabilities",
  "category": "Security",
  "level": "Advanced",
  "duration": "6 weeks",
  "prerequisites": ["Solidity Basics", "Smart Contract Fundamentals"],
  "resources": ["https://ethereum.org"],
  "tags": ["security", "audit"],
  "price": 0,
  "thumbnail": "https://..."
}
```

**Response:**
```json
{
  "success": true,
  "message": "Course created successfully",
  "data": {
    "_id": "course_id",
    "title": "Advanced Web3 Security",
    "tutor": "tutor_id",
    "status": "draft",
    "isPublished": false,
    ...
  }
}
```

### Update Course
`PUT /api/courses/:id`

Allows a tutor to update their own course. **Tutor access only.**

**Headers:**
- `Authorization: Bearer <token>` (required)

**Response:**
```json
{
  "success": true,
  "message": "Course updated successfully",
  "data": { ... }
}
```

### Delete Course
`DELETE /api/courses/:id`

Allows a tutor to delete their own course. **Tutor access only.**

**Note:** Cannot delete a course with active enrollments.

---

## Assignment Management

### Create Assignment
`POST /api/assignments`

Allows a tutor to create an assignment for their course. **Tutor access only.**

**Request Body:**
```json
{
  "title": "Security Audit Challenge",
  "description": "Audit the provided contract...",
  "dueDate": "2024-12-31T23:59:59Z",
  "courseId": "course_id",
  "maxScore": 100,
  "resources": ["https://..."]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Assignment created successfully",
  "data": { ... }
}
```

### Get Assignments
`GET /api/assignments/:courseId`

Retrieve assignments for a specific course.

**Response:**
```json
{
  "success": true,
  "count": 2,
  "data": [ ... ]
}
```

---

## Gamification System

### Add Points to Student

`POST /students/:id/points`

Award points to a student for completing educational activities. **Tutor access only.**

**Path Parameters:**

- `id`: Student ID

**Request Body:**
\`\`\`json
{
"activity": "course_completion",
"points": 100,
"description": "Completed JavaScript Basics",
"courseId": "course_id_here"
}
\`\`\`

**Response:**
```json
{
"status": "success",
"message": "Points added successfully",
"data": {
"totalPoints": 100,
"pointsAdded": 100,
"activity": "course_completion",
"description": "Completed JavaScript Basics"
}
}
```

### Get Student Points

`GET /students/:id/points`

Retrieve points and achievements for a specific student. Students can only view their own points, tutors can view any student's points.

**Path Parameters:**

- `id`: Student ID

**Response:**
```json
{
"status": "success",
"data": {
"studentId": "student_id",
"studentName": "John Doe",
"totalPoints": 350,
"rank": 5,
"pointsHistory": [
{
"activity": "course_completion",
"points": 100,
"description": "Completed JavaScript Basics",
"earnedAt": "2024-01-15T10:30:00Z"
}
],
"badges": [
{
"badgeId": "badge_id",
"name": "First Steps",
"description": "Complete your first course",
"icon": "trophy",
"rarity": "common",
"earnedAt": "2024-01-15T10:30:00Z"
}
],
"lastUpdated": "2024-01-15T10:30:00Z"
}
}
```

### Get Leaderboard

`GET /students/leaderboard`

Retrieve the student leaderboard ranked by total points.

**Query Parameters:**

- `limit`: (optional) Number of results per page (default: 50)
- `page`: (optional) Page number (default: 1)

**Response:**
```json
{
"status": "success",
"data": {
"leaderboard": [
{
"rank": 1,
"studentId": "student_id",
"studentName": "Jane Smith",
"studentEmail": "jane@example.com",
"profileImage": "profile_url",
"totalPoints": 2500,
"lastUpdated": "2024-01-15T10:30:00Z"
}
],
"pagination": {
"currentPage": 1,
"totalPages": 5,
"totalStudents": 250,
"hasNextPage": true,
"hasPrevPage": false
}
}
}
```

### Get Student Rank

`GET /students/:id/rank`

Get the current rank of a specific student.

**Path Parameters:**

- `id`: Student ID

**Response:**
```json
{
"status": "success",
"data": {
"studentId": "student_id",
"totalPoints": 1250,
"rank": 15
}
}
\`\`\`

## Quizzes

### Create Quiz

`POST /api/quizzes`

Create a new quiz for a specific course and module. **Tutor and Admin access only.**

**Headers:**

- `Authorization: Bearer <token>` (required)

**Request Body:**
\`\`\`json
{
"courseId": "course-uuid",
"moduleId": "module-uuid",
"title": "JavaScript Fundamentals Quiz",
"description": "Test your knowledge of JavaScript basics",
"questions": [
{
"text": "What is the output of '2' + 2 in JavaScript?",
"options": [
{ "text": "4", "isCorrect": false },
{ "text": "22", "isCorrect": true },
{ "text": "NaN", "isCorrect": false }
],
"explanation": "JavaScript performs string concatenation when one operand is a string"
}
]
}
\`\`\`

**Response:**
\`\`\`json
{
"message": "Quiz created successfully",
"data": {
"\_id": "quiz-uuid",
"courseId": "course-uuid",
"moduleId": "module-uuid",
"title": "JavaScript Fundamentals Quiz",
"description": "Test your knowledge of JavaScript basics",
"questions": [...],
"createdBy": "user-uuid",
"isActive": true,
"version": 1,
"createdAt": "2024-01-15T10:30:00Z",
"updatedAt": "2024-01-15T10:30:00Z"
},
"meta": {
"questionCount": 1,
"createdBy": "Tutor Name",
"createdAt": "2024-01-15T10:30:00Z"
}
}
\`\`\`

### Get Quiz

`GET /api/quizzes/:quizId`

Retrieve a specific quiz by ID. Students see questions without correct answers, tutors/admins see full details.

**Path Parameters:**

- `quizId`: Quiz UUID

**Query Parameters:**

- `includeAnswers`: (optional) Set to 'true' to include correct answers (tutors/admins only)

**Headers:**

- `Authorization: Bearer <token>` (required)

**Response (for students):**
\`\`\`json
{
"message": "Quiz retrieved successfully",
"data": {
"\_id": "quiz-uuid",
"title": "JavaScript Fundamentals Quiz",
"description": "Test your knowledge of JavaScript basics",
"questions": [
{
"text": "What is the output of '2' + 2 in JavaScript?",
"options": [
{ "text": "4" },
{ "text": "22" },
{ "text": "NaN" }
]
}
]
},
"meta": {
"questionCount": 1,
"totalOptions": 3
}
}
\`\`\`

### Update Quiz

`PUT /api/quizzes/:quizId`

Update an existing quiz. **Tutor and Admin access only.**

**Path Parameters:**

- `quizId`: Quiz UUID

**Headers:**

- `Authorization: Bearer <token>` (required)

**Request Body:**
\`\`\`json
{
"title": "Updated Quiz Title",
"description": "Updated description",
"questions": [...]
}
\`\`\`

**Response:**
\`\`\`json
{
"message": "Quiz updated successfully",
"data": { ... },
"meta": {
"version": 2,
"updatedBy": "Tutor Name",
"updatedAt": "2024-01-15T11:00:00Z"
}
}
\`\`\`

### Delete Quiz

`DELETE /api/quizzes/:quizId`

Soft delete a quiz. **Tutor and Admin access only.**

**Path Parameters:**

- `quizId`: Quiz UUID

**Query Parameters:**

- `permanent`: (optional) Set to 'true' for hard delete (admin only)

**Headers:**

- `Authorization: Bearer <token>` (required)

**Response:**
\`\`\`json
{
"message": "Quiz deleted successfully",
"code": "QUIZ_SOFT_DELETED"
}
\`\`\`

### Get All Quizzes

`GET /api/quizzes`

Retrieve quizzes with filtering and pagination. **All authenticated users.**

**Query Parameters:**

- `courseId`: (optional) Filter by course UUID
- `moduleId`: (optional) Filter by module UUID
- `page`: (optional) Page number (default: 1)
- `limit`: (optional) Items per page (default: 10)
- `search`: (optional) Search in title/description
- `sortBy`: (optional) Sort field (default: createdAt)
- `sortOrder`: (optional) Sort order (asc/desc, default: desc)

**Headers:**

- `Authorization: Bearer <token>` (required)

**Response:**
\`\`\`json
{
"message": "Quizzes retrieved successfully",
"data": [...],
"meta": {
"total": 25,
"page": 1,
"limit": 10,
"totalPages": 3,
"hasNextPage": true,
"hasPrevPage": false
}
}
\`\`\`

### Add Question to Quiz

`POST /api/quizzes/:quizId/questions`

Add a new question to an existing quiz. **Tutor and Admin access only.**

**Path Parameters:**

- `quizId`: Quiz UUID

**Headers:**

- `Authorization: Bearer <token>` (required)

**Request Body:**
\`\`\`json
{
"text": "New question text",
"options": [
{ "text": "Option A", "isCorrect": true },
{ "text": "Option B", "isCorrect": false }
],
"explanation": "Optional explanation"
}
\`\`\`

### Delete Question from Quiz

`DELETE /api/quizzes/:quizId/questions/:questionId`

Delete a specific question from a quiz. **Tutor and Admin access only.**

**Path Parameters:**

- `quizId`: Quiz UUID
- `questionId`: Question UUID

**Headers:**

- `Authorization: Bearer <token>` (required)

**Response:**
\`\`\`json
{
"message": "Question deleted successfully",
"data": { ... },
"meta": {
"remainingQuestions": 4,
"deletedQuestionId": "question-uuid"
}
}
```

## Challenge Leaderboards

### Get Course Leaderboard
`GET /api/leaderboard/course/:id`

Retrieve the leaderboard for a specific course based on Head-to-Head challenge performance.

**Path Parameters:**
- `id`: Course ID

**Query Parameters:**
- `timeFrame`: (optional) Time filter: `all-time` (default), `weekly`, `monthly`
- `sortBy`: (optional) Sort criteria: `winRate` (default), `points`, `participation`
- `limit`: (optional) Number of results (default: 10)
- `page`: (optional) Page number (default: 1)

**Response:**
```json
{
    "success": true,
    "count": 10,
    "data": [
        {
            "_id": "student_id",
            "totalGames": 15,
            "wins": 12,
            "totalPoints": 150,
            "winRate": 80,
            "averagePoints": 10,
            "fullName": "Student Name",
            "avatar": "profile_image_url",
            "rank": 1
        }
    ]
}
```

### Get Topic Leaderboard
`GET /api/leaderboard/topic/:id`

Retrieve the leaderboard for a specific topic (module).

**Path Parameters:**
- `id`: Module ID

**Query Parameters:**
- Same as Course Leaderboard.

**Response:**
- Same structure as Course Leaderboard.

## Badge Management

### Create Badge

`POST /badges`

Create a new achievement badge. **Admin access only.**

**Request Body:**
```json
{
"name": "Smart Contract Expert",
"description": "Master blockchain development",
"icon": "blockchain-icon",
"category": "skill_mastery",
"criteria": {
"type": "skill_completion",
"value": 1,
"skillArea": "blockchain"
},
"pointsReward": 200,
"rarity": "epic"
}
```

### Get All Badges

`GET /badges`

Retrieve all available badges.

**Query Parameters:**

- `category`: (optional) Filter by category
- `rarity`: (optional) Filter by rarity
- `isActive`: (optional) Filter by active status

### Get Student Badges

`GET /students/:studentId/badges`

Retrieve all badges earned by a specific student.

**Path Parameters:**

- `studentId`: Student ID

**Response:**
```json
{
"status": "success",
"data": [
{
"badgeId": {
"name": "First Steps",
"description": "Complete your first course",
"icon": "trophy",
"category": "milestone",
"rarity": "common",
"pointsReward": 50
},
"earnedAt": "2024-01-15T10:30:00Z",
"courseId": {
"title": "JavaScript Basics"
}
}
]
}
```

## Point Values

| Activity              | Base Points | Bonus Conditions                        |
| --------------------- | ----------- | --------------------------------------- |
| Course Completion     | 100         | -                                       |
| Quiz Completion       | 25          | +15 for 90%+, +10 for 80%+, +5 for 70%+ |
| Assignment Completion | 50          | -                                       |
| Badge Earned          | Variable    | Based on badge rarity                   |
| Milestone Reached     | 200         | -                                       |

## Badge Criteria Types

- `points_threshold`: Award when student reaches specific point total
- `course_completion`: Award when student completes specified number of courses
- `skill_completion`: Award when student completes course in specific skill area
- `consecutive_days`: Award for consistent daily activity (future feature)

## Tutor Performance Reports

### Get Course Reports

`GET /tutor/reports/courses`

Retrieve performance reports for all courses owned by the tutor.

**Query Parameters:**

- `interval`: (optional) Filter by time interval (weekly, monthly, quarterly, yearly)

**Response:**
```json
{
"courses": [
{
"id": "course_id",
"title": "Course Title",
"totalEnrollments": 100,
"totalPurchases": 80,
"rating": 4.5,
"engagement": 0.75
}
]
}
```

### Get Specific Course Report

`GET /tutor/reports/courses/:id`

Retrieve detailed performance report for a specific course.

**Path Parameters:**

- `id`: Course ID

**Query Parameters:**

- `format`: (optional) Response format ('json' or 'csv')

**Response (JSON):**
```json
{
"title": "Course Title",
"description": "Course Description",
"price": 99.99,
"rating": 4.5,
"totalEnrollments": 100,
"completionRate": 75.5,
"revenue": 7999.20
}
```

**Response (CSV):**
Downloads a CSV file with the following fields:

- title
- description
- price
- rating
- totalEnrollments
- completionRate
- revenue

### Get Leaderboard

`GET /tutor/reports/leaderboard`

Retrieve a leaderboard based on selected metrics.

**Query Parameters:**

- `metric`: (optional) Sort by metric (purchases, ratings, enrollments, engagement)
- `limit`: (optional) Number of results to return (default: 10)

**Response:**
```json
{
"leaderboard": [
{
"id": "course_id",
"title": "Course Title",
"metricValue": 100
}
]
}

## Admin Account

### Get Account Details

`GET /admin/account`

Retrieve the profile details of the currently logged-in admin or moderator.

**Response:**

```json
{
  "success": true,
  "data": {
    "_id": "64c9f1...",
    "fullName": "Admin User",
    "email": "admin@chainverse.com",
    "phoneNumber": "1234567890",
    "role": "admin",
    "profileImage": "[https://bucket-url.com/profile.png](https://bucket-url.com/profile.png)",
    "createdAt": "2024-01-01T10:00:00.000Z"
  }
}
```

### Update Profile

`PUT /admin/account/update`

Update profile information. Requires email uniqueness check.

**Request Body:**

```JSON

{
    "fullName": "Updated Name",
    "email": "new-email@chainverse.com",
    "phoneNumber": "0987654321"
}
```

**Response:**

```JSON

{
    "success": true,
    "message": "Profile updated successfully",
    "data": {
        "_id": "64c9f1...",
        "fullName": "Updated Name",
        "email": "new-email@chainverse.com",
        ...
    }
}
```

### Change Password

**PUT /admin/account/change-password**

Change the account password. Requires verification of the current password. Rate Limit: 5 attempts per hour.

**Request Body:**

```JSON

{
    "currentPassword": "oldPassword123",
    "newPassword": "NewStrongPassword1@"
}
```

**Response:**

```JSON

{
    "success": true,
    "message": "Password changed successfully"
}
```

### Upload Profile Image

**POST /admin/account/upload-profile-image**

Upload a new profile image. Supported formats: JPG, PNG.

**Request Body:**

profileImage: (File) The image file to upload.

**Response:**

```JSON

{
    "success": true,
    "message": "Profile image uploaded successfully",
    "data": {
        "profileImage": "[https://s3-bucket-url.com/uploads/profile-123.png](https://s3-bucket-url.com/uploads/profile-123.png)"
    }
}
```

## Library (E-Library Books)

### Browse / Search / Filter Books (Public)
`GET /api/library/books`

Retrieve books from the e-library with full-text search, filters, sorting, and pagination. **Public access** (only non-sensitive fields are returned).

**Headers:**
- None

**Query Parameters:**
- `search`: Full-text search query (searches `title`, `author`, `description`, `tags`, `category`)
- `title`: Filter by title (case-insensitive)
- `author`: Filter by author (case-insensitive)
- `category`: Filter by category
- `tags`: Comma-separated tags (OR semantics). Example: `tags=defi,stellar`
- `topic`: Alias for a single tag (combined with `tags` using OR)
- `courseId`: Limit results to books recommended by the given course, then apply the other filters (intersection)
- `sort`: `recent` | `popular` | `relevance` (default: `relevance` when `search` is present, otherwise `recent`)
- `page`: Page number (default: 1)
- `limit`: Page size (default: 10, max: 100)

**Response:**
```json
{
    "success": true,
    "message": "Books retrieved successfully",
    "data": {
        "books": [
            {
                "_id": "book_id",
                "title": "Stellar DeFi Handbook",
                "author": "Alice",
                "description": "Book description",
                "coverImage": "https://example.com/cover.png",
                "link": "https://example.com/read",
                "isbn": "978-0000000000",
                "tags": ["stellar", "defi"],
                "category": "defi",
                "createdAt": "2024-01-15T10:30:00.000Z",
                "borrowCount": 42
            }
        ],
        "currentPage": 1,
        "totalPages": 5,
        "totalBooks": 50
    }
}
```

**Note:** `borrowCount` is included only when `sort=popular`.

**Examples:**
- `GET /api/library/books`
- `GET /api/library/books?search=stellar`
- `GET /api/library/books?category=defi&sort=popular`
- `GET /api/library/books?courseId=<courseId>&tags=defi,web3&sort=recent&page=1&limit=20`
