# Portal de Reservas

Portal de Reservas — la SPA de Reservas de Salas Northwind (React 18, TypeScript). Se construye desde su build pack de la arquitectura [northwind-reservas](https://github.com/shadowX4fox/northwind-reservas), con el servidor MCP de la arquitectura en el IDE (`.mcp.json`).

Cada pull request pasa la revisión de arquitectura (`.github/workflows/architecture-review.yml`).

**Arquitectura**: versión 1.10.1, `pack_revision` en `.architecture.json`.

## Uso

```sh
npm ci
cp .env.example .env.local   # completar: sin estos valores el portal no arranca
npm run dev
npm test                     # invariantes INV-01…INV-11 de la Especificación de Componente
npm run build                # archivos estáticos en dist/
npm run contracts:verify     # las copias de los contratos son los bytes del build pack
```

## Contratos

| Archivo | Origen |
|---|---|
| `architecture/c4-descriptor.md` | `asset:c4-descriptor.md` del build pack de Portal de Reservas (1.10.1) |
| `contracts/servicio-de-reservas/openapi.yaml` | `asset:openapi.yaml` del build pack de Servicio de Reservas (1.10.1) — el contrato de I-02 que consume el portal |

`src/api/servicio-de-reservas.d.ts` se genera de esa copia (`npm run contracts:generate`). Las copias no se editan.

## Cómo cumple la arquitectura

- **I-01 / ADR-002 / ADR-104** — OIDC con código de autorización y PKCE (`oidc-client-ts`). Los tokens viven en un `InMemoryWebStorage`; nunca en `localStorage` ni `sessionStorage`. Solo el `state` y el verificador PKCE de la redirección en curso pasan por `sessionStorage` (ningún token) y se borran en el callback. Renovación silenciosa con el token de refresco. Una recarga repite el flujo OIDC.
- **I-02 / ADR-001** — cliente de `/v1` con `Authorization: Bearer` en cada llamada; sin token vigente la solicitud no sale (deny by default) y un 401 redirige al inicio de sesión. Errores RFC 9457 leídos por su `code`.
- **ADR-103** — una `Idempotency-Key` (UUID v4) por confirmación; un reintento de la misma confirmación la repite.
- **ADR-105** — la vista "Reservas de la sede" aparece solo si el Servicio de Reservas acepta `scope=site` para el token; el portal no interpreta claims.
- **ADR-110** — "ahora" en `America/Bogota`; no se ofrecen franjas pasadas.
- **ADR-101** — el portal llama al Servicio de Reservas directamente por HTTPS/JSON, sin API Gateway, service mesh ni event bus.
- **ADR-107** — `npm run build` produce el paquete estático que sirve el CDN de Plataforma Northwind; el portal no tiene réplicas propias.
- **ADR-004** — trazas, métricas RED por operación, tiempo "Confirmar → código" y logs JSON (`trace_id`, `span_id`, `service.name`, nivel, tokens redactados) por OTLP/HTTP al colector de Plataforma Northwind; `traceparent` en cada llamada.

## Preguntas abiertas para el arquitecto

Cada una queda como `TODO(architecture)` en el código; ninguna bloquea la construcción.

| Parte | Línea | Pregunta |
|---|---|---|
| `spec` | 9 | Equipo responsable no documentado |
| `spec` | 135 | INV-11: zona y formato de presentación de `cancelledAt` no documentados (ADR-110 lo deja en ISO 8601, fuera de su alcance) |
| `spec` | 145–149 | Latencia p99, error budget, throughput y techo de costo no documentados |
| `security` | 59 | Clasificación de los datos (data sensitivity) no documentada |
| `security` | T4-R, T5-D, T6-E | Mitigaciones en Keycloak 25 no documentadas |
| `interface:portal-de-reservas→proveedor-de-identidad-northwind` | 112–116 | Semántica de fallo del upstream (timeout, no disponible, fallo parcial, versiones) |
| `interface:portal-de-reservas→servicio-de-reservas` | 34 | Referencia al archivo del contrato en docs/05 |
| `interface:portal-de-reservas→servicio-de-reservas` | 84 | Garantía de orden entre solicitudes |
| `interface:portal-de-reservas→servicio-de-reservas` | 123–127 | Semántica de fallo del upstream |
| `asset:openapi.yaml` (Servicio de Reservas) | 13, 31, 353 | Host del servidor; obligatoriedad de los parámetros de disponibilidad; tipo de `site` en `Booking` |
