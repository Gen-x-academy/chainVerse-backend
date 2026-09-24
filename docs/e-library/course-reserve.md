# Course Reserves

> **Issue:** [#1052 — \[E-Library/Tutors\] Add library reserve collection for course materials](https://github.com/Gen-x-academy/chainVerse-backend/issues/1052)

## Overview

A **course reserve** places a physical book copy or a digital edition/license
under a shortened loan period for a specific course and date window.  While the
reserve is `active`, enrolled students check out the material under the
`specialLoanPeriodDays` policy instead of the normal loan period, ensuring high
item turnover during the course term.

When `endDate` passes, a scheduled job transitions the record to `expired` and
normal circulation rules are automatically restored.

---

## Data Model

**Collection:** `library_course_reserves`

| Field | Type | Required | Notes |
|---|---|---|---|
| `courseId` | string | ✅ | Course identifier |
| `requestedBy` | string | ✅ | Librarian user ID |
| `copyId` | ObjectId (ref `BookCopy`) | — | Physical copy; at least one of `copyId` / `editionId` required |
| `editionId` | string | — | Digital edition/license; at least one of `copyId` / `editionId` required |
| `startDate` | Date | ✅ | Reserve start (must be before `endDate`) |
| `endDate` | Date | ✅ | Reserve end (inclusive); triggers expiry when past |
| `specialLoanPeriodDays` | number (1–90) | ✅ | Shortened loan period while reserve is active |
| `notes` | string (≤ 500 chars) | — | Librarian notes |
| `status` | `active` \| `expired` \| `cancelled` | ✅ | Default `active` |

**Indexes:** `(courseId, status)`, `(copyId, status)`, `(endDate, status)`

---

## Conflict Rules

A new reserve is rejected (`422 Unprocessable Entity`, error code
`BIZ_RESERVE_CONFLICT`) when any existing **active** reserve meets either
condition:

1. **Same physical copy, overlapping dates** — Two reserves cannot share a
   `copyId` if their date ranges overlap (`A.startDate < B.endDate AND
   A.endDate > B.startDate`).

2. **Same digital edition + same course, overlapping dates** — Two reserves
   cannot share both `editionId` and `courseId` with overlapping dates.

---

## API Endpoints

All endpoints require a valid JWT (`Authorization: Bearer <token>`).

### `POST /e-library/course-reserves`

Create a new course reserve.

**Roles:** `LIBRARIAN`, `ADMIN`

**Request body** (`CreateCourseReserveDto`):
```json
{
  "courseId": "COURSE-CS101-2026",
  "copyId": "507f1f77bcf86cd799439011",
  "editionId": "EDITION-ISBN-9780451524935",
  "startDate": "2026-02-01",
  "endDate": "2026-05-31",
  "specialLoanPeriodDays": 3,
  "notes": "Required reading for CS101."
}
```

**Responses:**
| Status | Meaning |
|---|---|
| `201 Created` | Reserve created. Body contains the new document. |
| `400 Bad Request` | Validation failure (class-validator). |
| `401 Unauthorized` | Missing or invalid JWT. |
| `403 Forbidden` | Insufficient role. |
| `422 Unprocessable Entity` | `startDate >= endDate`, or conflict (`BIZ_RESERVE_CONFLICT`). |

---

### `GET /e-library/course-reserves/course/:courseId`

List all **active** reserves for a course.

**Roles:** `LIBRARIAN`, `ADMIN`, `TUTOR`, `STUDENT`

**Path param:** `courseId` — course identifier.

**Response:** `200 OK` — array of `CourseReserve` documents sorted by
`startDate` ascending (empty array if none).

---

### `GET /e-library/course-reserves/:id`

Fetch a single reserve by its MongoDB ID.

**Roles:** `LIBRARIAN`, `ADMIN`

**Responses:**
| Status | Meaning |
|---|---|
| `200 OK` | Reserve document. |
| `404 Not Found` | No reserve with the given ID exists. |

---

### `PATCH /e-library/course-reserves/:id/cancel`

Cancel an active reserve before its `endDate`.

**Roles:** `LIBRARIAN`, `ADMIN`

**Responses:**
| Status | Meaning |
|---|---|
| `200 OK` | Reserve status set to `cancelled`. |
| `404 Not Found` | Reserve not found. |
| `422 Unprocessable Entity` | Reserve is already `expired` or `cancelled` (`BIZ_RESERVE_NOT_CANCELLABLE`). |

---

## Error Codes

| Code | HTTP | Meaning |
|---|---|---|
| `BIZ_RESERVE_CONFLICT` | 422 | Overlapping active reserve exists for the same resource. |
| `BIZ_RESERVE_NOT_CANCELLABLE` | 422 | Reserve cannot be cancelled (already expired or cancelled). |

---

## Operational Notes

### Expiry Scheduler

The `CourseReserveService.expireStale()` method bulk-transitions all `active`
reserves whose `endDate < now` to `expired`.  It is designed to be called from
a scheduled job (e.g., nightly cron via NestJS `@Cron`).  It returns the
count of transitioned records for observability.

The method is **idempotent** — calling it multiple times has no extra effect
once a record is already `expired`.

### No New Environment Variables

This feature requires no additional environment variables or external
dependencies beyond the existing MongoDB connection.

### Swagger / OpenAPI

All endpoints are decorated with `@ApiOperation`, `@ApiParam`, and
`@ApiResponse` annotations and will appear under the **E-Library Course
Reserves** tag in the auto-generated Swagger UI (`/api`).
