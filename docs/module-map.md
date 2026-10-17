# Module map

Where does new code go? This page maps every folder under `src/` to the feature it owns, so contributors can find the right home for a change and avoid creating yet another near-duplicate module.

> **Revalidated against `main` on 2026-10-16.** Issue #1310 refers to `src/scholarship`, `src/scholarships`, `src/scholarship-*`, `src/library`, `src/e-library` and `src/library-catalog`. **None of these folders exist on `main` today.** If you are adding scholarship or library features, see [Adding a new feature](#adding-a-new-feature) and do not recreate split folders.

**Legend.** **Wired** = imported in [`src/app.module.ts`](../src/app.module.ts), so its routes are live. **Not wired** = the module compiles but is never imported, so its routes do not exist at runtime.

---

## Platform and infrastructure

| Folder | Responsibility | Route prefix | Wired |
| --- | --- | --- | --- |
| `common/` | Shared guards (`JwtAuthGuard`, `RolesGuard`), error codes and `DomainException`, global exception filter, request-id middleware, soft-delete policy | – | n/a |
| `config/` | `app.config.ts` (typed config) and `env.validation.ts` (Joi env schema) | – | yes |
| `database/` | `DatabaseModule` and seed scripts (`npm run seed`) | – | no |
| `cache/` | `AppCacheModule` (cache-manager / Redis) | – | no |
| `logger/` | `AppLoggerModule` (nestjs-pino) | – | no |
| `metrics/` | Request metrics interceptor, domain counters, `/metrics` and `/metrics/prometheus` | `metrics` | yes |
| `tracing/` | Lightweight span logging for external calls | – | yes |
| `idempotency/` | `@Idempotent()` + `IdempotencyInterceptor` (Mongo, 24 h TTL) | – | via importers |
| `events/` | Domain event names (`event-names.ts`), payloads and cross-module listeners | – | no |
| `health/` | Liveness/readiness endpoint | `health` | no |
| `worker/` | File-upload worker endpoint | `worker` | yes |

## Identity and accounts

| Folder | Responsibility | Route prefix | Wired |
| --- | --- | --- | --- |
| `admin-auth/` | Admin login. **Also contains** two nested modules: `admin-certificate-name-change-review/` and `student-certificate-name-change-request/` | `admin/auth` | no |
| `student-auth/` | Student registration and login | `student` | no |
| `google-auth/` | Google OAuth for students | `student` | no |
| `tutor/` | Tutor accounts and profile | `tutor` | yes |
| `tutor-jwt-auth/` | Tutor JWT login and refresh | `tutor/jwt-auth` | no |
| `session/` | Session records | `sessions` | no |
| `student-account-settings/` | Student profile and settings | `student/account-settings` | no |
| `tutor-account-settings/` | Tutor profile and settings | `tutor/account-settings` | no |
| `admin-moderator-account-settings/` | Admin and moderator settings | `admin-moderator/account-settings` | no |

## Courses and learning

| Folder | Responsibility | Route prefix | Wired |
| --- | --- | --- | --- |
| `admin-course/` | Admin course CRUD. **Owns the `Course` schema** used by other modules | `admin/courses` | yes |
| `tutor-course/` | Tutor-facing course management | `tutor/courses` | yes |
| `course-discovery/` | Public course search and listing | `courses` | yes |
| `course-categorization-filtering/` | Category and tag filtering | `courses/categorization-filtering` | no |
| `course-ratings-feedback/` | Ratings and reviews | `courses` | yes |
| `course-performance-leaderboard/` | Per-course leaderboards | `courses/performance-leaderboard` | no |
| `student-enrollment/` | Free and paid enrollment. **Owns the `Enrollment` schema** | `student/enrollment` | yes |
| `student-cart/` | Cart and checkout | `student` | yes |
| `student-saved-courses/` | Saved courses (wishlist) | `student/save` | yes |
| `private-tutoring-bookings/` | 1-on-1 tutoring bookings | `tutoring/bookings` | no |
| `mentorship/` | Mentorship programs, versioned application forms, eligibility preflight, review queues ([docs](mentorship/applications.md)) | `mentorship` | yes |

## Certificates, badges and gamification

| Folder | Responsibility | Route prefix | Wired |
| --- | --- | --- | --- |
| `course-certification-nft-achievements/` | NFT certificates and achievements | `courses/certification-nft` | no |
| `certificate-social-sharing/` | Share links for certificates | `certificates/social-sharing` | no |
| `student-certificate-name-change-request/` | Student requests to change the name on a certificate | `student/certificates/name-change-request` | no |
| `badge/` | Badge definitions | `badges` | no |
| `points/` | Points ledger (`PointsRecord` schema), used by event listeners | `points` | no |
| `gamification-points/` | Points API for the gamification UI | `gamification/points` | no |

## Analytics and reporting

| Folder | Responsibility | Route prefix | Wired |
| --- | --- | --- | --- |
| `course-analytics/` | Course analytics computed from real collections (courses, enrollments, ratings) | `analytics` | yes |
| `course-reports-analytics/` | Course reports (in-memory placeholder CRUD) | `courses/reports-analytics` | no |
| `student-reports-analytics/` | Student reports | `admin/certificates/name-change-review` (see duplicates) | no |
| `tutor-reports-analytics/` | Tutor reports | `tutor/reports-analytics` | no |

## Financial aid, plans and organizations

| Folder | Responsibility | Route prefix | Wired |
| --- | --- | --- | --- |
| `financial-aid/` | Student financial-aid applications (domain / use-cases / infrastructure layout) | `financial-aid` | no |
| `admin-financial-aid-management/` | Admin review of financial-aid applications | `admin/financial-aid` | no |
| `subscription-plan/` | Subscription plans | `subscription-plans` | no |
| `organization/` | Organizations (institutions) | `organizations` | no |
| `organization-member/` | Organization membership | `organization-members` | no |

## Content, support and moderation

| Folder | Responsibility | Route prefix | Wired |
| --- | --- | --- | --- |
| `about-management/` | "About" page content | `about` | no |
| `faq-management/` | FAQ content | `faq` | no |
| `privacy-policy-management/` | Privacy policy content | `privacy-policy` | no |
| `terms-conditions-management/` | Terms and conditions content | `terms-conditions` | no |
| `contact-message/` | Contact-form messages | `contact-messages` | no |
| `notification/` | In-app notifications | `notifications` | no |
| `report-abuse/` | Abuse reports | `report-abuse` | no |
| `removal-request/` | Content and data removal requests | `removal-requests` | no |

## Legacy and non-NestJS code

| Path | What it is |
| --- | --- |
| `express/` | The pre-migration Express.js app (`app.js`, `server.js`) and its route folders. It is reference material for the NestJS migration and is not loaded by Nest. |
| `CRUDAPI/` | A separate PHP/Symfony project (composer, phpunit, Doctrine migrations). It is unrelated to the NestJS build. |
| `src/verification*.ts`, `src/verification-log.*` | Verification controller, service, module and repository files sitting loose in `src/` instead of in a module folder |

---

## Adding a new feature

1. **Search before you create.** Look for an existing module that owns the entity (check the tables above, and grep for `@Schema` classes). Extend it rather than adding a sibling such as `foo-management` next to `foo`.
2. **Use one folder per feature domain, named in the singular and kebab-case**, for example `scholarship/`, never both `scholarship/` and `scholarships/`. Put sub-capabilities inside it (`scholarship/applications/`, `scholarship/review/`), as `mentorship/` and `financial-aid/` do.
3. **Do not use the `admin-*`, `student-*` or `tutor-*` prefixes for new domains.** Express audience as controllers or guards inside the domain module instead.
4. **Wire it.** Import the module in `src/app.module.ts`. If it is not imported, its routes do not exist.
5. **Shared schemas stay with their owner.** For example, import `Course` from `admin-course/schemas` and `Enrollment` from `student-enrollment/schemas` with `MongooseModule.forFeature`; do not redefine them.

---

## Known duplicates and overlaps

These are candidates for consolidation. Each should get its own issue; none of them is changed by this document.

| # | Overlap | Notes |
| --- | --- | --- |
| 1 | `student-certificate-name-change-request/` **and** `admin-auth/student-certificate-name-change-request/` | Two modules with the same class name and route (`student/certificates/name-change-request`). |
| 2 | `admin-auth/admin-certificate-name-change-review/` **and** `student-reports-analytics/` | `student-reports-analytics` declares `@Controller('admin/certificates/name-change-review')`. This looks like a copy-paste bug that collides with the admin review module. |
| 3 | `points/` **and** `gamification-points/` | Two points APIs. `points/` owns the schema used by `events/listeners/points.listener.ts`. |
| 4 | `course-analytics/` **and** `course-reports-analytics/` | `course-analytics` reads real data; `course-reports-analytics` is an in-memory placeholder. |
| 5 | `course-analytics/`, `student-reports-analytics/` and `tutor-reports-analytics/` | Three analytics modules with no shared base. |
| 6 | `financial-aid/` **and** `admin-financial-aid-management/` | The same domain split by audience. |
| 7 | `tutor/` **and** `tutor-jwt-auth/` | Tutor identity is split across two modules. Student auth is similarly split between `student-auth/` and `google-auth/`. |
| 8 | `student-auth/`, `google-auth/` and `student-cart/` | All three mount on the `student` prefix, so route collisions are possible. |
| 9 | `terms-conditions-management/terms-conditions-management.module copy.ts` | A stray copy whose content is a `SessionController` (`@Controller('sessions')`). It duplicates `session/`. |
| 10 | `common/decorators/roles.decorator.ts` | Contains pasted controller code (`BadgeController`, `CourseCertificationNftAchievementsController`, repeated) instead of the `Roles` decorator and `ROLES_KEY` that `RolesGuard` imports. |
| 11 | `src/verification*.ts` | Module files loose in `src/` rather than in a `verification/` folder. |
| 12 | `express/*` mirrors of NestJS modules | `express/course-ratings-feedback`, `express/tutor-account-settings` and others duplicate migrated Nest modules. Delete each once its migration is verified. |
| 13 | `scholarship*` and `library*` (from issue #1310) | Not present on `main`. If they reappear, consolidate into a single `scholarship/` and a single `library/` module per the rules above. |
