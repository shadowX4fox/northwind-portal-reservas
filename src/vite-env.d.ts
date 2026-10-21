/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SERVICIO_DE_RESERVAS_URL?: string;
  readonly VITE_OIDC_AUTHORITY?: string;
  readonly VITE_OIDC_CLIENT_ID?: string;
  readonly VITE_OTEL_COLLECTOR_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
