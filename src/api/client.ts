// Portal de Reservas → Servicio de Reservas (I-02): REST sobre HTTPS con JSON, contrato OpenAPI 3.1 (ADR-001).
// El contrato es contracts/servicio-de-reservas/openapi.yaml, copia byte a byte del asset:openapi.yaml del build pack
// del Servicio de Reservas (1.9.0); los tipos de servicio-de-reservas.d.ts se generan de esa copia.
//
// TODO(architecture): "archivo del contrato: [NOT DOCUMENTED — add contract reference to docs/05-integration-points.md]"
//   (interface:portal-de-reservas→servicio-de-reservas, línea 34). Se usa el openapi.yaml que publica el Servicio de Reservas.
// TODO(architecture): semántica de fallo del upstream no documentada — "| timeout | [NOT DOCUMENTED] | …",
//   "| downstream no disponible | [NOT DOCUMENTED] | — |", "| fallo parcial | [NOT DOCUMENTED] | …",
//   "| versiones incompatibles | [NOT DOCUMENTED] | …" (interface:portal-de-reservas→servicio-de-reservas, líneas 123–127).
//   El portal no fija timeout ni reintenta solo: muestra el fallo y el usuario decide reintentar.
// TODO(architecture): "Garantía de orden entre solicitudes: [NOT DOCUMENTED]."
//   (interface:portal-de-reservas→servicio-de-reservas, línea 84). El portal no asume ningún orden.
import { context, propagation, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import { log, recordRequest, tracer } from '../telemetry/telemetry';
import type { components, operations } from './servicio-de-reservas';

export type Schemas = components['schemas'];
export type AvailabilityResponse = Schemas['AvailabilityResponse'];
export type RoomAvailability = Schemas['RoomAvailability'];
export type Booking = Schemas['Booking'];
export type BookingRequest = Schemas['BookingRequest'];
export type CancellationRequest = Schemas['CancellationRequest'];
export type ProblemCode = Schemas['Problem']['code'];
export type AvailabilityQuery = Required<NonNullable<operations['getAvailability']['parameters']['query']>>;

/** Error RFC 9457 (`application/problem+json`) con su `code` estable (ADR-001). */
export class ApiProblem extends Error {
  constructor(
    readonly status: number,
    readonly code: ProblemCode | undefined,
    readonly detail?: string,
  ) {
    super(code ?? `HTTP ${status}`);
  }
}

/** El Servicio de Reservas no respondió (red caída, CORS, 5xx sin problema). */
export class ServiceUnavailable extends Error {}

/** No hay token de acceso vigente: la solicitud no sale del navegador. */
export class NotAuthenticated extends Error {}

export interface ClientOptions {
  baseUrl: string;
  accessToken: () => string | null;
  /** Falla de autenticación (401 o sin token): el portal redirige al inicio de sesión (I-01). */
  onUnauthenticated: () => void;
  fetch?: typeof fetch;
}

export class ServicioDeReservasClient {
  constructor(private readonly options: ClientOptions) {}

  getAvailability(query: AvailabilityQuery): Promise<AvailabilityResponse> {
    // TODO(architecture): "obligatoriedad de site, date, start y end" no documentada (asset:openapi.yaml del
    //   Servicio de Reservas, línea 31); el portal envía siempre los cuatro.
    const params = new URLSearchParams(query);
    return this.request('getAvailability', 'GET', `/v1/availability?${params}`);
  }

  /** `idempotencyKey`: UUID v4 generado en el navegador por cada confirmación (ADR-103); un reintento de la misma confirmación la repite. */
  createBooking(body: BookingRequest, idempotencyKey: string): Promise<Booking> {
    return this.request('createBooking', 'POST', '/v1/bookings', { body, headers: { 'Idempotency-Key': idempotencyKey } });
  }

  listBookings(scope?: 'site'): Promise<Booking[]> {
    return this.request('listBookings', 'GET', scope ? '/v1/bookings?scope=site' : '/v1/bookings');
  }

  getBooking(code: string): Promise<Booking> {
    return this.request('getBooking', 'GET', `/v1/bookings/${encodeURIComponent(code)}`);
  }

  cancelBooking(code: string, body?: CancellationRequest): Promise<Booking> {
    return this.request('cancelBooking', 'POST', `/v1/bookings/${encodeURIComponent(code)}/cancel`, body ? { body } : {});
  }

  private async request<T>(
    operation: string,
    method: string,
    path: string,
    init: { body?: unknown; headers?: Record<string, string> } = {},
  ): Promise<T> {
    const token = this.options.accessToken();
    if (!token) {
      this.options.onUnauthenticated();
      throw new NotAuthenticated();
    }
    const doFetch = this.options.fetch ?? globalThis.fetch.bind(globalThis);

    return tracer().startActiveSpan(`Servicio de Reservas ${operation}`, { kind: SpanKind.CLIENT, attributes: { operation } }, async (span) => {
      const headers: Record<string, string> = { Accept: 'application/json, application/problem+json', ...init.headers, Authorization: `Bearer ${token}` };
      if (init.body !== undefined) headers['Content-Type'] = 'application/json';
      propagation.inject(trace.setSpan(context.active(), span), headers); // traceparent (ADR-004, INV-07)

      const started = performance.now();
      let status: number | undefined;
      try {
        let response: Response;
        try {
          response = await doFetch(`${this.options.baseUrl}${path}`, {
            method,
            headers,
            body: init.body === undefined ? undefined : JSON.stringify(init.body),
            credentials: 'omit',
          });
        } catch (cause) {
          throw new ServiceUnavailable('El Servicio de Reservas no está disponible', { cause });
        }
        status = response.status;
        span.setAttribute('http.response.status_code', status);
        if (response.ok) return (await response.json()) as T;

        const problem = await readProblem(response);
        if (status === 401) this.options.onUnauthenticated();
        if (status >= 500 && !problem.code) throw new ServiceUnavailable(`El Servicio de Reservas respondió ${status}`);
        throw problem;
      } catch (error) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: error instanceof ApiProblem ? error.message : 'unavailable' });
        log('warn', 'Solicitud al Servicio de Reservas fallida', {
          operation,
          'http.response.status_code': status,
          'problem.code': error instanceof ApiProblem ? error.code : undefined,
        });
        throw error;
      } finally {
        recordRequest(operation, performance.now() - started, { status, error: status === undefined || status >= 400 });
        span.end();
      }
    });
  }
}

async function readProblem(response: Response): Promise<ApiProblem> {
  let code: ProblemCode | undefined;
  let detail: string | undefined;
  if (response.headers.get('Content-Type')?.includes('json')) {
    try {
      const body = (await response.json()) as { code?: ProblemCode; detail?: string };
      code = body.code;
      detail = typeof body.detail === 'string' ? body.detail : undefined;
    } catch {
      // cuerpo ilegible: el problema queda sin `code`
    }
  }
  return new ApiProblem(response.status, code, detail);
}
