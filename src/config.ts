// Portal de Reservas — configuración de despliegue.
// Ningún valor tiene default: la arquitectura no documenta hosts ni el cliente OIDC, así que
// un despliegue sin ellos no arranca (falla cerrado) en vez de llamar a un destino supuesto.

export interface PortalConfig {
  servicioDeReservasUrl: string;
  oidcAuthority: string;
  oidcClientId: string;
  otelCollectorUrl: string;
}

export class ConfigError extends Error {}

type Env = Record<string, string | undefined>;

const REQUIRED = {
  servicioDeReservasUrl: 'VITE_SERVICIO_DE_RESERVAS_URL',
  oidcAuthority: 'VITE_OIDC_AUTHORITY',
  oidcClientId: 'VITE_OIDC_CLIENT_ID',
  otelCollectorUrl: 'VITE_OTEL_COLLECTOR_URL',
} as const satisfies Record<keyof PortalConfig, string>;

export function loadConfig(env: Env = import.meta.env): PortalConfig {
  const missing: string[] = [];
  const config = {} as PortalConfig;
  for (const [key, name] of Object.entries(REQUIRED) as [keyof PortalConfig, string][]) {
    const value = env[name]?.trim();
    if (!value) missing.push(name);
    else config[key] = value.replace(/\/+$/, '');
  }
  if (missing.length) throw new ConfigError(`Configuración incompleta del Portal de Reservas: ${missing.join(', ')}`);
  for (const key of ['servicioDeReservasUrl', 'oidcAuthority', 'otelCollectorUrl'] as const) {
    if (new URL(config[key]).protocol !== 'https:' && !isLocalhost(config[key])) {
      // TLS 1.2+ en el ingress del clúster (ADR-005): nunca se habla en claro con un host remoto.
      throw new ConfigError(`${REQUIRED[key]} debe usar https`);
    }
  }
  return config;
}

function isLocalhost(url: string): boolean {
  const { hostname } = new URL(url);
  return hostname === 'localhost' || hostname === '127.0.0.1';
}
