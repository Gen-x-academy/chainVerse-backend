# API Documentation

## Table of Contents

- [Authentication](#authentication)
- [Courses](#courses)
- [Quizzes](#quizzes)
- [Course Moderators](#course-moderators)
- [Students](#students)
- [Student Account Settings](#student-account-settings)
- [Tutor Authentication](./src/docs/tutorAuth.md)
- [Tutor Performance Reports](#tutor-performance-reports)
- [Gamification System](#gamification-system)
- [Challenge Leaderboards](#challenge-leaderboards)
- [Tutor Account Management](#tutor-account-management)
- [Library (E-Library Books)](#library-e-library-books)

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
```

## Tutor Account Management

### Get Account Details
`GET /tutor/account`

Retrieve details of the logged-in tutor.

**Response:**
```json
{
    "success": true,
    "tutor": {
        "id": "tutor_id",
        "fullName": "Jane Doe",
        "email": "jane@example.com",
        "phoneNumber": "+1234567890",
        "web3Expertise": "Smart Contracts, DeFi",
        "bio": "Experienced blockchain developer...",
        "profileImage": "https://example.com/profile.jpg",
        "role": "tutor",
        "verified": true,
        "createdAt": "2024-01-01T00:00:00.000Z"
    }
}
```

### Update Profile
`PUT /tutor/account/update`

Update general profile information.

**Request Body:**
```json
{
    "fullName": "Jane Smith",
    "phoneNumber": "+0987654321",
    "bio": "New bio update...",
    "web3Expertise": "Solidity Expert"
}
```

**Response:**
```json
{
    "success": true,
    "message": "Profile updated successfully",
    "tutor": { ... }
}
```

### Change Password
`PUT /tutor/account/change-password`

Allows tutors to change their password.

**Request Body:**
```json
{
    "currentPassword": "OldPassword123!",
    "newPassword": "NewPassword456!"
}
```

**Response:**
```json
{
    "success": true,
    "message": "Password changed successfully"
}
```

### Upload Profile Image
`POST /tutor/account/upload-profile-image`

Upload or update the tutor's profile picture.

**Request Body:**
- `profileImage`: File (multipart/form-data)

**Response:**
```json
{
    "success": true,
    "message": "Profile image uploaded successfully",
    "imageUrl": "https://cloud-storage.com/tutor_id/profile.jpg"
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
