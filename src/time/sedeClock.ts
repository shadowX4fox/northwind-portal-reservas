// Reloj de negocio de la sede — ADR-110: las franjas (`date` + `start`/`end` en `HH:mm`) son hora local
// de la sede, sin desfase, y las sedes Centro, Norte y Puerto comparten la zona America/Bogota.
// "Ahora" se calcula en esa zona, nunca con la zona del navegador (INV-10).

export const ZONA_SEDES = 'America/Bogota';

export type Sede = 'centro' | 'norte' | 'puerto';
export const SEDES: { id: Sede; nombre: string }[] = [
  { id: 'centro', nombre: 'Centro' },
  { id: 'norte', nombre: 'Norte' },
  { id: 'puerto', nombre: 'Puerto' },
];

/** Paso de las franjas: múltiplos de 30 minutos (asset:openapi.yaml del Servicio de Reservas, `start`/`end`). */
export const PASO_MINUTOS = 30;
/** Duración máxima de una franja: 8 horas o menos (mismo contrato). */
export const DURACION_MAXIMA_MINUTOS = 8 * 60;

export interface AhoraEnSede {
  /** Fecha ISO 8601 (`YYYY-MM-DD`) en America/Bogota. */
  date: string;
  /** Minutos desde la medianoche en America/Bogota. */
  minutes: number;
}

export function ahoraEnSede(instant: Date = new Date()): AhoraEnSede {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_SEDES,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

export function aMinutos(hhmm: string): number {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm);
  if (!match) throw new RangeError(`Hora no válida: ${hhmm}`);
  return Number(match[1]) * 60 + Number(match[2]);
}

export function aHHmm(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/** Inicios de franja elegibles en `date`: múltiplos de 30 minutos con al menos un fin posible, nunca anteriores a la hora actual de la sede. */
export function iniciosElegibles(date: string, ahora: AhoraEnSede = ahoraEnSede()): string[] {
  if (date < ahora.date) return [];
  const desde = date === ahora.date ? ahora.minutes : 0;
  const inicios: string[] = [];
  for (let m = 0; m < 23 * 60 + 30; m += PASO_MINUTOS) if (m >= desde) inicios.push(aHHmm(m));
  return inicios;
}

/** Fines de franja posibles para `start`: múltiplos de 30 minutos, duración de 8 horas o menos, dentro del día. */
export function finesPosibles(start: string): string[] {
  const inicio = aMinutos(start);
  const fines: string[] = [];
  for (let m = inicio + PASO_MINUTOS; m <= Math.min(inicio + DURACION_MAXIMA_MINUTOS, 23 * 60 + 30); m += PASO_MINUTOS) {
    fines.push(aHHmm(m));
  }
  return fines;
}

export function esFranjaElegible(date: string, start: string, end: string, ahora: AhoraEnSede = ahoraEnSede()): boolean {
  return iniciosElegibles(date, ahora).includes(start) && finesPosibles(start).includes(end);
}
