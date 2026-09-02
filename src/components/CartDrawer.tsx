import { Link } from "react-router-dom";
import { Minus, Plus, ShoppingBag, X } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  DELIVERY_FEE,
  FREE_DELIVERY_THRESHOLD,
  deliveryFeeFor,
  useCart,
} from "@/hooks/useCart";
import { formatKES } from "@/lib/api/catalog";

export const CartDrawer = () => {
  const { items, isOpen, closeCart, updateQuantity, removeItem } = useCart();
  const subtotal = useCart((s) => s.getSubtotal());
  const delivery = deliveryFeeFor(subtotal);
  const remaining = Math.max(0, FREE_DELIVERY_THRESHOLD - subtotal);

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && closeCart()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border px-6 py-5 text-left">
          <SheetTitle className="font-serif text-2xl">Your bag</SheetTitle>
        </SheetHeader>

        {items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
            <div className="grid h-16 w-16 place-items-center rounded-full bg-secondary">
              <ShoppingBag className="h-7 w-7 text-secondary-foreground" />
            </div>
            <p className="font-serif text-xl">Your bag is empty</p>
            <p className="text-sm text-muted-foreground">
              Add a little something that makes you feel brilliant.
            </p>
            <Button asChild onClick={closeCart} className="rounded-full">
              <Link to="/products">Shop the collection</Link>
            </Button>
          </div>
        ) : (
          <>
            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
              {remaining > 0 && (
                <div className="rounded-2xl bg-secondary px-4 py-3 text-sm text-secondary-foreground">
                  You are <strong>{formatKES(remaining)}</strong> away from free delivery.
                </div>
              )}

              {items.map((item) => (
                <div key={item.variantId} className="flex gap-4">
                  <Link
                    to={`/product/${item.slug}`}
                    onClick={closeCart}
                    className="h-24 w-20 shrink-0 overflow-hidden rounded-xl bg-muted"
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
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <Link
                          to={`/product/${item.slug}`}
                          onClick={closeCart}
                          className="font-serif text-base leading-snug hover:text-primary"
                        >
                          {item.name}
                        </Link>
                        <button
                          type="button"
                          aria-label={`Remove ${item.name}`}
                          onClick={() => removeItem(item.variantId)}
                          className="text-muted-foreground transition-colors hover:text-primary"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      {item.variantLabel && item.variantLabel !== "Standard" && (
                        <p className="text-xs text-muted-foreground">{item.variantLabel}</p>
                      )}
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1 rounded-full border border-border">
                        <button
                          type="button"
                          aria-label="Decrease quantity"
                          onClick={() => updateQuantity(item.variantId, item.quantity - 1)}
                          className="grid h-8 w-8 place-items-center rounded-full hover:bg-muted"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="w-6 text-center text-sm font-semibold">{item.quantity}</span>
                        <button
                          type="button"
                          aria-label="Increase quantity"
                          onClick={() => updateQuantity(item.variantId, item.quantity + 1)}
                          className="grid h-8 w-8 place-items-center rounded-full hover:bg-muted"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <span className="text-sm font-semibold">
                        {formatKES(item.unitPrice * item.quantity)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-4 border-t border-border px-6 py-5">
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-semibold">{formatKES(subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Delivery</span>
                  <span className="font-semibold">
                    {delivery === 0 ? "Free" : formatKES(DELIVERY_FEE)}
                  </span>
                </div>
              </div>
              <Button asChild size="lg" className="w-full rounded-full" onClick={closeCart}>
                <Link to="/checkout">Checkout · {formatKES(subtotal + delivery)}</Link>
              </Button>
              <Button
                asChild
                variant="ghost"
                className="w-full rounded-full"
                onClick={closeCart}
              >
                <Link to="/cart">View full bag</Link>
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};
