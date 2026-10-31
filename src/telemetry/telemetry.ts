// Portal de Reservas — trazas, métricas y logs con OpenTelemetry hacia el colector de Plataforma Northwind (ADR-004, INV-08).
import { context, metrics, propagation, trace, type Attributes } from '@opentelemetry/api';
import { logs, SeverityNumber } from '@opentelemetry/api-logs';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { BatchLogRecordProcessor, LoggerProvider } from '@opentelemetry/sdk-logs';
import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { BatchSpanProcessor, StackContextManager, TracerProvider } from '@opentelemetry/sdk-trace';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { redact, redactText } from './redact';

export const SERVICE_NAME = 'Portal de Reservas';
export const SERVICE_VERSION = '1.0.2';
const SCOPE = 'portal-de-reservas';

export function initTelemetry(collectorUrl: string): void {
  const resource = resourceFromAttributes({ [ATTR_SERVICE_NAME]: SERVICE_NAME, [ATTR_SERVICE_VERSION]: SERVICE_VERSION });

  context.setGlobalContextManager(new StackContextManager().enable());
  // W3C Trace Context (`traceparent`) en cada llamada HTTP, desde el navegador (ADR-004, INV-07).
  propagation.setGlobalPropagator(new W3CTraceContextPropagator());
  trace.setGlobalTracerProvider(
    new TracerProvider({
      resource,
      spanProcessors: [new BatchSpanProcessor({ exporter: new OTLPTraceExporter({ url: `${collectorUrl}/v1/traces` }) })],
    }),
  );
  metrics.setGlobalMeterProvider(
    new MeterProvider({
      resource,
      readers: [new PeriodicExportingMetricReader({ exporter: new OTLPMetricExporter({ url: `${collectorUrl}/v1/metrics` }) })],
    }),
  );
  logs.setGlobalLoggerProvider(
    new LoggerProvider({
      resource,
      processors: [new BatchLogRecordProcessor({ exporter: new OTLPLogExporter({ url: `${collectorUrl}/v1/logs` }) })],
    }),
  );
}

export const tracer = () => trace.getTracer(SCOPE, SERVICE_VERSION);

// Métricas RED (tasa, errores, duración) por operación hacia el Servicio de Reservas (ADR-004).
// TODO(architecture): presupuestos del componente no documentados — "| Latencia p99 | [NOT DOCUMENTED — run
//   /sa-analysis:architecture-analysis latency-budget] |", ídem Error budget, Throughput (pico/sostenido) y Techo de costo
//   (spec, líneas 145–149); las fases 1 y 2 de F-01/F-02/F-03 tienen "Latency budget: Not documented". Se mide cada
//   operación contra la meta del flujo: F-01 ≤ 1 s p95, F-02 y F-03 ≤ 2 s p95.
const meter = () => metrics.getMeter(SCOPE, SERVICE_VERSION);
let red: ReturnType<typeof createRed> | undefined;
function createRed() {
  const m = meter();
  return {
    requests: m.createCounter('portal.servicio_de_reservas.requests', { description: 'Solicitudes al Servicio de Reservas por operación' }),
    errors: m.createCounter('portal.servicio_de_reservas.errors', { description: 'Solicitudes fallidas al Servicio de Reservas por operación' }),
    duration: m.createHistogram('portal.servicio_de_reservas.duration', { description: 'Duración de cada solicitud al Servicio de Reservas', unit: 'ms' }),
    confirmation: m.createHistogram('portal.booking.confirmation.duration', {
      description: 'Tiempo desde "Confirmar" hasta ver el código de reserva (meta p95 ≤ 2 s, PO Spec §8)',
      unit: 'ms',
    }),
    availability: m.createHistogram('portal.availability.duration', {
      description: 'Tiempo hasta ver la disponibilidad (meta p95 ≤ 1 s, flujo Consultar disponibilidad)',
      unit: 'ms',
    }),
  };
}
const instruments = () => (red ??= createRed());

export function recordRequest(operation: string, durationMs: number, outcome: { status?: number; error: boolean }): void {
  const attributes: Attributes = { operation, 'http.response.status_code': outcome.status ?? 0 };
  instruments().requests.add(1, attributes);
  if (outcome.error) instruments().errors.add(1, attributes);
  instruments().duration.record(durationMs, attributes);
}

export function recordBookingConfirmation(durationMs: number): void {
  instruments().confirmation.record(durationMs);
}

// TODO(architecture): la meta dice "Tiempo hasta ver la disponibilidad, desde que el miembro abre "Salas" o cambia sede,
//   fecha o franja, p95 ≤ 1 s" (spec, línea 154), pero el portal consulta cuando el miembro pulsa "Consultar" o una franja
//   sugerida, no al abrir "Salas" ni al cambiar sede, fecha o franja: el reloj arranca ahí.
export function recordAvailability(durationMs: number): void {
  instruments().availability.record(durationMs);
}

// Logs JSON estructurados con trace_id, span_id, service.name y nivel; nunca tokens ni datos personales completos (ADR-004).
type Level = 'debug' | 'info' | 'warn' | 'error';
const SEVERITY: Record<Level, SeverityNumber> = {
  debug: SeverityNumber.DEBUG,
  info: SeverityNumber.INFO,
  warn: SeverityNumber.WARN,
  error: SeverityNumber.ERROR,
};

export function log(level: Level, message: string, attributes: Record<string, unknown> = {}): void {
  const spanContext = trace.getActiveSpan()?.spanContext();
  const safe = redact(attributes);
  const body = redactText(message);
  const record = {
    timestamp: new Date().toISOString(),
    level,
    'service.name': SERVICE_NAME,
    trace_id: spanContext?.traceId,
    span_id: spanContext?.spanId,
    message: body,
    ...safe,
  };
  logs.getLogger(SCOPE, SERVICE_VERSION).emit({ severityNumber: SEVERITY[level], severityText: level.toUpperCase(), body, attributes: safe });
  (level === 'error' ? console.error : level === 'warn' ? console.warn : console.info)(JSON.stringify(record));
}
