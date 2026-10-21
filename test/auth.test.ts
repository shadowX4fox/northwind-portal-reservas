// INV-05 / INV-06: OIDC con código de autorización + PKCE; tokens solo en memoria (ADR-002, ADR-104).
import { OidcClient, User, UserManager } from 'oidc-client-ts';
import { Auth, authSettings } from '../src/auth/auth';

const ACCESS = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJtaWVtYnJvIn0.firma-acceso';
const REFRESH = 'refresh-token-secreto';

function storagesContain(text: string): boolean {
  for (const storage of [localStorage, sessionStorage]) {
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i)!;
      if (key.includes(text) || storage.getItem(key)!.includes(text)) return true;
    }
  }
  return false;
}

describe('autenticación con el Proveedor de Identidad Northwind', () => {
  const settings = authSettings('https://idp.example/realms/northwind', 'portal', 'https://portal.example');

  it('usa el flujo de código de autorización y renovación silenciosa', () => {
    expect(settings.response_type).toBe('code');
    expect(settings.automaticSilentRenew).toBe(true);
    expect(settings.redirect_uri).toBe('https://portal.example/auth/callback');
  });

  it('guarda los tokens solo en memoria, nunca en localStorage ni sessionStorage (INV-06)', async () => {
    const manager = new UserManager(settings);
    const auth = new Auth(manager);
    const user = new User({
      access_token: ACCESS,
      refresh_token: REFRESH,
      id_token: 'id-token-secreto',
      token_type: 'Bearer',
      profile: { sub: 'miembro', iss: 'https://idp.example/realms/northwind', aud: 'portal', exp: 0, iat: 0 },
      expires_at: Math.floor(Date.now() / 1000) + 300,
    });
    await manager.storeUser(user);
    expect(await auth.start({ pathname: '/', href: 'https://portal.example/' } as Location)).not.toBeNull();
    expect(auth.accessToken()).toBe(ACCESS);
    expect(storagesContain(ACCESS)).toBe(false);
    expect(storagesContain(REFRESH)).toBe(false);
    expect(storagesContain('id-token-secreto')).toBe(false);
  });

  it('pide PKCE (S256) en la redirección y no deja tokens en el almacenamiento del navegador', async () => {
    const client = new OidcClient({
      ...settings,
      metadata: { issuer: 'https://idp.example/realms/northwind', authorization_endpoint: 'https://idp.example/auth', token_endpoint: 'https://idp.example/token' },
    });
    const request = await client.createSigninRequest({ request_type: 'si:r' });
    const url = new URL(request.url);
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toBeTruthy();
    expect(storagesContain('access_token')).toBe(false);
  });

  it('un token vencido no se entrega (deny by default)', async () => {
    const manager = new UserManager(settings);
    const auth = new Auth(manager);
    await manager.storeUser(new User({ access_token: ACCESS, token_type: 'Bearer', profile: { sub: 'm', iss: '', aud: '', exp: 0, iat: 0 }, expires_at: 1 }));
    await auth.start({ pathname: '/', href: 'https://portal.example/' } as Location);
    expect(auth.accessToken()).toBeNull();
  });
});
