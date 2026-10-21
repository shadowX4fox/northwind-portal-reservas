import { ApiProblem, NotAuthenticated, ServiceUnavailable } from '../api/client';

const POR_CODIGO: Record<string, string> = {
  UNAUTHENTICATED: 'Tu sesión venció. Te llevamos a iniciar sesión de nuevo.',
  FORBIDDEN: 'No autorizado.',
  VALIDATION_FAILED: 'Los datos no son válidos.',
  BOOKING_NOT_FOUND: 'La reserva no existe.',
  ROOM_OCCUPIED: 'La sala ya está ocupada en esa franja.',
  DAILY_LIMIT_REACHED: 'Alcanzaste el límite de 3 reservas futuras para ese día.',
  BOOKING_IN_PROGRESS: 'La reserva ya está en curso y no se puede cancelar.',
};

export function mensajeDeError(error: unknown): string {
  if (error instanceof NotAuthenticated) return POR_CODIGO.UNAUTHENTICATED;
  if (error instanceof ApiProblem) {
    const base = (error.code && POR_CODIGO[error.code]) || `Error inesperado del Servicio de Reservas (${error.status}).`;
    return error.code === 'VALIDATION_FAILED' && error.detail ? `${base} ${error.detail}` : base;
  }
  if (error instanceof ServiceUnavailable) return 'El Servicio de Reservas no está disponible. Inténtalo de nuevo.';
  return 'Error inesperado.';
}

export const EQUIPAMIENTO: Record<string, string> = {
  screen: 'Pantalla',
  videoconference: 'Videoconferencia',
  whiteboard: 'Pizarra',
};

export const ESTADO: Record<string, string> = { confirmed: 'Confirmada', cancelled: 'Cancelada' };
