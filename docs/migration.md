
---

# 🔄 Migration Parity Tracker (Express → NestJS)

> This document tracks feature parity between the legacy **Express implementation** and the new **NestJS architecture**, ensuring a safe, structured, and complete migration.

---

## 🎯 Purpose

The migration tracker exists to:

* Provide **visibility** into migration progress
* Prevent **feature regressions**
* Ensure **no endpoint or business logic is lost**
* Guide **safe deprecation of Express code**
* Align team members on **what’s done vs pending**

---

## 📊 Migration Status Legend

| Status        | Meaning                                                      |
| ------------- | ------------------------------------------------------------ |
| ✅ Completed   | Fully migrated and tested in NestJS                          |
| 🟡 Partial    | Partially migrated (missing logic, guards, validation, etc.) |
| ❌ Not Started | No migration work done yet                                   |
| 🚫 Deprecated | Express version removed and replaced                         |

---

## 🧩 Migration Matrix

### 🔐 Authentication & Users

| Feature        | Express                   | NestJS Module | Status | Notes                          |
| -------------- | ------------------------- | ------------- | ------ | ------------------------------ |
| Admin Auth     | `express/auth/admin.js`   | `auth/`       | ✅      | JWT + RBAC implemented         |
| Student Auth   | `express/auth/student.js` | `auth/`       | ✅      |                                |
| Tutor Auth     | `express/auth/tutor.js`   | `auth/`       | ✅      |                                |
| Refresh Tokens | `express/auth/refresh.js` | `auth/`       | 🟡     | Rotation not fully implemented |
| User Profile   | `express/users/`          | `users/`      | ✅      |                                |

---

### 📚 Courses

| Feature          | Express                        | NestJS Module | Status | Notes              |
| ---------------- | ------------------------------ | ------------- | ------ | ------------------ |
| Create Course    | `express/courses/create.js`    | `courses/`    | ✅      |                    |
| Update Course    | `express/courses/update.js`    | `courses/`    | ✅      |                    |
| Course Listing   | `express/courses/list.js`      | `courses/`    | ✅      | Filtering improved |
| Course Reviews   | `express/reviews/`             | `reviews/`    | 🟡     | Missing moderation |
| Course Analytics | `express/courses/analytics.js` | `reports/`    | ❌      | Pending            |

---

### 🏆 Gamification

| Feature       | Express                          | NestJS Module   | Status | Notes         |
| ------------- | -------------------------------- | --------------- | ------ | ------------- |
| Points System | `express/gamification/points.js` | `gamification/` | ✅      |               |
| Leaderboard   | `express/leaderboard/`           | `leaderboard/`  | ✅      |               |
| Badges        | `express/gamification/badges.js` | `gamification/` | 🟡     | Partial logic |
| NFT Rewards   | `express/gamification/nft.js`    | `gamification/` | ❌      | Not started   |

---

### 🎓 Certification

| Feature              | Express                             | NestJS Module    | Status | Notes               |
| -------------------- | ----------------------------------- | ---------------- | ------ | ------------------- |
| Certificate Issuance | `express/certification/issue.js`    | `certification/` | ✅      |                     |
| Certificate Download | `express/certification/download.js` | `certification/` | ✅      |                     |
| Name Change Requests | `express/certification/name.js`     | `certification/` | 🟡     | Workflow incomplete |

---

### 💰 Financial Aid

| Feature                | Express                           | NestJS Module    | Status | Notes              |
| ---------------------- | --------------------------------- | ---------------- | ------ | ------------------ |
| Application Submission | `express/financial-aid/apply.js`  | `financial-aid/` | ✅      |                    |
| Admin Review           | `express/financial-aid/review.js` | `financial-aid/` | 🟡     | Missing audit logs |

---

### 📊 Reporting

| Feature           | Express                      | NestJS Module | Status | Notes |
| ----------------- | ---------------------------- | ------------- | ------ | ----- |
| Student Analytics | `express/reports/student.js` | `reports/`    | ❌      |       |
| Tutor Analytics   | `express/reports/tutor.js`   | `reports/`    | ❌      |       |
| Course Reports    | `express/reports/course.js`  | `reports/`    | ❌      |       |

---

### 🛎 System Modules

| Feature            | Express                     | NestJS Module        | Status | Notes        |
| ------------------ | --------------------------- | -------------------- | ------ | ------------ |
| Notifications      | `express/notification/`     | `notification/`      | 🟡     | No queue yet |
| FAQ                | `express/system/faq.js`     | `common/` or `faq/`  | ❌      |              |
| Contact Messages   | `express/system/contact.js` | `common/`            | ❌      |              |
| Subscription Plans | `express/subscription/`     | `subscription-plan/` | 🟡     |              |
| Organization       | `express/org/`              | `organization/`      | 🟡     |              |

---

## 🧭 Migration Workflow

To ensure consistency, every feature migration should follow:

1. **Identify Express feature**
2. **Map to NestJS module**
3. **Rebuild using NestJS patterns**

   * Controllers
   * Services
   * DTOs
   * Guards
4. **Add validation & Swagger docs**
5. **Write tests (unit/e2e)**
6. **Mark status in tracker**
7. **Deprecate Express implementation**

---

## 🚫 Express Deprecation Strategy

Express code should only be removed when:

* ✅ Feature is fully implemented in NestJS
* ✅ API contract is verified
* ✅ Tests are passing
* ✅ No active consumers depend on Express route

### Suggested Flow

```text
NestJS Complete → QA Verified → Mark ✅ → Mark Express 🚫 → Delete Code
```

---

## 📌 Ownership & Updates

* Each module owner is responsible for updating this tracker
* Update status **immediately after PR merge**
* Use this file during sprint planning & reviews

---

## 🚀 Recommended Improvements

To make this even more powerful:

* Add **GitHub Issues linked per feature**
* Track **PR links per migration**
* Add **API diff references (Express vs Nest)**
* Integrate with **project board (Linear/Jira)**

---

## 💡 Pro Tip (Senior-Level Insight)

If you want this to actually work in a team:

* Don’t keep this only in README → move to `docs/migration.md`
* Assign **owners per module**
* Enforce updates via PR checklist:

```md
- [ ] Migration tracker updated
```

---

