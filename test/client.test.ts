// I-02: token en Authorization, traceparent (INV-07), Idempotency-Key en la creación (ADR-103), RFC 9457 (ADR-001).
import { propagation, trace } from '@opentelemetry/api';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { InMemorySpanExporter, SimpleSpanProcessor, TracerProvider } from '@opentelemetry/sdk-trace';
import { ApiProblem, NotAuthenticated, ServiceUnavailable, ServicioDeReservasClient } from '../src/api/client';

const spans = new InMemorySpanExporter();
beforeAll(() => {
  propagation.setGlobalPropagator(new W3CTraceContextPropagator());
  trace.setGlobalTracerProvider(new TracerProvider({ spanProcessors: [new SimpleSpanProcessor({ exporter: spans })] }));
});

function json(status: number, body: unknown, type = 'application/json') {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': type } });
}

function setup(fetchImpl: typeof fetch, token: string | null = 'token-de-acceso') {
  const onUnauthenticated = vi.fn();
  const fetchMock = vi.fn(fetchImpl);
  const client = new ServicioDeReservasClient({ baseUrl: 'https://reservas.example', accessToken: () => token, onUnauthenticated, fetch: fetchMock });
  return { client, fetchMock, onUnauthenticated };
}

const headersOf = (mock: ReturnType<typeof vi.fn>, call = 0) => (mock.mock.calls[call][1] as RequestInit).headers as Record<string, string>;

describe('ServicioDeReservasClient', () => {
  it('envía el token en Authorization y propaga traceparent (INV-07)', async () => {
    const { client, fetchMock } = setup(async () => json(200, { rooms: [] }));
    await client.getAvailability({ site: 'centro', date: '2026-10-21', start: '09:00', end: '10:00' });
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('https://reservas.example/v1/availability?site=centro&date=2026-10-21&start=09%3A00&end=10%3A00');
    const headers = headersOf(fetchMock);
    expect(headers.Authorization).toBe('Bearer token-de-acceso');
    expect(headers.traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-0[01]$/);
  });

  it('sin token no llama al Servicio de Reservas y pide inicio de sesión (deny by default)', async () => {
    const { client, fetchMock, onUnauthenticated } = setup(async () => json(200, []), null);
    await expect(client.listBookings()).rejects.toBeInstanceOf(NotAuthenticated);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onUnauthenticated).toHaveBeenCalledOnce();
  });

  it('un 401 redirige al inicio de sesión (I-01)', async () => {
    const { client, onUnauthenticated } = setup(async () => json(401, { code: 'UNAUTHENTICATED' }, 'application/problem+json'));
    await expect(client.listBookings()).rejects.toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
    expect(onUnauthenticated).toHaveBeenCalledOnce();
  });

  it('envía Idempotency-Key en la creación (ADR-103)', async () => {
    const { client, fetchMock } = setup(async () => json(201, { code: 'RS-ABCD1234' }));
    const key = crypto.randomUUID();
    await client.createBooking({ roomId: 'r1', date: '2026-10-21', start: '09:00', end: '10:00', subject: 'Comité' }, key);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(headersOf(fetchMock)['Idempotency-Key']).toBe(key);
    expect(JSON.parse(init.body as string)).toEqual({ roomId: 'r1', date: '2026-10-21', start: '09:00', end: '10:00', subject: 'Comité' });
  });

  it('lee el problema RFC 9457 con su code estable', async () => {
    const { client } = setup(async () => json(409, { code: 'ROOM_OCCUPIED', title: 'x' }, 'application/problem+json'));
    const error = await client.createBooking({ roomId: 'r1', date: 'd', start: 's', end: 'e', subject: '' }, 'k').catch((e) => e);
    expect(error).toBeInstanceOf(ApiProblem);
    expect(error.code).toBe('ROOM_OCCUPIED');
  });

  it('cancela con motivo en POST /v1/bookings/{code}/cancel', async () => {
    const { client, fetchMock } = setup(async () => json(200, { code: 'RS-ABCD1234', status: 'cancelled' }));
    await client.cancelBooking('RS-ABCD1234', { reason: 'Mantenimiento de la sala' });
    expect(fetchMock.mock.calls[0][0]).toBe('https://reservas.example/v1/bookings/RS-ABCD1234/cancel');
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toEqual({ reason: 'Mantenimiento de la sala' });
  });

  it('una red caída es ServiceUnavailable, sin reintento automático', async () => {
    const { client, fetchMock } = setup(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(client.listBookings()).rejects.toBeInstanceOf(ServiceUnavailable);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
