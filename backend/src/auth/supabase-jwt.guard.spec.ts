import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { generateKeyPair, SignJWT, exportJWK } from 'jose';
import jwt from 'jsonwebtoken';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SupabaseJwtGuard } from './supabase-jwt.guard.js';

const SECRET = 'secret-de-test-assez-long-pour-hs256-0123456789';

const ctx = (token?: string) => {
  const request: { headers: Record<string, string>; user?: unknown } = {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  };
  return { request, context: { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext };
};

describe('SupabaseJwtGuard', () => {
  let server: Server;
  let baseUrl: string;
  let privateKey: CryptoKey;
  let guard: SupabaseJwtGuard;

  beforeAll(async () => {
    const pair = await generateKeyPair('ES256');
    privateKey = pair.privateKey;
    const jwk = { ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'ES256', use: 'sig' };
    server = createServer((req, res) => {
      if (req.url === '/auth/v1/.well-known/jwks.json') {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ keys: [jwk] }));
      } else {
        res.statusCode = 404;
        res.end();
      }
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const values: Record<string, string> = { SUPABASE_JWT_SECRET: SECRET, SUPABASE_URL: baseUrl };
    guard = new SupabaseJwtGuard({ get: (key: string) => values[key] } as unknown as ConfigService);
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const es256 = (sub: string, expiresIn = '1h') =>
    new SignJWT({ role: 'authenticated' })
      .setProtectedHeader({ alg: 'ES256', kid: 'k1' })
      .setSubject(sub)
      .setExpirationTime(expiresIn)
      .sign(privateKey);

  it('accepte un jeton HS256 (secret partagé)', async () => {
    const { request, context } = ctx(jwt.sign({ sub: 'u1' }, SECRET, { expiresIn: 60 }));
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toMatchObject({ sub: 'u1' });
  });

  it('accepte un jeton ES256 (clés asymétriques via JWKS)', async () => {
    const { request, context } = ctx(await es256('u2'));
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toMatchObject({ sub: 'u2' });
  });

  it('refuse un jeton absent, expiré, mal signé ou falsifié', async () => {
    await expect(guard.canActivate(ctx().context)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      guard.canActivate(ctx(jwt.sign({ sub: 'x' }, SECRET, { expiresIn: -10 })).context),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      guard.canActivate(ctx(jwt.sign({ sub: 'x' }, 'mauvais-secret-mauvais-secret-0123456789')).context),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    const other = await generateKeyPair('ES256');
    const forged = await new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: 'k1' })
      .setSubject('pirate')
      .setExpirationTime('1h')
      .sign(other.privateKey);
    await expect(guard.canActivate(ctx(forged).context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('refuse alg=none', async () => {
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const none = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: 'x', exp: 9999999999 })}.`;
    await expect(guard.canActivate(ctx(none).context)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
