import { Link } from "react-router-dom";
import { ArrowRight, Minus, Plus, ShoppingBag, X } from "lucide-react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { DELIVERY_FEE, deliveryFeeFor, FREE_DELIVERY_THRESHOLD, useCart } from "@/hooks/useCart";
import { formatKES } from "@/lib/api/catalog";

const Cart = () => {
  const { items, updateQuantity, removeItem, clearCart } = useCart();
  const subtotal = useCart((s) => s.getSubtotal());
  const delivery = deliveryFeeFor(subtotal);
  const remaining = Math.max(0, FREE_DELIVERY_THRESHOLD - subtotal);

  if (items.length === 0) {
    return (
      <Layout>
        <div className="container-narrow py-28 text-center">
          <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-secondary">
            <ShoppingBag className="h-8 w-8 text-primary" />
          </div>
          <h1 className="mt-6 font-serif text-4xl">Your bag is empty</h1>
          <p className="mt-3 text-muted-foreground">
            Explore the collection and find your next favourite.
          </p>
          <Button asChild size="lg" className="mt-8 rounded-full px-8">
            <Link to="/products">
              Start shopping
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <section className="border-b border-border bg-secondary">
        <div className="container-wide py-12">
          <h1 className="font-serif text-4xl md:text-5xl">Your bag</h1>
          <p className="mt-2 text-muted-foreground">{items.length} item(s)</p>
        </div>
      </section>

      <div className="container-wide grid gap-12 py-12 lg:grid-cols-12">
        <div className="lg:col-span-7 xl:col-span-8">
          {remaining > 0 && (
            <div className="mb-6 rounded-2xl bg-secondary px-5 py-4 text-sm text-secondary-foreground">
              Add <strong>{formatKES(remaining)}</strong> more for free delivery.
            </div>
          )}

          <ul className="divide-y divide-border border-y border-border">
            {items.map((item) => (
              <li key={item.variantId} className="flex gap-5 py-6">
                <Link
                  to={`/product/${item.slug}`}
                  className="h-32 w-24 shrink-0 overflow-hidden rounded-xl bg-muted"
                >
                  {item.image && (
                    <img
                      src={item.image}
                      alt={item.name}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  )}
                </Link>

                <div className="flex flex-1 flex-col justify-between">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <Link
                        to={`/product/${item.slug}`}
                        className="font-serif text-lg hover:text-primary"
                      >
                        {item.name}
                      </Link>
                      {item.variantLabel && item.variantLabel !== "Standard" && (
                        <p className="text-sm text-muted-foreground">{item.variantLabel}</p>
                      )}
                      <p className="mt-1 text-sm text-muted-foreground">
                        {formatKES(item.unitPrice)} each
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label={`Remove ${item.name}`}
                      onClick={() => removeItem(item.variantId)}
                      className="text-muted-foreground transition-colors hover:text-primary"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1 rounded-full border border-border">
                      <button
                        type="button"
                        aria-label="Decrease quantity"
                        onClick={() => updateQuantity(item.variantId, item.quantity - 1)}
                        className="grid h-9 w-9 place-items-center rounded-full hover:bg-muted"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="w-7 text-center text-sm font-semibold">{item.quantity}</span>
                      <button
                        type="button"
                        aria-label="Increase quantity"
                        onClick={() => updateQuantity(item.variantId, item.quantity + 1)}
                        className="grid h-9 w-9 place-items-center rounded-full hover:bg-muted"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <span className="font-semibold">
                      {formatKES(item.unitPrice * item.quantity)}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-6 flex justify-between">
            <Button asChild variant="ghost" className="rounded-full">
              <Link to="/products">Continue shopping</Link>
            </Button>
            <Button variant="ghost" className="rounded-full" onClick={clearCart}>
              Clear bag
            </Button>
          </div>
        </div>

        <aside className="lg:col-span-5 xl:col-span-4">
          <div className="rounded-[1.5rem] border border-border p-6">
            <h2 className="font-serif text-2xl">Summary</h2>
            <dl className="mt-6 space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd className="font-semibold">{formatKES(subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Delivery</dt>
                <dd className="font-semibold">
                  {delivery === 0 ? "Free" : formatKES(DELIVERY_FEE)}
                </dd>
              </div>
              <div className="flex justify-between border-t border-border pt-3 text-base">
                <dt className="font-semibold">Total</dt>
                <dd className="font-semibold text-primary">{formatKES(subtotal + delivery)}</dd>
              </div>
            </dl>
            <Button asChild size="lg" className="mt-6 w-full rounded-full">
              <Link to="/checkout">
                Checkout
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <p className="mt-4 text-center text-xs text-muted-foreground">
              Secure M-Pesa payment on the next step
            </p>
          </div>
        </aside>
      </div>
    </Layout>
  );
};

export default Cart;
