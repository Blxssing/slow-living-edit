import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type StaffRole = "CEO" | "HR" | "SALES";

interface AccessState {
  roles: StaffRole[];
  permissions: string[];
  status: "ACTIVE" | "SUSPENDED" | "DISABLED" | null;
}

interface AuthContextValue extends AccessState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isStaff: boolean;
  can: (permission: string) => boolean;
  signOut: () => Promise<void>;
  refreshAccess: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const EMPTY: AccessState = { roles: [], permissions: [], status: null };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [access, setAccess] = useState<AccessState>(EMPTY);
  const [loading, setLoading] = useState(true);

  // Authoritative: role + permissions come from the database, never the client.
  const loadAccess = async () => {
    const { data, error } = await supabase.rpc("my_access");
    if (error || !data) {
      setAccess(EMPTY);
      return;
    }
    const rows = data as { role: string; permission_key: string; account_status: string }[];
    setAccess({
      roles: [...new Set(rows.map((r) => r.role))] as StaffRole[],
      permissions: [...new Set(rows.map((r) => r.permission_key))],
      status: (rows[0]?.account_status as AccessState["status"]) ?? null,
    });
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      if (!nextSession) {
        setAccess(EMPTY);
        setLoading(false);
        return;
      }
      setTimeout(() => {
        loadAccess().finally(() => setLoading(false));
      }, 0);
    });

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (data.session) {
        loadAccess().finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      loading,
      ...access,
      isStaff: access.roles.length > 0,
      can: (permission: string) => access.permissions.includes(permission),
      signOut: async () => {
        try {
          await supabase.functions.invoke("auth-event", { body: { event: "LOGOUT" } });
        } catch {
          /* logging must never block sign-out */
        }
        await supabase.auth.signOut();
        setAccess(EMPTY);
      },
      refreshAccess: loadAccess,
    }),
    [user, session, loading, access],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
