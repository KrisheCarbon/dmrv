import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  isCognitoIssuer,
  peekJwt,
  type VerifiedIdentity,
} from './token-identity';

type IdTokenPayload = {
  sub?: string;
  token_use?: string;
  'custom:legacy_id'?: string;
};

type JwtKeySet = ReturnType<JoseApi['createRemoteJWKSet']>;

type JoseApi = {
  createRemoteJWKSet: (url: URL) => { _keySet: true };
  jwtVerify: (
    token: string,
    keySet: JwtKeySet,
    options: { issuer: string; audience: string },
  ) => Promise<{ payload: IdTokenPayload }>;
};

type CognitoConfig = {
  issuer: string;
  clientId: string;
};

@Injectable()
export class CognitoTokenService {
  private jose: JoseApi | null = null;
  private jwks: JwtKeySet | null = null;
  private jwksIssuer: string | null = null;

  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  /**
   * Verifies a Cognito ID token. Returns null when this token is not from
   * the configured pool, so the caller can verify it as a Supabase session.
   * A Cognito token that fails verification is rejected and not reused.
   */
  async verify(token: string): Promise<VerifiedIdentity | null> {
    const pool = this.pool();
    if (!pool) return null;

    const peeked = peekJwt(token);
    if (!peeked?.iss || !isCognitoIssuer(peeked.iss, pool.issuer)) return null;

    let payload: IdTokenPayload;
    try {
      const jose = await this.loadJose();
      const verified = await jose.jwtVerify(token, this.keys(jose, pool.issuer), {
        issuer: pool.issuer,
        audience: pool.clientId,
      });
      payload = verified.payload;
    } catch {
      throw new UnauthorizedException('Invalid or expired session');
    }

    if (payload.token_use !== 'id') {
      throw new UnauthorizedException('Sign-in did not return an ID token.');
    }

    const subject = typeof payload.sub === 'string' ? payload.sub : '';
    if (!subject) {
      throw new UnauthorizedException('Invalid or expired session');
    }

    const legacy = payload['custom:legacy_id'];
    return {
      provider: 'cognito',
      subject,
      legacyUserId: typeof legacy === 'string' && legacy.length > 0 ? legacy : null,
    };
  }

  private pool(): CognitoConfig | null {
    const region = this.config.get<string>('COGNITO_REGION')?.trim();
    const poolId = this.config.get<string>('COGNITO_USER_POOL_ID')?.trim();
    const clientId = this.config.get<string>('COGNITO_CLIENT_ID')?.trim();
    if (!region || !poolId || !clientId) return null;
    return {
      issuer: `https://cognito-idp.${region}.amazonaws.com/${poolId}`,
      clientId,
    };
  }

  private async loadJose(): Promise<JoseApi> {
    this.jose ??= (await import('jose')) as unknown as JoseApi;
    return this.jose;
  }

  private keys(jose: JoseApi, issuer: string): JwtKeySet {
    if (!this.jwks || this.jwksIssuer !== issuer) {
      this.jwks = jose.createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
      this.jwksIssuer = issuer;
    }
    return this.jwks;
  }
}
