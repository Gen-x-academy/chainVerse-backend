# Database Setup & Local Development Guide

ChainVerse Backend uses **MongoDB** via **Mongoose** (`@nestjs/mongoose`) for persistence.

---

## Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [MongoDB](https://www.mongodb.com/try/download/community) 6.0+ (local) **or** a [MongoDB Atlas](https://www.mongodb.com/atlas) cluster

---

## Quick Start (Local MongoDB)

### 1. Install MongoDB locally

**macOS (Homebrew):**
```bash
brew tap mongodb/brew
brew install mongodb-community
brew services start mongodb-community
```

**Ubuntu/Debian:**
```bash
sudo apt-get install -y mongodb
sudo systemctl start mongodb
```

**Docker (recommended for CI/dev parity):**
```bash
docker run -d --name mongo \
  -p 27017:27017 \
  -e MONGO_INITDB_DATABASE=chain-verse \
  mongo:6
```

### 2. Configure environment

Copy `.env.example` to `.env` and set your values:
```bash
cp .env.example .env
```

The key variable is:
```env
MONGO_URI=mongodb://localhost:27017/chain-verse
```

### 3. Install dependencies & start the server

```bash
npm install
npm run start:dev
```

The app connects to MongoDB on startup. No manual migration step is needed — Mongoose creates collections automatically on first write.

---

## MongoDB Atlas (Cloud)

1. Create a free cluster at [mongodb.com/atlas](https://www.mongodb.com/atlas).
2. Whitelist your IP and create a database user.
3. Copy the connection string and set it in `.env`:
   ```env
   MONGO_URI=mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/chain-verse?retryWrites=true&w=majority
   ```

---

## Schema Overview

Each active module has a `schemas/` directory containing its Mongoose schema(s):

| Module | Collection | Schema file |
|---|---|---|
| financial-aid | `financialaid` | `financial-aid/schemas/financial-aid.schema.ts` |
| badge | `badges` | `badge/schemas/badge.schema.ts` |
| notification | `notifications` | `notification/schemas/notification.schema.ts` |
| organization | `organizations` | `organization/schemas/organization.schema.ts` |
| organization-member | `organizationmembers` | `organization-member/schemas/organization-member.schema.ts` |
| points | `pointsrecords` | `points/schemas/points.schema.ts` |
| removal-request | `removalrequests` | `removal-request/schemas/removal-request.schema.ts` |
| report-abuse | `abusereports` | `report-abuse/schemas/report-abuse.schema.ts` |
| session | `sessions` | `session/schemas/session.schema.ts` |
| subscription-plan | `subscriptionplans` | `subscription-plan/schemas/subscription-plan.schema.ts` |
| course-ratings-feedback | `courseratings` | `course-ratings-feedback/schemas/course-rating.schema.ts` |
| student-saved-courses | `savedcourses` | `student-saved-courses/schemas/saved-course.schema.ts` |
| google-auth | `googleusers` | `google-auth/schemas/google-user.schema.ts` |
| student-cart | `cartitems` | `student-cart/schemas/cart-item.schema.ts` |
| student-auth | `students`, `refreshtokens` | `student-auth/schemas/student.schema.ts`, `student-auth/schemas/refresh-token.schema.ts` |
| admin-course | `courses` | `admin-course/schemas/course.schema.ts` |

All schemas use `{ timestamps: true }` so Mongoose automatically manages `createdAt` and `updatedAt` fields.

---

## Running Tests

For integration tests, set the test database URI:
```env
MONGODB_TEST_URI=mongodb://localhost:27017/chainverse_test
```

Then run:
```bash
npm test
```

---

## Environment Variables Reference

| Variable | Description | Default |
|---|---|---|
| `MONGO_URI` | Primary MongoDB connection URI | `mongodb://localhost:27017/chain-verse` |
| `MONGODB_TEST_URI` | Test database URI | `mongodb://localhost:27017/chainverse_test` |
| `JWT_SECRET` | Secret for JWT signing | random bytes (insecure — set in production!) |

> **Warning:** Never commit `.env` to version control. Only `.env.example` should be committed.
