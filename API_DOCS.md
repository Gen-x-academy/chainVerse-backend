# API Documentation

## Table of Contents
- [Authentication](#authentication)
- [Courses](#courses)
- [Students](#students)
- [Tutor Authentication](./src/docs/tutorAuth.md)
- [Tutor Performance Reports](#tutor-performance-reports)
- [Gamification System](#gamification-system)
- [Tutor Account Management](#tutor-account-management)

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
```

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

| Activity | Base Points | Bonus Conditions |
|----------|-------------|------------------|
| Course Completion | 100 | - |
| Quiz Completion | 25 | +15 for 90%+, +10 for 80%+, +5 for 70%+ |
| Assignment Completion | 50 | - |
| Badge Earned | Variable | Based on badge rarity |
| Milestone Reached | 200 | - |

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
