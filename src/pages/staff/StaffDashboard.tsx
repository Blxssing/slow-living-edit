import { Link } from "react-router-dom";
import { StaffShell } from "@/components/staff/StaffShell";
import { useAuth } from "@/lib/auth/AuthProvider";

const SECTIONS: { label: string; permission: string; to?: string; hint: string }[] = [
  { label: "Orders", permission: "ORDER_VIEW", to: "/staff/orders", hint: "Track and fulfil" },
  { label: "Collections", permission: "CATEGORY_VIEW", to: "/staff/categories", hint: "Themes & visibility" },
  { label: "Products", permission: "PRODUCT_VIEW", hint: "Coming next" },
  { label: "Offers", permission: "OFFER_VIEW", hint: "Coming next" },
  { label: "Payments", permission: "PAYMENT_VIEW", hint: "Coming next" },
  { label: "Inventory", permission: "INVENTORY_VIEW", hint: "Coming next" },
  { label: "Transactions", permission: "TRANSACTION_VIEW", hint: "Coming next" },
  { label: "Reports", permission: "REPORT_VIEW", hint: "Coming next" },
  { label: "Analytics", permission: "ANALYTICS_VIEW", hint: "Coming next" },
  { label: "Content", permission: "CMS_VIEW", hint: "Coming next" },
  { label: "Audit log", permission: "AUDIT_VIEW", hint: "Coming next" },
  { label: "Staff", permission: "STAFF_VIEW", hint: "Coming next" },
];

export default function StaffDashboard() {
  const { permissions, can } = useAuth();

  return (
    <StaffShell title="Overview" description="Everything your role can reach.">
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.filter((s) => can(s.permission)).map((s) => {
          const body = (
            <>
              <p className="font-medium">{s.label}</p>
              <p className="text-sm text-muted-foreground">{s.hint}</p>
            </>
          );
          return (
            <li key={s.permission}>
              {s.to ? (
                <Link
                  to={s.to}
                  className="block rounded-xl border border-border bg-background p-4 transition-shadow hover:shadow-md"
                >
                  {body}
                </Link>
              ) : (
                <div className="rounded-xl border border-dashed border-border bg-background/60 p-4 opacity-70">
                  {body}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <section className="mt-8">
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Resolved permissions ({permissions.length})
        </h2>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {[...permissions].sort().join(" · ")}
        </p>
      </section>
    </StaffShell>
  );
}
