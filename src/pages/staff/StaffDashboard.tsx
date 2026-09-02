import { useAuth } from "@/lib/auth/AuthProvider";
import { Button } from "@/components/ui/button";

const SECTIONS: { label: string; permission: string }[] = [
  { label: "Products", permission: "PRODUCT_VIEW" },
  { label: "Categories", permission: "CATEGORY_VIEW" },
  { label: "Offers", permission: "OFFER_VIEW" },
  { label: "Orders", permission: "ORDER_VIEW" },
  { label: "Payments", permission: "PAYMENT_VIEW" },
  { label: "Inventory", permission: "INVENTORY_VIEW" },
  { label: "Transactions", permission: "TRANSACTION_VIEW" },
  { label: "Reports", permission: "REPORT_VIEW" },
  { label: "Analytics", permission: "ANALYTICS_VIEW" },
  { label: "Content", permission: "CMS_VIEW" },
  { label: "Audit log", permission: "AUDIT_VIEW" },
  { label: "Staff", permission: "STAFF_VIEW" },
];

export default function StaffDashboard() {
  const { user, roles, permissions, can, signOut } = useAuth();

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Staff dashboard</h1>
          <p className="text-sm text-muted-foreground">
            {user?.email} · {roles.join(", ") || "no role"}
          </p>
        </div>
        <Button variant="outline" onClick={signOut}>
          Sign out
        </Button>
      </header>

      <section>
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Available to your role
        </h2>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {SECTIONS.filter((s) => can(s.permission)).map((s) => (
            <li key={s.permission} className="rounded-md border p-3 text-sm">
              {s.label}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Resolved permissions ({permissions.length})
        </h2>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {permissions.sort().join(" · ")}
        </p>
      </section>
    </main>
  );
}
