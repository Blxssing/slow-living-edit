import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthProvider";

/**
 * UX guard only. The database (RLS) and the edge functions are the real
 * security boundary — this simply avoids rendering screens that would fail.
 */
export function RequireStaff({
  children,
  permission,
}: {
  children: ReactNode;
  permission?: string;
}) {
  const { loading, user, isStaff, status, can } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="p-8 text-sm text-muted-foreground">Checking access…</div>;
  }

  if (!user) {
    return <Navigate to="/staff/login" state={{ from: location.pathname }} replace />;
  }

  if (!isStaff || status !== "ACTIVE") {
    return (
      <div className="p-8">
        <h1 className="text-lg font-semibold">Access denied</h1>
        <p className="text-sm text-muted-foreground">
          This account does not have active staff access.
        </p>
      </div>
    );
  }

  if (permission && !can(permission)) {
    return (
      <div className="p-8">
        <h1 className="text-lg font-semibold">Not authorized</h1>
        <p className="text-sm text-muted-foreground">
          Your role does not include the required permission.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
