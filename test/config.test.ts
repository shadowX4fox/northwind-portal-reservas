import { ConfigError, loadConfig } from '../src/config';

const completa = {
  VITE_SERVICIO_DE_RESERVAS_URL: 'https://reservas.example/',
  VITE_OIDC_AUTHORITY: 'https://idp.example/realms/northwind',
  VITE_OIDC_CLIENT_ID: 'portal',
  VITE_OTEL_COLLECTOR_URL: 'https://otel.example',
};

describe('configuración', () => {
  it('no arranca sin la configuración de despliegue (falla cerrado)', () => {
    expect(() => loadConfig({})).toThrow(ConfigError);
    expect(() => loadConfig({ ...completa, VITE_OIDC_CLIENT_ID: ' ' })).toThrow(/VITE_OIDC_CLIENT_ID/);
  });

  it('rechaza un host remoto sin https', () => {
    expect(() => loadConfig({ ...completa, VITE_SERVICIO_DE_RESERVAS_URL: 'http://reservas.example' })).toThrow(/https/);
  });

  it('acepta la configuración completa', () => {
    expect(loadConfig(completa).servicioDeReservasUrl).toBe('https://reservas.example');
  });
});
