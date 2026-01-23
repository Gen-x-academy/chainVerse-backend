# API Documentation

## Table of Contents

- [Authentication](#authentication)
- [Admin Account](#admin-account)
- [Courses](#courses)
- [Students](#students)
- [Tutor Authentication](./src/docs/tutorAuth.md)
- [Tutor Performance Reports](#tutor-performance-reports)
- [Gamification System](#gamification-system)

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
