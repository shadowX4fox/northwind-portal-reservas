// Aceptación de la Especificación de Componente: INV-01, INV-02, INV-03, INV-04, INV-09, INV-10, INV-11.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiProblem, ServiceUnavailable, type Booking, type ServicioDeReservasClient } from '../src/api/client';
import type { Auth } from '../src/auth/auth';
import { recordAvailability } from '../src/telemetry/telemetry';
import { App } from '../src/ui/App';

vi.mock('../src/telemetry/telemetry', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/telemetry/telemetry')>()),
  recordAvailability: vi.fn(),
}));

const AHORA = { date: '2026-10-21', minutes: 8 * 60 + 10 };

function fakeAuth(): Auth {
  return { current: () => ({}), subscribe: () => () => {}, login: vi.fn(), logout: vi.fn() } as unknown as Auth;
}

const booking = (code: string, extra: Partial<Booking> = {}): Booking => ({
  code,
  roomId: 'sala-1',
  site: 'centro',
  date: '2026-10-22',
  start: '09:00',
  end: '10:00',
  subject: 'Comité',
  memberId: 'miembro',
  status: 'confirmed',
  ...extra,
});

function fakeClient(overrides: Partial<Record<keyof ServicioDeReservasClient, unknown>> = {}) {
  return {
    getAvailability: vi.fn(async () => ({
      rooms: [
        { roomId: 'r-grande', name: 'Andes', capacity: 12, equipment: ['screen', 'videoconference'], status: 'free' },
        { roomId: 'r-ocupada', name: 'Caribe', capacity: 2, equipment: [], status: 'occupied' },
        { roomId: 'r-chica', name: 'Pacífico', capacity: 4, equipment: ['whiteboard'], status: 'free' },
      ],
    })),
    createBooking: vi.fn(async () => booking('RS-ABCD1234')),
    listBookings: vi.fn(async (scope?: 'site') => {
      if (scope === 'site') throw new ApiProblem(403, 'FORBIDDEN');
      return [booking('RS-MIA00001')];
    }),
    getBooking: vi.fn(async (code: string) => booking(code)),
    cancelBooking: vi.fn(async (code: string) => booking(code, { status: 'cancelled' })),
    ...overrides,
  } as unknown as ServicioDeReservasClient & { [K in keyof ServicioDeReservasClient]: ReturnType<typeof vi.fn> };
}

function renderApp(client: ReturnType<typeof fakeClient> = fakeClient()) {
  render(<App auth={fakeAuth()} client={client} now={() => AHORA} />);
  return { client, user: userEvent.setup() };
}

describe('Salas', () => {
  it('muestra la disponibilidad por sede, fecha y franja con capacidad y equipamiento; libres primero por capacidad (INV-01)', async () => {
    const { client, user } = renderApp();
    await user.selectOptions(screen.getByLabelText('Sede'), 'norte');
    await user.click(screen.getByRole('button', { name: 'Consultar' }));
    expect(client.getAvailability).toHaveBeenCalledWith({ site: 'norte', date: '2026-10-21', start: '08:30', end: '09:00' });
    const salas = within(await screen.findByRole('list', { name: 'Salas' })).getAllByRole('listitem');
    expect(salas.map((li) => li.textContent)).toEqual([
      expect.stringContaining('Pacífico · 4 personas · Pizarra · Libre'),
      expect.stringContaining('Andes · 12 personas · Pantalla, Videoconferencia · Libre'),
      expect.stringContaining('Caribe · 2 personas · Ocupada'),
    ]);
  });

  it('mide el tiempo hasta ver la disponibilidad (meta p95 ≤ 1 s)', async () => {
    vi.mocked(recordAvailability).mockClear();
    const { user } = renderApp();
    await user.click(screen.getByRole('button', { name: 'Consultar' }));
    await screen.findByRole('list', { name: 'Salas' });
    expect(recordAvailability).toHaveBeenCalledTimes(1);
    expect(vi.mocked(recordAvailability).mock.calls[0][0]).toBeGreaterThanOrEqual(0);
  });

  it('no mide la disponibilidad cuando la consulta falla', async () => {
    vi.mocked(recordAvailability).mockClear();
    const { user } = renderApp(fakeClient({ getAvailability: vi.fn(async () => { throw new ServiceUnavailable(); }) }));
    await user.click(screen.getByRole('button', { name: 'Consultar' }));
    await screen.findByRole('alert');
    expect(recordAvailability).not.toHaveBeenCalled();
  });

  it('no ofrece franjas anteriores a la hora actual de la sede (INV-10)', () => {
    renderApp();
    const inicios = within(screen.getByLabelText('Desde')).getAllByRole('option').map((o) => o.textContent);
    expect(inicios[0]).toBe('08:30');
    expect(inicios).not.toContain('08:00');
  });

  it('sin salas libres muestra las franjas sugeridas y permite usarlas', async () => {
    const client = fakeClient({
      getAvailability: vi
        .fn()
        .mockResolvedValueOnce({ rooms: [{ roomId: 'x', name: 'Caribe', capacity: 2, status: 'occupied' }], suggestedSlots: [{ start: '10:00', end: '10:30' }] })
        .mockResolvedValueOnce({ rooms: [{ roomId: 'x', name: 'Caribe', capacity: 2, status: 'free' }] }),
    });
    const { user } = renderApp(client);
    await user.click(screen.getByRole('button', { name: 'Consultar' }));
    await user.click(within(await screen.findByRole('list', { name: 'Franjas sugeridas' })).getByRole('button', { name: '10:00–10:30' }));
    expect(client.getAvailability).toHaveBeenLastCalledWith({ site: 'centro', date: '2026-10-21', start: '10:00', end: '10:30' });
  });

  it('reserva una sala libre y muestra el código de reserva (INV-02); el reintento repite la Idempotency-Key', async () => {
    const client = fakeClient({
      createBooking: vi.fn().mockRejectedValueOnce(new ServiceUnavailable('caído')).mockResolvedValueOnce(booking('RS-ABCD1234')),
    });
    const { user } = renderApp(client);
    await user.click(screen.getByRole('button', { name: 'Consultar' }));
    await user.click(await screen.findByRole('button', { name: 'Reservar Pacífico' }));
    await user.type(screen.getByLabelText('Asunto'), 'Comité');
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('El Servicio de Reservas no está disponible');
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(await screen.findByTestId('codigo-reserva')).toHaveTextContent('RS-ABCD1234');

    const [primera, segunda] = client.createBooking.mock.calls;
    expect(primera[0]).toEqual({ roomId: 'r-chica', date: '2026-10-21', start: '08:30', end: '09:00', subject: 'Comité' });
    expect(primera[1]).toMatch(/^[0-9a-f-]{36}$/);
    expect(segunda[1]).toBe(primera[1]);
  });

  it('una nueva confirmación usa una Idempotency-Key nueva (ADR-103)', async () => {
    const { client, user } = renderApp();
    await user.click(screen.getByRole('button', { name: 'Consultar' }));
    for (const sala of ['Pacífico', 'Andes']) {
      await user.click(await screen.findByRole('button', { name: `Reservar ${sala}` }));
      await user.click(screen.getByRole('button', { name: 'Confirmar' }));
      await screen.findByTestId('codigo-reserva');
      await user.click(screen.getByRole('button', { name: 'Cerrar' }));
    }
    expect(client.createBooking.mock.calls[0][1]).not.toBe(client.createBooking.mock.calls[1][1]);
  });

  it('muestra el rechazo de negocio por sala ocupada', async () => {
    const { user } = renderApp(fakeClient({ createBooking: vi.fn().mockRejectedValue(new ApiProblem(409, 'ROOM_OCCUPIED')) }));
    await user.click(screen.getByRole('button', { name: 'Consultar' }));
    await user.click(await screen.findByRole('button', { name: 'Reservar Pacífico' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('La sala ya está ocupada en esa franja.');
  });

  it('muestra el rechazo por sala inexistente', async () => {
    const { user } = renderApp(fakeClient({ createBooking: vi.fn().mockRejectedValue(new ApiProblem(404, 'ROOM_NOT_FOUND')) }));
    await user.click(screen.getByRole('button', { name: 'Consultar' }));
    await user.click(await screen.findByRole('button', { name: 'Reservar Pacífico' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('La sala no existe.');
  });

  it('admite un asunto de hasta 120 caracteres y no más (contrato 1.3.0, BookingRequest.subject)', async () => {
    const { client, user } = renderApp();
    await user.click(screen.getByRole('button', { name: 'Consultar' }));
    await user.click(await screen.findByRole('button', { name: 'Reservar Pacífico' }));
    await user.type(screen.getByLabelText('Asunto'), 'a'.repeat(125));
    expect(screen.getByLabelText('Asunto')).toHaveValue('a'.repeat(120));
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));
    await screen.findByTestId('codigo-reserva');
    expect(client.createBooking.mock.calls[0][0].subject).toBe('a'.repeat(120));
  });
});

describe('Mis reservas', () => {
  it('lista las reservas futuras del miembro y permite cancelarlas (INV-03)', async () => {
    const { client, user } = renderApp();
    await user.click(screen.getByRole('button', { name: 'Mis reservas' }));
    const lista = await screen.findByRole('list', { name: 'Mis reservas' });
    expect(lista).toHaveTextContent('RS-MIA00001 · Centro · 2026-10-22 09:00–10:00 · Comité · Confirmada');
    await user.click(screen.getByRole('button', { name: 'Cancelar RS-MIA00001' }));
    expect(client.getBooking).toHaveBeenCalledWith('RS-MIA00001');
    await user.click(await screen.findByRole('button', { name: 'Confirmar cancelación' }));
    expect(client.cancelBooking).toHaveBeenCalledWith('RS-MIA00001', undefined);
    expect(await screen.findByText('Reserva RS-MIA00001 cancelada.')).toBeInTheDocument();
  });

  it('muestra en cada reserva cancelada la fecha de cancelación y, cuando existe, el motivo (INV-11)', async () => {
    const client = fakeClient({
      listBookings: vi.fn(async (scope?: 'site') => {
        if (scope === 'site') throw new ApiProblem(403, 'FORBIDDEN');
        return [
          booking('RS-CANC0001', { status: 'cancelled', cancelledAt: '2026-10-21T14:05:00Z', cancellationReason: 'Sala en mantenimiento' }),
          booking('RS-CANC0002', { status: 'cancelled', cancelledAt: '2026-10-21T03:30:00Z' }),
        ];
      }),
    });
    const { user } = renderApp(client);
    await user.click(screen.getByRole('button', { name: 'Mis reservas' }));
    const [conMotivo, sinMotivo] = within(await screen.findByRole('list', { name: 'Mis reservas' })).getAllByRole('listitem');
    // `cancelledAt` sigue en ISO 8601, como lo devuelve el servicio (ADR-110, fuera de alcance)
    expect(conMotivo).toHaveTextContent('RS-CANC0001 · Centro · 2026-10-22 09:00–10:00 · Comité · Cancelada · Cancelada el 2026-10-21T14:05:00Z · Motivo: Sala en mantenimiento');
    expect(sinMotivo).toHaveTextContent('Cancelada · Cancelada el 2026-10-21T03:30:00Z');
    expect(sinMotivo).not.toHaveTextContent('Motivo');
    expect(screen.queryByRole('button', { name: /^Cancelar RS-CANC/ })).not.toBeInTheDocument();
  });

  it('muestra "reserva en curso" cuando el servicio la rechaza', async () => {
    const { user } = renderApp(fakeClient({ cancelBooking: vi.fn().mockRejectedValue(new ApiProblem(409, 'BOOKING_IN_PROGRESS')) }));
    await user.click(screen.getByRole('button', { name: 'Mis reservas' }));
    await user.click(await screen.findByRole('button', { name: 'Cancelar RS-MIA00001' }));
    await user.click(await screen.findByRole('button', { name: 'Confirmar cancelación' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('La reserva ya está en curso');
  });
});

describe('Reservas de la sede', () => {
  it('no aparece para un miembro sin rol recepcion (el servicio responde 403)', async () => {
    const { client } = renderApp();
    await waitFor(() => expect(client.listBookings).toHaveBeenCalledWith('site'));
    expect(screen.queryByRole('button', { name: 'Reservas de la sede' })).not.toBeInTheDocument();
  });

  it('el recepcionista cancela cualquier reserva de su sede con motivo (INV-04)', async () => {
    const client = fakeClient({
      listBookings: vi.fn(async (scope?: 'site') => (scope === 'site' ? [booking('RS-OTRO0001', { memberId: 'otro' })] : [])),
    });
    const { user } = renderApp(client);
    await user.click(await screen.findByRole('button', { name: 'Reservas de la sede' }));
    await user.click(await screen.findByRole('button', { name: 'Cancelar RS-OTRO0001' }));
    const confirmar = await screen.findByRole('button', { name: 'Confirmar cancelación' });
    expect(confirmar).toBeDisabled();
    await user.type(screen.getByLabelText('Motivo'), 'corto');
    expect(confirmar).toBeDisabled();
    await user.type(screen.getByLabelText('Motivo'), ' — mantenimiento');
    await user.click(confirmar);
    expect(client.cancelBooking).toHaveBeenCalledWith('RS-OTRO0001', { reason: 'corto — mantenimiento' });
  });
});

describe('datos', () => {
  it('no persiste ningún dato de negocio en el navegador (INV-09)', async () => {
    const { user } = renderApp();
    await user.click(screen.getByRole('button', { name: 'Consultar' }));
    await user.click(await screen.findByRole('button', { name: 'Reservar Pacífico' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));
    await screen.findByTestId('codigo-reserva');
    await user.click(screen.getByRole('button', { name: 'Cerrar' }));
    await user.click(screen.getByRole('button', { name: 'Mis reservas' }));
    await screen.findByRole('list', { name: 'Mis reservas' });
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });
});
