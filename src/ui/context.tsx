import { createContext, useContext } from 'react';
import type { ServicioDeReservasClient } from '../api/client';

export const ClientContext = createContext<ServicioDeReservasClient | null>(null);

export function useClient(): ServicioDeReservasClient {
  const client = useContext(ClientContext);
  if (!client) throw new Error('ServicioDeReservasClient no disponible');
  return client;
}
