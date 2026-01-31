# API Documentation

## Table of Contents

- [Authentication](#authentication)
- [Courses](#courses)
- [Students](#students)
- [Student Account Settings](#student-account-settings)
- [Certificate Retrieval & Download](./CERTIFICATE_API_DOCS.md)
- [Tutor Authentication](./src/docs/tutorAuth.md)
- [Tutor Performance Reports](#tutor-performance-reports)
- [Gamification System](#gamification-system)

## Courses

### Get All Courses

`GET /api/courses`

Retrieve all published courses with advanced filtering, searching, and sorting options. **Public access with optional authentication.**

**Headers:**

- `Authorization: Bearer <token>` (optional - enables role-based filtering)

**Query Parameters:**

- `page`: (optional) Page number (default: 1)
- `limit`: (optional) Number of courses per page (default: 10)
- `search`: (optional) Search keywords in title, description, and tutor name
- `category`: (optional) Filter by course category
- `tutorName`: (optional) Filter by tutor name (case-insensitive)
- `level`: (optional) Filter by difficulty level (Beginner, Intermediate, Advanced)
- `price`: (optional) Filter by price type ('free' or 'paid')
- `sortBy`: (optional) Sort field (createdAt, rating, totalEnrollments, price) (default: createdAt)
- `sortOrder`: (optional) Sort order ('asc' or 'desc') (default: desc)

**Response:**

```json
{
  "success": true,
  "message": "Courses retrieved successfully",
  "data": {
    "courses": [
      {
        "id": "course_id",
        "title": "Blockchain Fundamentals",
        "description": "Learn the basics of blockchain technology",
        "tutor": {
          "name": "John Doe",
          "email": "john@example.com"
        },
        "category": "Blockchain Development",
        "level": "Beginner",
        "price": 0,
        "thumbnail": "/uploads/thumbnails/blockchain-123.jpg",
        "rating": 4.5,
        "totalEnrollments": 150,
        "totalRatings": 45,
        "createdAt": "2024-01-15T10:30:00Z",
        "updatedAt": "2024-01-15T10:30:00Z"
      }
    ],
    "currentPage": 1,
    "totalPages": 5,
    "totalCourses": 50
  }
}
```

**Role-based Filtering:**

- **Students**: See all published courses
- **Tutors**: See only their own published courses
- **Unauthenticated users**: See all published courses

### Get Course Details

`GET /api/courses/:id`

Retrieve detailed information for a specific published course. **Public access with optional authentication.**

**Path Parameters:**

- `id`: Course ID (required)

**Headers:**

- `Authorization: Bearer <token>` (optional - enables role-based access)

**Response:**

```json
{
  "success": true,
  "message": "Course retrieved successfully",
  "data": {
    "id": "course_id",
    "title": "Blockchain Fundamentals",
    "description": "Learn the basics of blockchain technology",
    "tutor": {
      "name": "John Doe",
      "email": "john@example.com"
    },
    "category": "Blockchain Development",
    "tags": ["blockchain", "cryptocurrency", "decentralized"],
    "level": "Beginner",
    "price": 0,
    "thumbnail": "/uploads/thumbnails/blockchain-123.jpg",
    "videos": [
      {
        "title": "Introduction to Blockchain",
        "url": "/uploads/videos/intro.mp4",
        "duration": 600,
        "order": 1
      }
    ],
    "rating": 4.5,
    "totalEnrollments": 150,
    "totalRatings": 45,
    "prerequisite": {
      "title": "Basic Programming Concepts"
    },
    "createdAt": "2024-01-15T10:30:00Z",
    "updatedAt": "2024-01-15T10:30:00Z"
  }
}
```

**Role-based Access:**

- **Students**: Can view all published courses
- **Tutors**: Can only view their own published courses
- **Unauthenticated users**: Can view all published courses

**Error Responses:**

- `404 Not Found`: Course not found or not published
- `403 Forbidden`: Tutor trying to access another tutor's course

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

=======
>>>>>>> origin/main
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
\`\`\`json
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
\`\`\`

### Get Student Points

`GET /students/:id/points`

Retrieve points and achievements for a specific student. Students can only view their own points, tutors can view any student's points.

**Path Parameters:**

- `id`: Student ID

**Response:**
\`\`\`json
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
\`\`\`

### Get Leaderboard

`GET /students/leaderboard`

Retrieve the student leaderboard ranked by total points.

**Query Parameters:**

- `limit`: (optional) Number of results per page (default: 50)
- `page`: (optional) Page number (default: 1)

**Response:**
\`\`\`json
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
\`\`\`

### Get Student Rank

`GET /students/:id/rank`

Get the current rank of a specific student.

**Path Parameters:**

- `id`: Student ID

**Response:**
\`\`\`json
{
"status": "success",
"data": {
"studentId": "student_id",
"totalPoints": 1250,
"rank": 15
}
}
\`\`\`

## Badge Management

### Create Badge

`POST /badges`

Create a new achievement badge. **Admin access only.**

**Request Body:**
\`\`\`json
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
\`\`\`

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
\`\`\`json
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
\`\`\`

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
\`\`\`json
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
\`\`\`

### Get Specific Course Report

`GET /tutor/reports/courses/:id`

Retrieve detailed performance report for a specific course.

**Path Parameters:**

- `id`: Course ID

**Query Parameters:**

- `format`: (optional) Response format ('json' or 'csv')

**Response (JSON):**
\`\`\`json
{
"title": "Course Title",
"description": "Course Description",
"price": 99.99,
"rating": 4.5,
"totalEnrollments": 100,
"completionRate": 75.5,
"revenue": 7999.20
}
\`\`\`

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
\`\`\`json
{
"leaderboard": [
{
"id": "course_id",
"title": "Course Title",
"metricValue": 100
}
]
}
