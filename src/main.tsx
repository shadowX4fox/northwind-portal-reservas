// Portal de Reservas — SPA de Reservas de Salas Northwind (arquitectura northwind-reservas 1.9.0).
import { UserManager } from 'oidc-client-ts';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ServicioDeReservasClient } from './api/client';
import { Auth, authSettings } from './auth/auth';
import { loadConfig } from './config';
import { initTelemetry, log } from './telemetry/telemetry';
import { App } from './ui/App';
import './ui/styles.css';

const root = createRoot(document.getElementById('root')!);

async function main() {
  const config = loadConfig();
  initTelemetry(config.otelCollectorUrl);

  const auth = new Auth(new UserManager(authSettings(config.oidcAuthority, config.oidcClientId)));
  const client = new ServicioDeReservasClient({
    baseUrl: config.servicioDeReservasUrl,
    accessToken: () => auth.accessToken(),
    onUnauthenticated: () => void auth.login(),
  });

  // Sin sesión en memoria (primera visita o recarga) se repite el flujo OIDC (F-01, fase 1).
  if (!(await auth.start())) {
    await auth.login();
    return;
  }

  root.render(
    <StrictMode>
      <App auth={auth} client={client} />
    </StrictMode>,
  );
}

main().catch((error: unknown) => {
  log('error', 'El Portal de Reservas no pudo arrancar', { error: error instanceof Error ? error.message : String(error) });
  root.render(
    <main>
      <h1>Portal de Reservas</h1>
      <p role="alert">El portal no está disponible. Inténtalo más tarde.</p>
    </main>,
  );
});
