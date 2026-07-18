export interface AuthenticatedUser {
  id: string;
  role: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    authUser?: AuthenticatedUser;
  }
}
