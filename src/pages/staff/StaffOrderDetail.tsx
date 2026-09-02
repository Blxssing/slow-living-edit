import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { StaffShell } from "@/components/staff/StaffShell";
import { statusTone } from "./StaffOrders";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatKES } from "@/lib/api/catalog";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  getOrder,
  updateOrderStatus,
  NEXT_STATUSES,
  STATUS_LABEL,
  type OrderStatus,
} from "@/lib/api/staff";

export default function StaffOrderDetail() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState("");

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["staff-order", id],
    queryFn: () => getOrder(id as string),
    enabled: Boolean(id),
  });

  const order = data?.order;

  const mutation = useMutation({
    mutationFn: (status: OrderStatus) =>
      updateOrderStatus({ order_id: id as string, status, notes: notes.trim() || undefined }),
    onSuccess: (_r, status) => {
      toast.success(`Order moved to ${STATUS_LABEL[status]}`);
      setNotes("");
      queryClient.invalidateQueries({ queryKey: ["staff-order", id] });
      queryClient.invalidateQueries({ queryKey: ["staff-orders"] });
    },
    onError: (e: Error) => toast.error(e.message || "Could not update this order"),
  });

  const canUpdate = can("ORDER_UPDATE_STATUS");
  const nextOptions = order ? NEXT_STATUSES[order.status] ?? [] : [];

  return (
    <StaffShell
      title={order ? `Order ${order.order_number}` : "Order"}
      description="Full history, payment record and status workflow."
      actions={
        <Link to="/staff/orders" className="text-sm text-primary hover:underline">
          ← Back to orders
        </Link>
      }
    >
      {isLoading && <Skeleton className="h-64 w-full rounded-xl" />}
      {isError && (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {(error as Error).message || "Failed to load this order."}
        </p>
      )}

      {order && (
        <div className="grid gap-6 lg:grid-cols-[1.6fr,1fr]">
          <div className="space-y-6">
            <section className="rounded-xl border border-border bg-background p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Badge className={cn("border-0", statusTone(order.status))}>
                  {STATUS_LABEL[order.status] ?? order.status}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  Payment: {order.payment_status}
                </span>
              </div>

              <table className="mt-5 w-full text-sm">
                <tbody>
                  {order.items.map((item) => (
                    <tr key={item.id} className="border-t border-border">
                      <td className="py-3">
                        <p className="font-medium">{item.product_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.variant_label ?? "Standard"} · {item.sku ?? "—"}
                        </p>
                      </td>
                      <td className="py-3 text-right text-muted-foreground">
                        {item.quantity} × {formatKES(Number(item.unit_price))}
                      </td>
                      <td className="py-3 text-right font-medium">
                        {formatKES(Number(item.total_price))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <dl className="mt-5 space-y-1 border-t border-border pt-4 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Subtotal</dt>
                  <dd>{formatKES(Number(order.subtotal))}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Delivery</dt>
                  <dd>{formatKES(Number(order.shipping_cost))}</dd>
                </div>
                {Number(order.discount_amount) > 0 && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Discount</dt>
                    <dd>−{formatKES(Number(order.discount_amount))}</dd>
                  </div>
                )}
                <div className="flex justify-between pt-2 text-base font-semibold">
                  <dt>Total</dt>
                  <dd>{formatKES(Number(order.total))}</dd>
                </div>
              </dl>
            </section>

            <section className="rounded-xl border border-border bg-background p-5">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Status workflow
              </h2>
              {!canUpdate ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  Your role can view orders but not change their status.
                </p>
              ) : nextOptions.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  This order is in a final state — no further transitions.
                </p>
              ) : (
                <>
                  <Textarea
                    className="mt-3"
                    rows={2}
                    placeholder="Optional note recorded in the order history"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    maxLength={1000}
                  />
                  <div className="mt-3 flex flex-wrap gap-2">
                    {nextOptions.map((s) => (
                      <Button
                        key={s}
                        size="sm"
                        variant={s === "cancelled" || s === "refunded" ? "outline" : "default"}
                        disabled={mutation.isPending}
                        onClick={() => mutation.mutate(s)}
                      >
                        Mark {STATUS_LABEL[s]}
                      </Button>
                    ))}
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Cancelling releases every reserved unit back into available stock.
                  </p>
                </>
              )}
            </section>

            <section className="rounded-xl border border-border bg-background p-5">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                History
              </h2>
              <ol className="mt-3 space-y-3">
                {(order.history ?? [])
                  .slice()
                  .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
                  .map((h) => (
                    <li key={h.id} className="border-l-2 border-border pl-3 text-sm">
                      <p className="font-medium">{STATUS_LABEL[h.status as OrderStatus] ?? h.status}</p>
                      {h.notes && <p className="text-muted-foreground">{h.notes}</p>}
                      <p className="text-xs text-muted-foreground">
                        {new Date(h.created_at).toLocaleString("en-KE")}
                      </p>
                    </li>
                  ))}
                {(order.history?.length ?? 0) === 0 && (
                  <li className="text-sm text-muted-foreground">No status changes recorded yet.</li>
                )}
              </ol>
            </section>
          </div>

          <aside className="space-y-6">
            <section className="rounded-xl border border-border bg-background p-5 text-sm">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Customer
              </h2>
              <p className="font-medium">{order.customer?.full_name ?? "Guest checkout"}</p>
              <p className="text-muted-foreground">
                {order.customer?.email ?? order.guest_email ?? "—"}
              </p>
              <p className="text-muted-foreground">
                {order.customer?.phone ?? order.guest_phone ?? "—"}
              </p>
            </section>

            {order.address && (
              <section className="rounded-xl border border-border bg-background p-5 text-sm">
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Delivery
                </h2>
                <p>{order.address.recipient_name}</p>
                <p className="text-muted-foreground">{order.address.address_line_1}</p>
                {order.address.address_line_2 && (
                  <p className="text-muted-foreground">{order.address.address_line_2}</p>
                )}
                <p className="text-muted-foreground">
                  {order.address.city}
                  {order.address.county ? `, ${order.address.county}` : ""} · {order.address.country}
                </p>
                <p className="text-muted-foreground">{order.address.phone}</p>
              </section>
            )}

            <section className="rounded-xl border border-border bg-background p-5 text-sm">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Payments
              </h2>
              {(order.payments ?? []).length === 0 && (
                <p className="text-muted-foreground">No payment attempts yet.</p>
              )}
              {(order.payments ?? []).map((p) => (
                <div key={p.id} className="border-t border-border py-2 first:border-0 first:pt-0">
                  <p className="font-medium">
                    {p.provider} · {p.status}
                  </p>
                  <p className="text-muted-foreground">{formatKES(Number(p.amount))}</p>
                  {p.external_transaction_id && (
                    <p className="text-xs text-muted-foreground">Ref {p.external_transaction_id}</p>
                  )}
                  {p.result_desc && (
                    <p className="text-xs text-muted-foreground">{p.result_desc}</p>
                  )}
                </div>
              ))}
            </section>
          </aside>
        </div>
      )}
    </StaffShell>
  );
}
