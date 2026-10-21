// INV-10 / ADR-110: "ahora" en America/Bogota, nunca la zona del navegador.
import { ahoraEnSede, esFranjaElegible, finesPosibles, iniciosElegibles } from '../src/time/sedeClock';

describe('reloj de la sede (ADR-110)', () => {
  it('calcula la hora actual en America/Bogota (UTC−5) sin importar la zona del navegador', () => {
    // 2026-10-21T03:15Z es 2026-10-20 22:15 en Bogotá
    expect(ahoraEnSede(new Date('2026-10-21T03:15:00Z'))).toEqual({ date: '2026-10-20', minutes: 22 * 60 + 15 });
  });

  it('no deja elegir una franja anterior a la hora actual de la sede (INV-10)', () => {
    const ahora = { date: '2026-10-20', minutes: 10 * 60 + 5 };
    const inicios = iniciosElegibles('2026-10-20', ahora);
    expect(inicios[0]).toBe('10:30');
    expect(inicios).not.toContain('10:00');
    expect(esFranjaElegible('2026-10-20', '10:00', '11:00', ahora)).toBe(false);
    expect(esFranjaElegible('2026-10-20', '10:30', '11:00', ahora)).toBe(true);
    expect(iniciosElegibles('2026-10-19', ahora)).toEqual([]);
    expect(iniciosElegibles('2026-10-21', ahora)[0]).toBe('00:00');
  });

  it('ofrece fines en múltiplos de 30 minutos y de 8 horas o menos', () => {
    const fines = finesPosibles('09:00');
    expect(fines[0]).toBe('09:30');
    expect(fines.at(-1)).toBe('17:00');
    expect(esFranjaElegible('2026-10-21', '09:00', '17:30', { date: '2026-10-20', minutes: 0 })).toBe(false);
    expect(esFranjaElegible('2026-10-21', '09:15', '10:00', { date: '2026-10-20', minutes: 0 })).toBe(false);
  });
});
