/* Session state for the app, in the spirit of synapse-react-client's
   SynapseContextProvider/useSynapseContext: one provider owns the access
   token, components read it with useAuth().

   The token lives in sessionStorage (as in the demo): it survives reloads and
   the OAuth round-trip, and is gone when the tab closes. */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import {
  completeLogin, fetchUser, startLogin, takeCallback, tokenStore, TokenRejected, type SynapseUser,
} from "./oauth";

type Status = "loading" | "signedOut" | "signedIn";

interface AuthValue {
  status: Status;
  token: string | null;
  user: SynapseUser | null;
  error: string | null;
  signIn: () => void;
  signInWithToken: (pat: string) => Promise<void>;
  signOut: (reason?: string) => void;
}

const AuthContext = createContext<AuthValue | null>(null);

/* The callback must be consumed exactly once per page load — React StrictMode
   runs effects twice in dev, and an authorization code is single-use. */
let bootPromise: Promise<{ token: string | null; error: string | null }> | null = null;
function boot() {
  bootPromise ??= (async () => {
    const cb = takeCallback();
    if (cb?.kind === "error") return { token: null, error: cb.message };
    if (cb?.kind === "code") {
      try {
        const token = await completeLogin(cb.code, cb.state);
        tokenStore.set(token);
        return { token, error: null };
      } catch (e) {
        return { token: null, error: (e as Error).message };
      }
    }
    return { token: tokenStore.get(), error: null };
  })();
  return bootPromise;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<SynapseUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  const signOut = useCallback((reason?: string) => {
    tokenStore.clear();
    setToken(null); setUser(null); setError(reason ?? null); setStatus("signedOut");
  }, []);

  const accept = useCallback(async (t: string) => {
    try {
      const u = await fetchUser(t);
      tokenStore.set(t);
      setToken(t); setUser(u); setError(null); setStatus("signedIn");
    } catch (e) {
      if (e instanceof TokenRejected) return signOut(e.message);
      // Profile lookup failed for another reason (network, Synapse outage):
      // keep the token — the API is the real authority on access.
      tokenStore.set(t);
      setToken(t); setUser({ displayName: "Synapse user" }); setStatus("signedIn");
    }
  }, [signOut]);

  useEffect(() => {
    let live = true;
    boot().then(({ token: t, error: err }) => {
      if (!live) return;
      if (t) void accept(t);
      else { setError(err); setStatus("signedOut"); }
    });
    return () => { live = false; };
  }, [accept]);

  const signInWithToken = useCallback(async (pat: string) => {
    setStatus("loading");
    await accept(pat.trim());
  }, [accept]);

  return (
    <AuthContext.Provider value={{ status, token, user, error, signIn: startLogin, signInWithToken, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

/** For components that only render when signed in. */
export function useToken(): string {
  const { token } = useAuth();
  if (!token) throw new Error("useToken called while signed out");
  return token;
}
