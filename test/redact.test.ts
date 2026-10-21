// INV-08 / ADR-004: los logs nunca incluyen tokens.
import { log } from '../src/telemetry/telemetry';

describe('logs del Portal de Reservas', () => {
  it('son JSON con service.name y nivel, y nunca incluyen tokens', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    log('warn', 'fallo con Bearer abc.def.ghi y eyJhbGciOi.eyJzdWIi.firma', { access_token: 'secreto', authorization: 'Bearer x', operation: 'listBookings' });
    const line = spy.mock.calls[0][0] as string;
    const record = JSON.parse(line);
    expect(record['service.name']).toBe('Portal de Reservas');
    expect(record.level).toBe('warn');
    expect(record.operation).toBe('listBookings');
    expect(line).not.toContain('secreto');
    expect(line).not.toContain('abc.def.ghi');
    expect(line).not.toContain('eyJhbGciOi');
    spy.mockRestore();
  });
});
