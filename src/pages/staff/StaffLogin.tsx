import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function StaffLogin() {
  const navigate = useNavigate();
  const { user, isStaff, loading: authLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"login" | "reset">("login");

  if (!authLoading && user && isStaff) return <Navigate to="/staff" replace />;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      // Generic message — never reveals whether the account exists.
      await supabase.functions.invoke("auth-event", {
        body: { event: "LOGIN_FAILURE", email },
      });
      setMessage("Invalid credentials.");
      setBusy(false);
      return;
    }

    // Server decides identity, role, permissions and account status.
    const { data, error: sessionError } = await supabase.functions.invoke("staff-session");
    if (sessionError || !data?.is_staff) {
      await supabase.auth.signOut();
      setMessage("This account does not have staff access.");
      setBusy(false);
      return;
    }

    navigate("/staff", { replace: true });
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    await supabase.functions.invoke("auth-event", {
      body: { event: "PASSWORD_RESET_REQUESTED", email },
    });
    setMessage("If that address belongs to a staff account, a reset link has been sent.");
    setBusy(false);
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold">Mia Bella staff portal</h1>
        <p className="text-sm text-muted-foreground">Authorized personnel only.</p>
      </header>

      <form onSubmit={mode === "login" ? handleLogin : handleReset} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Work email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        {mode === "login" && (
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        )}

        {message && <p className="text-sm text-muted-foreground">{message}</p>}

        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Send reset link"}
        </Button>

        <button
          type="button"
          className="text-xs text-muted-foreground underline"
          onClick={() => {
            setMode(mode === "login" ? "reset" : "login");
            setMessage(null);
          }}
        >
          {mode === "login" ? "Forgot password?" : "Back to sign in"}
        </button>
      </form>
    </main>
  );
}
