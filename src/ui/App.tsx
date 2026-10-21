import { useEffect, useState } from 'react';
import type { ServicioDeReservasClient } from '../api/client';
import type { Auth } from '../auth/auth';
import type { AhoraEnSede } from '../time/sedeClock';
import { ClientContext } from './context';
import { ReservasPage } from './ReservasPage';
import { SalasPage } from './SalasPage';

type Vista = 'salas' | 'mis-reservas' | 'reservas-sede';

export function App({ auth, client, now }: { auth: Auth; client: ServicioDeReservasClient; now?: () => AhoraEnSede }) {
  const [autenticado, setAutenticado] = useState(() => auth.current() !== null);
  const [vista, setVista] = useState<Vista>('salas');
  const [recepcion, setRecepcion] = useState(false);

  useEffect(() => auth.subscribe((user) => setAutenticado(user !== null)), [auth]);

  // Recepción = el Servicio de Reservas acepta `scope=site` para este token (rol `recepcion` y `sede`, ADR-105).
  // El portal no interpreta los claims: cualquier respuesta que no sea 200 deja la vista de sede cerrada.
  useEffect(() => {
    if (!autenticado) return;
    let vigente = true;
    client.listBookings('site').then(
      () => vigente && setRecepcion(true),
      () => vigente && setRecepcion(false),
    );
    return () => {
      vigente = false;
    };
  }, [autenticado, client]);

  if (!autenticado) {
    return (
      <main>
        <h1>Portal de Reservas</h1>
        <p>Inicia sesión con tu cuenta Northwind para reservar salas.</p>
        <button type="button" onClick={() => void auth.login()}>
          Iniciar sesión
        </button>
      </main>
    );
  }

  return (
    <ClientContext.Provider value={client}>
      <header>
        <h1>Portal de Reservas</h1>
        <nav aria-label="Secciones">
          <button type="button" aria-pressed={vista === 'salas'} onClick={() => setVista('salas')}>
            Salas
          </button>
          <button type="button" aria-pressed={vista === 'mis-reservas'} onClick={() => setVista('mis-reservas')}>
            Mis reservas
          </button>
          {recepcion && (
            <button type="button" aria-pressed={vista === 'reservas-sede'} onClick={() => setVista('reservas-sede')}>
              Reservas de la sede
            </button>
          )}
          <button type="button" onClick={() => void auth.logout()}>
            Cerrar sesión
          </button>
        </nav>
      </header>
      <main>
        {vista === 'salas' && <SalasPage now={now} />}
        {vista === 'mis-reservas' && <ReservasPage recepcion={recepcion} />}
        {vista === 'reservas-sede' && recepcion && <ReservasPage scope="site" recepcion />}
      </main>
    </ClientContext.Provider>
  );
}
