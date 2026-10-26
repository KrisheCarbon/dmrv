import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { isDmrvViewer } from '@krishecarbon/shared';

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
import { SUPABASE_AUTH_CLIENT, SUPABASE_CLIENT } from '../supabase/supabase.module';
import type { AuthenticatedUser } from './auth.types';

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(
    @Inject(SUPABASE_AUTH_CLIENT) private readonly authClient: SupabaseClient,
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization as string | undefined;

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid Authorization header');
    }

    const token = authHeader.slice('Bearer '.length);
    const {
      data: { user },
      error,
    } = await this.authClient.auth.getUser(token);

    if (error || !user) {
      throw new UnauthorizedException('Invalid or expired session');
    }

    const { data: profile, error: profileError } = await this.supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile?.role) {
      throw new UnauthorizedException('User profile not found');
    }

    const authUser: AuthenticatedUser = {
      id: user.id,
      role: profile.role,
    };

    // dMRV viewers only look. Every create, edit and delete is refused here,
    // whatever the endpoint, so a new write route cannot forget the check.
    if (isDmrvViewer(authUser.role) && !READ_METHODS.has(String(request.method).toUpperCase())) {
      throw new ForbiddenException('dMRV viewers can only view data.');
    }

    request.authUser = authUser;
    return true;
  }
}
