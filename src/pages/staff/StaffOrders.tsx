import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { StaffShell } from "@/components/staff/StaffShell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatKES } from "@/lib/api/catalog";
import {
  listOrders,
  ORDER_STATUSES,
  STATUS_LABEL,
  type OrderStatus,
} from "@/lib/api/staff";

export const statusTone = (status: string) => {
  switch (status) {
    case "paid":
    case "delivered":
      return "bg-emerald-100 text-emerald-800";
    case "pending_payment":
      return "bg-amber-100 text-amber-900";
    case "processing":
    case "shipped":
      return "bg-sky-100 text-sky-900";
    case "cancelled":
    case "payment_failed":
      return "bg-destructive/10 text-destructive";
    case "refunded":
      return "bg-muted text-muted-foreground";
    default:
      return "bg-muted text-muted-foreground";
  }
};

export default function StaffOrders() {
  const [status, setStatus] = useState<OrderStatus | undefined>();
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["staff-orders", status, page],
    queryFn: () => listOrders({ status, page }),
  });

  return (
    <StaffShell title="Orders" description="Track payment, fulfilment and inventory release.">
      <div className="mb-5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            setStatus(undefined);
            setPage(1);
          }}
          className={cn(
            "rounded-full border px-3 py-1.5 text-sm",
            !status ? "border-foreground bg-foreground text-background" : "border-border bg-background",
          )}
        >
          All
        </button>
        {ORDER_STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              setStatus(s);
              setPage(1);
            }}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm",
              status === s
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-background",
            )}
          >
            {STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      {isError && (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {(error as Error).message || "Failed to load orders."}
        </p>
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-background">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Order</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Items</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Placed</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading &&
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={7} className="px-4 py-3">
                    <Skeleton className="h-6 w-full" />
                  </td>
                </tr>
              ))}

            {!isLoading &&
              (data?.orders ?? []).map((o) => (
                <tr key={o.id} className="border-t border-border">
                  <td className="px-4 py-3 font-medium">{o.order_number}</td>
                  <td className="px-4 py-3">
                    {o.customer?.full_name ?? o.customer?.email ?? o.guest_email ?? "Guest"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{o.items?.length ?? 0}</td>
                  <td className="px-4 py-3">{formatKES(Number(o.total))}</td>
                  <td className="px-4 py-3">
                    <Badge className={cn("border-0", statusTone(o.status))}>
                      {STATUS_LABEL[o.status] ?? o.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(o.created_at).toLocaleDateString("en-KE", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link to={`/staff/orders/${o.id}`} className="text-primary hover:underline">
                      Open
                    </Link>
                  </td>
                </tr>
              ))}

            {!isLoading && (data?.orders?.length ?? 0) === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-16 text-center text-muted-foreground">
                  No orders in this view yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {data?.pagination && data.pagination.total_pages > 1 && (
        <div className="mt-5 flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {data.pagination.page} of {data.pagination.total_pages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= data.pagination.total_pages}
            onClick={() => setPage(page + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </StaffShell>
  );
}
