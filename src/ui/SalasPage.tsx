// INV-01: disponibilidad por sede, fecha y franja, con capacidad y equipamiento.
// INV-02: reserva de una sala libre y confirmación con el código de reserva.
// INV-10: no se puede elegir una franja anterior a la hora actual de la sede (America/Bogota).
import { useMemo, useRef, useState, type FormEvent } from 'react';
import type { AvailabilityResponse, Booking, RoomAvailability } from '../api/client';
import { recordBookingConfirmation } from '../telemetry/telemetry';
import { ahoraEnSede, esFranjaElegible, finesPosibles, iniciosElegibles, SEDES, type AhoraEnSede, type Sede } from '../time/sedeClock';
import { useClient } from './context';
import { EQUIPAMIENTO, mensajeDeError } from './messages';

interface Franja {
  site: Sede;
  date: string;
  start: string;
  end: string;
}

export function SalasPage({ now = () => ahoraEnSede() }: { now?: () => AhoraEnSede }) {
  const client = useClient();
  const ahora = now();
  const [site, setSite] = useState<Sede>('centro');
  const [date, setDate] = useState(ahora.date);
  const inicios = iniciosElegibles(date, ahora);
  const [start, setStart] = useState(inicios[0] ?? '');
  const fines = start ? finesPosibles(start) : [];
  const [end, setEnd] = useState(fines[0] ?? '');
  const [consulta, setConsulta] = useState<Franja | null>(null);
  const [resultado, setResultado] = useState<AvailabilityResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [sala, setSala] = useState<RoomAvailability | null>(null);

  const elegible = Boolean(start && end) && esFranjaElegible(date, start, end, ahora);

  async function consultar(franja: Franja) {
    // El Servicio de Reservas decide (VALIDATION_FAILED); el portal no envía una franja en el pasado (ADR-110).
    if (!esFranjaElegible(franja.date, franja.start, franja.end, now())) {
      setError('Elige una franja que no haya empezado.');
      return;
    }
    setCargando(true);
    setError(null);
    try {
      setResultado(await client.getAvailability(franja));
      setConsulta(franja);
    } catch (e) {
      setResultado(null);
      setError(mensajeDeError(e));
    } finally {
      setCargando(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void consultar({ site, date, start, end });
  }

  function cambiarInicio(value: string) {
    setStart(value);
    const posibles = finesPosibles(value);
    if (!posibles.includes(end)) setEnd(posibles[0] ?? '');
  }

  function cambiarFecha(value: string) {
    setDate(value);
    const posibles = iniciosElegibles(value, now());
    if (!posibles.includes(start)) cambiarInicio(posibles[0] ?? '');
  }

  function usarSugerencia(s: { start?: string; end?: string }) {
    if (!consulta || !s.start || !s.end) return;
    setStart(s.start);
    setEnd(s.end);
    void consultar({ ...consulta, start: s.start, end: s.end });
  }

  // Primero las libres, por capacidad ascendente (F-01, paso 3.6).
  const salas = useMemo(
    () =>
      [...(resultado?.rooms ?? [])].sort(
        (a, b) => Number(a.status !== 'free') - Number(b.status !== 'free') || (a.capacity ?? 0) - (b.capacity ?? 0),
      ),
    [resultado],
  );
  const hayLibres = salas.some((s) => s.status === 'free');

  return (
    <section aria-labelledby="salas-titulo">
      <h2 id="salas-titulo">Salas</h2>
      <form onSubmit={onSubmit} className="franja">
        <label>
          Sede
          <select value={site} onChange={(e) => setSite(e.target.value as Sede)}>
            {SEDES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </select>
        </label>
        <label>
          Fecha
          <input type="date" value={date} min={ahora.date} onChange={(e) => cambiarFecha(e.target.value)} required />
        </label>
        <label>
          Desde
          <select value={start} onChange={(e) => cambiarInicio(e.target.value)} disabled={!inicios.length}>
            {inicios.map((h) => (
              <option key={h}>{h}</option>
            ))}
          </select>
        </label>
        <label>
          Hasta
          <select value={end} onChange={(e) => setEnd(e.target.value)} disabled={!fines.length}>
            {fines.map((h) => (
              <option key={h}>{h}</option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={!elegible || cargando}>
          Consultar
        </button>
      </form>
      {!inicios.length && <p role="status">No quedan franjas para esa fecha.</p>}
      {error && <p role="alert">{error}</p>}

      {resultado && consulta && (
        <>
          {!hayLibres && (
            <div role="status">
              <p>No hay salas libres en esa franja.</p>
              {(resultado.suggestedSlots ?? []).length > 0 && (
                <>
                  <p>Franjas cercanas con una sala libre:</p>
                  <ul aria-label="Franjas sugeridas">
                    {resultado.suggestedSlots!.map((s) => (
                      <li key={`${s.start}-${s.end}`}>
                        <button type="button" onClick={() => usarSugerencia(s)}>
                          {s.start}–{s.end}
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
          <ul aria-label="Salas" className="salas">
            {salas.map((s) => (
              <li key={s.roomId} data-status={s.status}>
                <strong>{s.name}</strong> · {s.capacity} personas
                {s.equipment?.length ? ` · ${s.equipment.map((e) => EQUIPAMIENTO[e] ?? e).join(', ')}` : ''} ·{' '}
                {s.status === 'free' ? 'Libre' : 'Ocupada'}
                {s.status === 'free' && (
                  <button type="button" onClick={() => setSala(s)}>
                    Reservar {s.name}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {sala && consulta && <ReservaDialog sala={sala} franja={consulta} onClose={() => setSala(null)} />}
    </section>
  );
}

function ReservaDialog({ sala, franja, onClose }: { sala: RoomAvailability; franja: Franja; onClose: () => void }) {
  const client = useClient();
  // Una clave por confirmación (ADR-103): se crea al abrir la confirmación y se repite en cada reintento de esa misma
  // confirmación (doble clic o pérdida de red), así un reintento devuelve la reserva ya creada.
  const idempotencyKey = useRef(crypto.randomUUID());
  const [subject, setSubject] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reserva, setReserva] = useState<Booking | null>(null);

  async function confirmar(event: FormEvent) {
    event.preventDefault();
    if (enviando) return;
    setEnviando(true);
    setError(null);
    const started = performance.now();
    try {
      const booking = await client.createBooking(
        { roomId: sala.roomId!, date: franja.date, start: franja.start, end: franja.end, subject },
        idempotencyKey.current,
      );
      setReserva(booking);
      recordBookingConfirmation(performance.now() - started);
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div role="dialog" aria-labelledby="reserva-titulo">
      <h3 id="reserva-titulo">
        Reservar {sala.name} · {franja.date} {franja.start}–{franja.end}
      </h3>
      {reserva ? (
        <>
          <p role="status">
            Reserva confirmada. Código de reserva: <strong data-testid="codigo-reserva">{reserva.code}</strong>
          </p>
          <button type="button" onClick={onClose}>
            Cerrar
          </button>
        </>
      ) : (
        <form onSubmit={confirmar}>
          <label>
            Asunto
            <input value={subject} maxLength={80} onChange={(e) => setSubject(e.target.value)} />
          </label>
          {error && <p role="alert">{error}</p>}
          <button type="submit" disabled={enviando}>
            Confirmar
          </button>
          <button type="button" onClick={onClose} disabled={enviando}>
            Volver
          </button>
        </form>
      )}
    </div>
  );
}
