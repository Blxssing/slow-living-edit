import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    if (window.location.hash.includes("type=recovery")) setReady(true);
    return () => sub.subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setMessage("Could not update the password. Request a new reset link.");
      setBusy(false);
      return;
    }
    await supabase.functions.invoke("auth-event", { body: { event: "PASSWORD_CHANGED" } });
    setMessage("Password updated. Redirecting…");
    setTimeout(() => navigate("/staff/login", { replace: true }), 1200);
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold">Set a new password</h1>
      {!ready && (
        <p className="text-sm text-muted-foreground">
          Open this page from the reset link sent to your email.
        </p>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="new-password">New password</Label>
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            minLength={10}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">Minimum 10 characters.</p>
        </div>
        {message && <p className="text-sm text-muted-foreground">{message}</p>}
        <Button type="submit" className="w-full" disabled={busy || !ready}>
          Update password
        </Button>
      </form>
    </main>
  );
}
