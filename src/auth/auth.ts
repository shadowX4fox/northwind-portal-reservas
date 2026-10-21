// Portal de Reservas → Proveedor de Identidad Northwind (I-01).
// Flujo de código de autorización con PKCE (ADR-002, INV-05). El userStore guarda la sesión en sessionStorage
// para que una recarga de la pestaña no obligue a iniciar sesión de nuevo.
// El token de acceso dura 5 minutos y se renueva en silencio con el token de refresco (ADR-104).
import { UserManager, WebStorageStateStore, type User, type UserManagerSettings } from 'oidc-client-ts';
import { log } from '../telemetry/telemetry';

// Amenazas del límite TB-02 (security, § Amenazas), cuya mitigación vive en el Proveedor de Identidad Northwind:
// TODO(architecture): T4-R "Inicio de sesión sin rastro verificable" — "Registro de eventos de inicio de sesión en
//   Keycloak 25 no documentado (docs/07 § 9.5)". El portal registra "Inicio de sesión completado" sin datos personales.
// TODO(architecture): T5-D "Fuerza bruta o inundación del endpoint de inicio de sesión" — "Protección contra fuerza bruta
//   y límite de tasa de Keycloak no documentados". El portal no implementa inicio de sesión propio (ADR-002).
// TODO(architecture): T6-E "Asignación indebida del rol recepcion o del atributo sede" — "el proceso de alta y revisión
//   de roles en Keycloak no está documentado". El portal no lee esos claims: la vista de sede depende de la respuesta
//   del Servicio de Reservas a `scope=site` (ADR-105).
export const CALLBACK_PATH = '/auth/callback';

export function authSettings(authority: string, clientId: string, origin: string = window.location.origin): UserManagerSettings {
  return {
    authority,
    client_id: clientId,
    redirect_uri: `${origin}${CALLBACK_PATH}`,
    post_logout_redirect_uri: `${origin}/`,
    response_type: 'code', // código de autorización; oidc-client-ts añade PKCE (S256) a cada solicitud
    scope: 'openid',
    userStore: new WebStorageStateStore({ store: window.sessionStorage }),
    // El stateStore solo guarda, entre la redirección y el callback, el `state` y el verificador PKCE
    // de una solicitud en curso — ningún token; oidc-client-ts lo borra al procesar el callback.
    stateStore: new WebStorageStateStore({ store: window.sessionStorage }),
    automaticSilentRenew: true,
    loadUserInfo: false,
    // TODO(architecture): semántica de fallo de I-01 no documentada — "| timeout | [NOT DOCUMENTED] | [NOT DOCUMENTED] |",
    //   "| downstream no disponible | [NOT DOCUMENTED] | — |", "| fallo parcial | [NOT DOCUMENTED] | [NOT DOCUMENTED] |",
    //   "| versiones incompatibles | [NOT DOCUMENTED] | [NOT DOCUMENTED] |"
    //   (interface:portal-de-reservas→proveedor-de-identidad-northwind, líneas 112–116). Sin timeout ni reintento propios:
    //   un fallo deja al usuario sin sesión ("sin sesión no hay operación", F-01 fase 1).
  };
}

export class Auth {
  private user: User | null = null;
  private readonly listeners = new Set<(user: User | null) => void>();

  constructor(private readonly manager: UserManager) {
    manager.events.addUserLoaded((user) => this.set(user));
    manager.events.addUserUnloaded(() => this.set(null));
    manager.events.addSilentRenewError((error) => {
      log('warn', 'Renovación silenciosa fallida; se pide un nuevo inicio de sesión', { error: error.message });
      void this.login();
    });
  }

  /** Completa el callback OIDC si la URL lo es; si no, recupera la sesión guardada en la pestaña. */
  async start(location: Location = window.location): Promise<User | null> {
    if (location.pathname === CALLBACK_PATH) {
      const user = await this.manager.signinRedirectCallback(location.href);
      window.history.replaceState(null, '', '/');
      log('info', 'Inicio de sesión completado');
      this.set(user);
      return user;
    }
    this.set(await this.manager.getUser());
    return this.user;
  }

  /** Falla de autenticación: el Portal de Reservas redirige al inicio de sesión (I-01). */
  login(): Promise<void> {
    return this.manager.signinRedirect();
  }

  logout(): Promise<void> {
    return this.manager.signoutRedirect();
  }

  /** Token de acceso vigente, o null: sin token no se llama al Servicio de Reservas (deny by default). */
  accessToken(): string | null {
    if (!this.user || this.user.expired) return null;
    return this.user.access_token;
  }

  current(): User | null {
    return this.user;
  }

  subscribe(listener: (user: User | null) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private set(user: User | null): void {
    this.user = user;
    for (const listener of this.listeners) listener(user);
  }
}
