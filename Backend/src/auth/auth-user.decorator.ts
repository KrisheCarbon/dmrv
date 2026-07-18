import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import type { AuthenticatedUser } from './auth.types';

export const AuthUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest();
    if (!request.authUser) {
      throw new UnauthorizedException('Not authenticated');
    }
    return request.authUser;
  },
);
