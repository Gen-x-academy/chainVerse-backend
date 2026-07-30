/**
 * Admin static-file server helper.
 *
 * Previously this file imported AdminCourseController, AdminCourseService, and
 * CourseSchema from the wrong relative paths (they live in src/admin-course, not
 * src/admin-auth). The file's original intent was to boot an express sub-server;
 * that approach has been superseded by the main NestJS application.  The
 * file is kept to preserve git history, but all broken imports have been
 * removed.  If admin-course static assets are ever needed, use
 * AdminCourseModule imported through app.module.ts instead.
 */
export {};
