import {
  applicationUserId,
  isCognitoIssuer,
  missingAuthSubjectColumn,
  peekJwt,
} from './token-identity';

function jwt(payload: object): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `aaa.${body}.sig`;
}

describe('token identity', () => {
  it('keeps the existing user id when Cognito sends the legacy id', () => {
    expect(
      applicationUserId({
        provider: 'cognito',
        subject: 'cognito-sub',
        legacyUserId: 'existing-user-id',
      }),
    ).toBe('existing-user-id');
  });

  it('uses the Supabase user id when there is no legacy id', () => {
    expect(
      applicationUserId({
        provider: 'supabase',
        subject: 'existing-user-id',
        legacyUserId: null,
      }),
    ).toBe('existing-user-id');
  });

  it('reads the issuer without trusting the token', () => {
    const peeked = peekJwt(
      jwt({ iss: 'https://cognito-idp.ap-south-1.amazonaws.com/pool', token_use: 'id' }),
    );
    expect(peeked?.iss).toContain('cognito-idp');
    expect(peeked?.token_use).toBe('id');
    expect(peekJwt('not-a-jwt')).toBeNull();
  });

  it('matches the Cognito issuer exactly', () => {
    const issuer = 'https://cognito-idp.ap-south-1.amazonaws.com/pool';
    expect(isCognitoIssuer(`${issuer}/`, issuer)).toBe(true);
    expect(isCognitoIssuer('https://example.supabase.co/auth/v1', issuer)).toBe(false);
  });

  it('detects a database that has not added auth_subject yet', () => {
    expect(missingAuthSubjectColumn({ code: '42703', message: 'column users.auth_subject does not exist' })).toBe(true);
    expect(missingAuthSubjectColumn({ message: 'User profile not found' })).toBe(false);
  });
});
