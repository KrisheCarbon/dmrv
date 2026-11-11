import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseClient } from '@supabase/supabase-js';
import { isDmrvViewer } from '@krishecarbon/shared';

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
import { SUPABASE_AUTH_CLIENT, SUPABASE_CLIENT } from '../supabase/supabase.module';
import type { AuthenticatedUser } from './auth.types';
import { CognitoTokenService } from './cognito-token.service';
import {
  applicationUserId,
  missingAuthSubjectColumn,
  type VerifiedIdentity,
} from './token-identity';

type UserProfile = {
  id: string;
  role: string;
  auth_subject?: string | null;
};

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(
    @Inject(SUPABASE_AUTH_CLIENT) private readonly authClient: SupabaseClient,
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
    @Inject(CognitoTokenService) private readonly cognitoTokens: CognitoTokenService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization as string | undefined;

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid Authorization header');
    }

    const token = authHeader.slice('Bearer '.length);
    const awsProfile = await this.profileFromAws(token);
    if (awsProfile) {
      this.attach(request, awsProfile);
      return true;
    }

    const identity = await this.identify(token);
    const profile = await this.profileFor(identity);

    if (identity.provider === 'cognito') {
      await this.linkCognitoSubject(profile, identity.subject);
    }

    this.attach(request, profile);
    return true;
  }

  /** Local API confirms the Cognito login against the AWS API, not Supabase. */
  private async profileFromAws(token: string): Promise<UserProfile | null> {
    const base = this.config.get<string>('AWS_PROFILE_API')?.trim();
    if (!base) return null;

    const cognito = await this.cognitoTokens.verify(token);
    if (!cognito) {
      throw new UnauthorizedException('Invalid or expired session');
    }

    let response: Response;
    try {
      response = await fetch(`${base.replace(/\/$/, '')}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
    } catch {
      throw new UnauthorizedException('User profile not found');
    }

    if (!response.ok) {
      throw new UnauthorizedException('Invalid or expired session');
    }

    const body = (await response.json().catch(() => null)) as {
      id?: string;
      role?: string;
    } | null;
    if (!body?.id || !body?.role) {
      throw new UnauthorizedException('User profile not found');
    }

    return { id: body.id, role: body.role, auth_subject: cognito.subject };
  }

  private attach(
    request: { method?: string; authUser?: AuthenticatedUser },
    profile: UserProfile,
  ): void {
    const authUser: AuthenticatedUser = {
      id: profile.id,
      role: profile.role,
    };

    // dMRV viewers only look. Every create, edit and delete is refused here,
    // whatever the endpoint, so a new write route cannot forget the check.
    if (isDmrvViewer(authUser.role) && !READ_METHODS.has(String(request.method).toUpperCase())) {
      throw new ForbiddenException('dMRV viewers can only view data.');
    }

    request.authUser = authUser;
  }

  private async identify(token: string): Promise<VerifiedIdentity> {
    const cognito = await this.cognitoTokens.verify(token);
    if (cognito) return cognito;

    const {
      data: { user },
      error,
    } = await this.authClient.auth.getUser(token);

    if (error || !user) {
      throw new UnauthorizedException('Invalid or expired session');
    }

    return {
      provider: 'supabase',
      subject: user.id,
      legacyUserId: null,
    };
  }

  private async profileFor(identity: VerifiedIdentity): Promise<UserProfile> {
    const userId = applicationUserId(identity);
    const byId = await this.loadProfile('id', userId);
    if (byId) return byId;

    if (identity.provider === 'cognito') {
      const bySubject = await this.loadProfile('auth_subject', identity.subject);
      if (bySubject) return bySubject;
    }

    throw new UnauthorizedException('User profile not found');
  }

  private async loadProfile(
    column: 'id' | 'auth_subject',
    value: string,
  ): Promise<UserProfile | null> {
    const withSubject = await this.supabase
      .from('users')
      .select('id, role, auth_subject')
      .eq(column, value)
      .maybeSingle();

    if (!withSubject.error && withSubject.data?.role && withSubject.data.id) {
      return withSubject.data as UserProfile;
    }

    if (withSubject.error && missingAuthSubjectColumn(withSubject.error)) {
      if (column === 'auth_subject') return null;
      const plain = await this.supabase
        .from('users')
        .select('id, role')
        .eq('id', value)
        .maybeSingle();
      if (plain.error || !plain.data?.role || !plain.data.id) return null;
      return plain.data as UserProfile;
    }

    if (withSubject.error) {
      throw new UnauthorizedException('User profile not found');
    }

    return null;
  }

  /** First Cognito sign-in stores the new sub. The profile id does not change. */
  private async linkCognitoSubject(profile: UserProfile, subject: string): Promise<void> {
    if (profile.auth_subject === undefined) return;
    if (profile.auth_subject === subject) return;
    if (profile.auth_subject) {
      throw new UnauthorizedException('Invalid or expired session');
    }

    const { error } = await this.supabase
      .from('users')
      .update({ auth_subject: subject })
      .eq('id', profile.id)
      .is('auth_subject', null);

    if (error && !missingAuthSubjectColumn(error)) {
      throw new UnauthorizedException('User profile not found');
    }
  }
}
