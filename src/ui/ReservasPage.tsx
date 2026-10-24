// INV-03: "Mis reservas" — reservas futuras del miembro, con su cancelación.
// INV-04: "Reservas de la sede" — el recepcionista cancela cualquier reserva de su sede (`scope=site`, ADR-105).
// La autorización la decide el Servicio de Reservas; el portal solo presenta lo que el servicio devuelve.
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { Booking } from '../api/client';
import { SEDES } from '../time/sedeClock';
import { useClient } from './context';
import { ESTADO, mensajeDeError } from './messages';

/** Longitud del motivo de cancelación: entre 10 y 120 caracteres (CancellationRequest del contrato). */
const MOTIVO_MIN = 10;
const MOTIVO_MAX = 120;

export function ReservasPage({ scope, recepcion }: { scope?: 'site'; recepcion: boolean }) {
  const client = useClient();
  const [reservas, setReservas] = useState<Booking[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelando, setCancelando] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      setReservas(await client.listBookings(scope));
    } catch (e) {
      setError(mensajeDeError(e));
    }
  }, [client, scope]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const titulo = scope === 'site' ? 'Reservas de la sede' : 'Mis reservas';
  return (
    <section aria-labelledby="reservas-titulo">
      <h2 id="reservas-titulo">{titulo}</h2>
      {error && <p role="alert">{error}</p>}
      {reservas && reservas.length === 0 && <p role="status">No hay reservas futuras.</p>}
      {reservas && reservas.length > 0 && (
        <ul aria-label={titulo}>
          {reservas.map((b) => (
            <li key={b.code}>
              <strong>{b.code}</strong> · {nombreSede(b.site)} · {b.date} {b.start}–{b.end} · {b.subject} · {ESTADO[b.status] ?? b.status}
              {b.status === 'confirmed' && (
                <button type="button" onClick={() => setCancelando(b.code)}>
                  Cancelar {b.code}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {cancelando && (
        <CancelarDialog
          code={cancelando}
          // El motivo es obligatorio para el rol `recepcion` (ADR-105, CancellationRequest).
          motivoObligatorio={recepcion}
          onClose={(cambio) => {
            setCancelando(null);
            if (cambio) void cargar();
          }}
        />
      )}
    </section>
  );
}

function nombreSede(site: unknown): string {
  // TODO(architecture): "type of site en Booking" no documentado (asset:openapi.yaml del Servicio de Reservas, línea 353).
  return SEDES.find((s) => s.id === site)?.nombre ?? String(site ?? '');
}

function CancelarDialog({ code, motivoObligatorio, onClose }: { code: string; motivoObligatorio: boolean; onClose: (cambio: boolean) => void }) {
  const client = useClient();
  const [reserva, setReserva] = useState<Booking | null>(null);
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [cancelada, setCancelada] = useState(false);

  // CU3, paso 1: estado vigente de la reserva antes de pedir la confirmación (getBooking).
  useEffect(() => {
    client.getBooking(code).then(setReserva, (e) => setError(mensajeDeError(e)));
  }, [client, code]);

  const largo = motivo.trim().length;
  const motivoValido = largo === 0 ? !motivoObligatorio : largo >= MOTIVO_MIN && largo <= MOTIVO_MAX;

  async function confirmar(event: FormEvent) {
    event.preventDefault();
    if (enviando || !motivoValido) return;
    setEnviando(true);
    setError(null);
    try {
      await client.cancelBooking(code, largo ? { reason: motivo.trim() } : undefined);
      setCancelada(true);
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div role="dialog" aria-labelledby="cancelar-titulo">
      <h3 id="cancelar-titulo">Cancelar {code}</h3>
      {error && <p role="alert">{error}</p>}
      {cancelada ? (
        <>
          <p role="status">Reserva {code} cancelada.</p>
          <button type="button" onClick={() => onClose(true)}>
            Cerrar
          </button>
        </>
      ) : (
        reserva && (
          <form onSubmit={confirmar}>
            <p>
              {reserva.date} {reserva.start}–{reserva.end} · {reserva.subject} · {ESTADO[reserva.status] ?? reserva.status}
            </p>
            {reserva.status === 'confirmed' ? (
              <>
                <label>
                  Motivo{motivoObligatorio ? '' : ' (opcional)'}
                  <textarea value={motivo} maxLength={MOTIVO_MAX} onChange={(e) => setMotivo(e.target.value)} required={motivoObligatorio} />
                </label>
                {!motivoValido && largo > 0 && <p>El motivo debe tener entre {MOTIVO_MIN} y {MOTIVO_MAX} caracteres.</p>}
                <button type="submit" disabled={enviando || !motivoValido}>
                  Confirmar cancelación
                </button>
              </>
            ) : (
              <p role="status">La reserva ya no está confirmada.</p>
            )}
            <button type="button" onClick={() => onClose(false)} disabled={enviando}>
              Volver
            </button>
          </form>
        )
      )}
    </div>
  );
}
