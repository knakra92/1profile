import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { api, loadToken, setToken, setUnauthorizedHandler } from './api';
import { AccessRequest, ScopeCatalog, User } from './types';

type Session = {
  ready: boolean;
  user: User | null;
  scopes: ScopeCatalog;
  pending: AccessRequest[];
  refreshPending: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (full_name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const Ctx = createContext<Session>(null as any);
export const useSession = () => useContext(Ctx);

const PENDING_POLL_MS = 5000;
// Dev/demo only: EXPO_PUBLIC_DEMO_LOGIN=alex@demo.com:demo1234 signs in automatically when signed out.
const DEMO_LOGIN = __DEV__ ? process.env.EXPO_PUBLIC_DEMO_LOGIN : undefined;

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [scopes, setScopes] = useState<ScopeCatalog>({});
  const [pending, setPending] = useState<AccessRequest[]>([]);

  const logout = useCallback(async () => {
    await setToken(null);
    setUser(null);
    setPending([]);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    (async () => {
      try {
        if (await loadToken()) setUser(await api<User>('/auth/me'));
        else if (DEMO_LOGIN) {
          const [email, password] = DEMO_LOGIN.split(':');
          const res = await api<{ access_token: string; user: User }>('/auth/login', { body: { email, password } });
          await setToken(res.access_token);
          setUser(res.user);
        }
      } catch {
        await setToken(null);
      } finally {
        setReady(true);
      }
    })();
  }, [logout]);

  const refreshPending = useCallback(async () => {
    try {
      setPending(await api<AccessRequest[]>('/me/requests?status=pending'));
    } catch {
      // keep the last known list; the screens surface errors themselves
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    api<ScopeCatalog>('/me/scopes').then(setScopes).catch(() => {});
    // refreshPending only sets state after awaiting the API.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshPending();
    const t = setInterval(refreshPending, PENDING_POLL_MS);
    return () => clearInterval(t);
  }, [user, refreshPending]);

  const accept = async (res: { access_token: string; user: User }) => {
    if (res.user.role !== 'member') throw new Error('This app is for 1Profile members. Provider staff use the web portal.');
    await setToken(res.access_token);
    setUser(res.user);
  };

  const login = async (email: string, password: string) =>
    accept(await api('/auth/login', { body: { email, password } }));
  const register = async (full_name: string, email: string, password: string) =>
    accept(await api('/auth/register', { body: { full_name, email, password } }));

  return (
    <Ctx.Provider value={{ ready, user, scopes, pending, refreshPending, login, register, logout }}>
      {children}
    </Ctx.Provider>
  );
}
