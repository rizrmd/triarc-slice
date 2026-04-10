export interface SessionUser {
  playerId: string;
  displayName: string;
  email: string;
  sessionToken: string;
}

export interface SessionState {
  authenticated: boolean;
  user?: SessionUser;
}

export interface GoogleCredentialResponse {
  credential: string;
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize: (options: {
            client_id: string;
            callback: (response: GoogleCredentialResponse) => void;
            auto_select?: boolean;
            ux_mode?: "popup" | "redirect";
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              type?: "standard" | "icon";
              theme?: "outline" | "filled_blue" | "filled_black";
              size?: "large" | "medium" | "small";
              text?: "signin_with" | "signup_with" | "continue_with" | "signin";
              shape?: "rectangular" | "pill" | "circle" | "square";
              width?: number;
              logo_alignment?: "left" | "center";
            },
          ) => void;
          prompt: () => void;
          disableAutoSelect: () => void;
        };
      };
    };
  }
}

const GOOGLE_SCRIPT_ID = "google-identity-services";
const STORAGE_AUTH = "vg_auth";
const STORAGE_ID_TOKEN = "vg_id_token";
const wsUrl = import.meta.env.VITE_WS_URL?.trim() || "wss://sg.vangambit.com/ws";
const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() || "";
const explicitCheckoutUrl = import.meta.env.VITE_CHECKOUT_URL?.trim() || "";

function parseStoredSession(): SessionState | null {
  const saved = window.localStorage.getItem(STORAGE_AUTH);
  if (!saved) {
    return null;
  }

  try {
    const payload = JSON.parse(saved) as Partial<SessionUser>;
    if (
      typeof payload.playerId !== "string" ||
      typeof payload.displayName !== "string" ||
      typeof payload.email !== "string" ||
      typeof payload.sessionToken !== "string"
    ) {
      window.localStorage.removeItem(STORAGE_AUTH);
      return null;
    }

    return {
      authenticated: true,
      user: {
        playerId: payload.playerId,
        displayName: payload.displayName,
        email: payload.email,
        sessionToken: payload.sessionToken,
      },
    };
  } catch {
    window.localStorage.removeItem(STORAGE_AUTH);
    return null;
  }
}

function storeSession(user: SessionUser, idToken?: string): SessionState {
  window.localStorage.setItem(STORAGE_AUTH, JSON.stringify(user));
  if (idToken) {
    window.localStorage.setItem(STORAGE_ID_TOKEN, idToken);
  }
  return { authenticated: true, user };
}

function clearStoredAuth() {
  window.localStorage.removeItem(STORAGE_AUTH);
  window.localStorage.removeItem(STORAGE_ID_TOKEN);
}

export function getInitialSession(): SessionState | null {
  return parseStoredSession();
}

export function getStoredGoogleIdToken(): string {
  return window.localStorage.getItem(STORAGE_ID_TOKEN) ?? "";
}

export function hasGoogleClientId(): boolean {
  return googleClientId.length > 0;
}

export function getCheckoutUrl(): string {
  return explicitCheckoutUrl;
}

export async function loadGoogleIdentityScript(): Promise<void> {
  if (!hasGoogleClientId()) {
    throw new Error("Missing VITE_GOOGLE_CLIENT_ID");
  }

  if (window.google?.accounts?.id) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(GOOGLE_SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Failed to load Google script")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = GOOGLE_SCRIPT_ID;
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google script"));
    document.head.appendChild(script);
  });
}

export function renderGoogleButton(
  element: HTMLElement,
  onCredential: (response: GoogleCredentialResponse) => void,
) {
  const googleId = window.google?.accounts?.id;
  if (!googleId || !hasGoogleClientId()) {
    throw new Error("Google Identity Services is not available");
  }

  element.innerHTML = "";
  googleId.initialize({
    client_id: googleClientId,
    callback: onCredential,
    auto_select: false,
    ux_mode: "popup",
  });
  googleId.renderButton(element, {
    type: "standard",
    theme: "filled_black",
    size: "large",
    text: "continue_with",
    shape: "pill",
    width: 280,
    logo_alignment: "left",
  });
}

export async function authenticateViaWebSocket(idToken?: string): Promise<SessionState> {
  const remembered = parseStoredSession();
  const authToken = idToken ?? getStoredGoogleIdToken();
  const sessionToken = remembered?.user?.sessionToken ?? "";

  if (!authToken && !sessionToken) {
    throw new Error("No Google credential or session token available");
  }

  const state = await new Promise<SessionState>((resolve, reject) => {
    const socket = new WebSocket(wsUrl);
    let settled = false;

    function finish(fn: () => void) {
      if (settled) {
        return;
      }
      settled = true;
      fn();
    }

    socket.onopen = () => {
      socket.send(
        JSON.stringify({
          type: "authenticate",
          id_token: authToken,
          session_token: sessionToken,
        }),
      );
    };

    socket.onerror = () => {
      finish(() => reject(new Error("Failed to connect to the Vanguard's Gambit server")));
    };

    socket.onclose = () => {
      if (!settled) {
        finish(() => reject(new Error("Connection closed before authentication completed")));
      }
    };

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as Record<string, unknown>;

        if (message.type === "authenticated") {
          const user: SessionUser = {
            playerId: String(message.player_id ?? ""),
            displayName: String(message.display_name ?? "Player"),
            email: String(message.email ?? ""),
            sessionToken: String(message.session_token ?? ""),
          };
          finish(() => resolve(storeSession(user, authToken || undefined)));
          socket.close();
          return;
        }

        if (message.type === "auth_error") {
          clearStoredAuth();
          finish(() => reject(new Error(String(message.message ?? "Authentication failed"))));
          socket.close();
        }
      } catch {
        finish(() => reject(new Error("Received invalid auth response from server")));
        socket.close();
      }
    };
  });

  return state;
}

export function logout() {
  clearStoredAuth();
  window.google?.accounts?.id?.disableAutoSelect();
}
