/** Shape attached to `request.user` by JwtAuthGuard. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  role: string;
}

export interface AuthenticatedRequest {
  user: AuthenticatedUser;
}
