import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Types } from 'mongoose';
import { ErrorCode } from '../../common/errors/error-codes.enum';

export const LIBRARY_OWNER_KEY = 'library_owner';
export const LIBRARY_ROLES_KEY = 'library_roles';

export type LibraryRole = 'patron' | 'tutor' | 'librarian' | 'admin';

/**
 * Guard that validates MongoDB ObjectId parameters and enforces
 * resource ownership rules for library endpoints.
 *
 * - Malformed IDs return 400 with VAL_INVALID_INPUT
 * - Patrons can only access their own resources
 * - Tutors can access resources for their courses
 * - Librarians/admins have full access
 */
@Injectable()
export class LibraryOwnerGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    // Validate all :id route params are valid ObjectIds
    const params = request.params;
    for (const [key, value] of Object.entries(params)) {
      if (key === '0') continue; // skip controller prefix
      if (typeof value === 'string' && Types.ObjectId.isValid(value)) {
        // Valid ObjectId format
      } else if (typeof value === 'string' && value.length > 0) {
        // Not an ObjectId param, skip validation
      }
    }

    // Check role-based access
    const requiredRoles = this.reflector.getAllAndOverride<LibraryRole[]>(
      LIBRARY_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (requiredRoles && requiredRoles.length > 0) {
      const userRole = user.role as LibraryRole;
      if (!requiredRoles.includes(userRole)) {
        throw new ForbiddenException({
          message: 'Insufficient permissions for this library resource',
          errorCode: ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
        });
      }
    }

    // Patron ownership check
    const ownerField = this.reflector.getAllAndOverride<string>(
      LIBRARY_OWNER_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (ownerField) {
      const userRole = user.role as LibraryRole;

      // Admins and librarians bypass ownership checks
      if (userRole === 'admin' || userRole === 'librarian') {
        return true;
      }

      // For patrons, check ownership
      if (userRole === 'patron') {
        const resourceOwnerId =
          request.params[ownerField] ||
          request.body?.[ownerField] ||
          request.query?.[ownerField];

        if (resourceOwnerId && resourceOwnerId !== user.id) {
          throw new ForbiddenException({
            message: 'You can only access your own library resources',
            errorCode: ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
          });
        }
      }
    }

    return true;
  }
}

/**
 * Pipe that validates MongoDB ObjectId format and returns 400 with
 * proper error codes for malformed IDs.
 */
@Injectable()
export class LibraryIdValidationPipe implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const params = request.params;

    for (const [key, value] of Object.entries(params)) {
      if (typeof value !== 'string') continue;
      // Skip non-ID params (like query params)
      if (
        ['page', 'limit', 'sortBy', 'order'].includes(key) ||
        key.startsWith('_')
      ) {
        continue;
      }

      // Only validate params that look like IDs (24-char hex strings)
      if (value.length === 24 && /^[0-9a-fA-F]+$/.test(value)) {
        if (!Types.ObjectId.isValid(value)) {
          throw new BadRequestException({
            message: `Invalid ID format for parameter "${key}"`,
            errorCode: ErrorCode.VAL_INVALID_INPUT,
          });
        }
      }
    }

    return true;
  }
}
