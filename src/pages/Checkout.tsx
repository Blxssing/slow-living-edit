import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CheckCircle2, Loader2, Lock, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { DELIVERY_FEE, deliveryFeeFor, useCart } from "@/hooks/useCart";
import { formatKES } from "@/lib/api/catalog";

const normalisePhone = (input: string) => {
  const digits = input.replace(/\D/g, "");
  if (digits.startsWith("254")) return digits;
  if (digits.startsWith("0")) return `254${digits.slice(1)}`;
  if (digits.length === 9) return `254${digits}`;
  return digits;
};

type Stage = "form" | "pending" | "done";

const Checkout = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { items, clearCart } = useCart();
  const subtotal = useCart((s) => s.getSubtotal());
  const delivery = deliveryFeeFor(subtotal);
  const total = subtotal + delivery;

  const [stage, setStage] = useState<Stage>("form");
  const [submitting, setSubmitting] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);

  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [credentials, setCredentials] = useState({ email: "", password: "" });
  const [authBusy, setAuthBusy] = useState(false);

  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    address_line_1: "",
    address_line_2: "",
    city: "",
    notes: "",
  });

  useEffect(() => {
    document.title = "Checkout | Mia Bella Beauty";
  }, []);

  const onChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthBusy(true);
    try {
      if (authMode === "signup") {
        const { error } = await supabase.auth.signUp({
          email: credentials.email,
          password: credentials.password,
          options: { emailRedirectTo: `${window.location.origin}/checkout` },
        });
        if (error) throw error;
        toast.success("Account created. You can continue with your order.");
      } else {
        const { error } = await supabase.auth.signInWithPassword(credentials);
        if (error) throw error;
        toast.success("Welcome back!");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const phone = normalisePhone(form.phone);
    if (!/^254[0-9]{9}$/.test(phone)) {
      toast.error("Enter a valid Kenyan mobile number, e.g. 0712 345 678");
      return;
    }

    setSubmitting(true);
    try {
      const { data: orderData, error: orderError } = await supabase.functions.invoke(
        "create-order",
        {
          body: {
            items: items.map((i) => ({ variant_id: i.variantId, quantity: i.quantity })),
            shipping_address: {
              full_name: form.full_name,
              phone,
              address_line_1: form.address_line_1,
              address_line_2: form.address_line_2 || undefined,
              city: form.city,
              country: "Kenya",
            },
            notes: form.notes || undefined,
          },
        },
      );
      if (orderError) throw orderError;

      const newOrderId = (orderData as { order?: { id: string } })?.order?.id;
      if (!newOrderId) throw new Error("Order could not be created");
      setOrderId(newOrderId);

      const { error: payError } = await supabase.functions.invoke("mpesa-initiate", {
        body: { order_id: newOrderId, phone_number: phone },
      });
      if (payError) throw payError;

      clearCart();
      setStage("pending");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "We couldn’t place your order. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (stage === "pending") {
    return (
      <Layout>
        <div className="container-narrow py-28 text-center">
          <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-secondary">
            <Smartphone className="h-8 w-8 text-primary" />
          </div>
          <h1 className="mt-6 font-serif text-4xl">Check your phone</h1>
          <p className="mt-3 text-muted-foreground">
            We sent an M-Pesa payment request to {normalisePhone(form.phone)}. Enter your PIN to
            complete the order.
          </p>
          {orderId && (
            <p className="mt-2 text-xs text-muted-foreground">Order reference: {orderId.slice(0, 8)}</p>
          )}
          <div className="mt-8 flex justify-center gap-3">
            <Button asChild variant="outline" className="rounded-full">
              <Link to="/products">Keep shopping</Link>
            </Button>
            <Button className="rounded-full" onClick={() => navigate("/")}>
              Done
            </Button>
          </div>
        </div>
      </Layout>
    );
  }

  if (items.length === 0) {
    return (
      <Layout>
        <div className="container-narrow py-28 text-center">
          <h1 className="font-serif text-4xl">Nothing to check out</h1>
          <p className="mt-3 text-muted-foreground">Your bag is empty.</p>
          <Button asChild className="mt-8 rounded-full">
            <Link to="/products">Start shopping</Link>
          </Button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <section className="border-b border-border bg-secondary">
        <div className="container-wide py-12">
          <h1 className="font-serif text-4xl md:text-5xl">Checkout</h1>
          <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
            <Lock className="h-4 w-4" /> Secure M-Pesa payment
          </p>
        </div>
      </section>

      <div className="container-wide grid gap-12 py-12 lg:grid-cols-12">
        <div className="lg:col-span-7">
          {!user && !authLoading ? (
            <form onSubmit={handleAuth} className="max-w-md space-y-4">
              <h2 className="font-serif text-2xl">
                {authMode === "signin" ? "Sign in to continue" : "Create your account"}
              </h2>
              <p className="text-sm text-muted-foreground">
                We keep your orders and delivery details in one place.
              </p>
              <div>
                <label htmlFor="email" className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Email
                </label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={credentials.email}
                  onChange={(e) => setCredentials((c) => ({ ...c, email: e.target.value }))}
                  className="h-12 rounded-xl"
                />
              </div>
              <div>
                <label htmlFor="password" className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Password
                </label>
                <Input
                  id="password"
                  type="password"
                  required
                  minLength={8}
                  value={credentials.password}
                  onChange={(e) => setCredentials((c) => ({ ...c, password: e.target.value }))}
                  className="h-12 rounded-xl"
                />
              </div>
              <Button type="submit" size="lg" className="w-full rounded-full" disabled={authBusy}>
                {authBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {authMode === "signin" ? "Sign in" : "Create account"}
              </Button>
              <button
                type="button"
                className="text-sm text-muted-foreground underline"
                onClick={() => setAuthMode(authMode === "signin" ? "signup" : "signin")}
              >
                {authMode === "signin"
                  ? "New here? Create an account"
                  : "Already have an account? Sign in"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-8">
              <div>
                <h2 className="font-serif text-2xl">Delivery details</h2>
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label htmlFor="full_name" className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      Full name *
                    </label>
                    <Input id="full_name" name="full_name" required value={form.full_name} onChange={onChange} className="h-12 rounded-xl" />
                  </div>
                  <div>
                    <label htmlFor="phone" className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      M-Pesa phone *
                    </label>
                    <Input id="phone" name="phone" required placeholder="0712 345 678" value={form.phone} onChange={onChange} className="h-12 rounded-xl" />
                  </div>
                  <div>
                    <label htmlFor="city" className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      City / town *
                    </label>
                    <Input id="city" name="city" required value={form.city} onChange={onChange} className="h-12 rounded-xl" />
                  </div>
                  <div className="sm:col-span-2">
                    <label htmlFor="address_line_1" className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      Address *
                    </label>
                    <Input id="address_line_1" name="address_line_1" required value={form.address_line_1} onChange={onChange} className="h-12 rounded-xl" />
                  </div>
                  <div className="sm:col-span-2">
                    <label htmlFor="address_line_2" className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      Apartment, building (optional)
                    </label>
                    <Input id="address_line_2" name="address_line_2" value={form.address_line_2} onChange={onChange} className="h-12 rounded-xl" />
                  </div>
                  <div className="sm:col-span-2">
                    <label htmlFor="notes" className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      Delivery notes (optional)
                    </label>
                    <Textarea id="notes" name="notes" rows={3} value={form.notes} onChange={onChange} className="rounded-xl" />
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-border p-5">
                <p className="flex items-center gap-2 font-semibold">
                  <Smartphone className="h-4 w-4 text-primary" /> Pay with M-Pesa
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  You’ll get an STK push on the number above. Approve it with your PIN to confirm the
                  order.
                </p>
              </div>

              <Button type="submit" size="lg" className="w-full rounded-full" disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Pay {formatKES(total)}
              </Button>
            </form>
          )}
        </div>

        <aside className="lg:col-span-5">
          <div className="rounded-[1.5rem] border border-border p-6">
            <h2 className="font-serif text-2xl">Order summary</h2>
            <ul className="mt-5 space-y-4">
              {items.map((item) => (
                <li key={item.variantId} className="flex gap-4">
                  <div className="h-20 w-16 shrink-0 overflow-hidden rounded-lg bg-muted">
                    {item.image && (
                      <img src={item.image} alt={item.name} loading="lazy" className="h-full w-full object-cover" />
                    )}
                  </div>
                  <div className="flex flex-1 justify-between gap-3">
                    <div>
                      <p className="font-serif">{item.name}</p>
                      <p className="text-sm text-muted-foreground">Qty {item.quantity}</p>
                    </div>
                    <p className="text-sm font-semibold">
                      {formatKES(item.unitPrice * item.quantity)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>

            <dl className="mt-6 space-y-3 border-t border-border pt-5 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd className="font-semibold">{formatKES(subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Delivery</dt>
                <dd className="font-semibold">{delivery === 0 ? "Free" : formatKES(DELIVERY_FEE)}</dd>
              </div>
              <div className="flex justify-between border-t border-border pt-3 text-base">
                <dt className="font-semibold">Total</dt>
                <dd className="font-semibold text-primary">{formatKES(total)}</dd>
              </div>
            </dl>

            <p className="mt-5 flex items-center gap-2 text-xs text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-primary" /> Stock is reserved once you pay
            </p>
          </div>
        </aside>
      </div>
    </Layout>
  );
};

export default Checkout;
