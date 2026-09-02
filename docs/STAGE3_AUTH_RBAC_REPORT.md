# Stage 3 — Authentication & Role-Based Access Control

## 1. Authentication

| Item | Implementation |
| --- | --- |
| Provider | Supabase Auth (Lovable Cloud). No custom password handling anywhere. |
| Methods | Email + password, Google OAuth. Leaked-password (HIBP) protection enabled. |
| Sessions | Provider-issued JWT access token + rotating refresh token, stored/refreshed by the SDK. No role or permission data is ever trusted from the client. |
| Password reset | `resetPasswordForEmail` → `/reset-password` page, provider-issued time-limited recovery token. |
| Email verification | Provider default (confirmation link) — signup does not create a session until confirmed. |
| Staff login flow | `/staff/login` → provider sign-in → `staff-session` edge function → server resolves profile, roles, permissions, status → `/staff`. |
| Last login | Written server-side by `staff-session` (`profiles.last_login_at`). Clients cannot set it. |
| Failed-login monitoring | `auth-event` function records `LOGIN_FAILURE` with a masked email hint; `isThrottled()` flags 8+ failures / 15 min. No account lockout (per spec). |
| Auth audit | `LOGIN_SUCCESS`, `LOGIN_FAILURE`, `LOGOUT`, `PASSWORD_RESET_REQUESTED`, `PASSWORD_CHANGED`, `STAFF_CREATED`, status/role changes → append-only `audit_logs`. Credentials/tokens are stripped before writing. |

## 2. Account status

`profiles.status ∈ ACTIVE | SUSPENDED | DISABLED` (CHECK constrained).
Status is enforced **inside** `has_role()` and `has_permission()`, which are the functions every RLS policy and every edge function calls — so a suspended user loses all authority everywhere at once, with no code path to forget the check. Only `STAFF_SUSPEND` holders may change status, and never their own.

## 3. Roles & permissions

Roles live only in `user_roles` (CEO, HR, SALES, plus legacy `SALES PEOPLE`). Never on `profiles`, never client-settable.
Authorization is permission-based: `permissions` (catalog) + `role_permissions` (mapping) + `has_permission(user, key)`. There are **zero** hardcoded role checks left in RLS policies.

Permission families: `PRODUCT_*`, `CATEGORY_*`, `PRODUCT_IMAGE_*`, `OFFER_*`, `ORDER_VIEW/PROCESS/UPDATE_STATUS`, `PAYMENT_VIEW/CONFIRM`, `INVENTORY_VIEW/ADJUST`, `TRANSACTION_VIEW`, `REPORT_VIEW`, `ANALYTICS_VIEW`, `CMS_*`, `AUDIT_VIEW`, `STAFF_VIEW/CREATE/UPDATE/SUSPEND/ROLE_ASSIGN`.

| Role | Gets | Explicitly denied |
| --- | --- | --- |
| CEO | Everything | Changing their own role or status |
| HR | `TRANSACTION_VIEW`, `REPORT_VIEW`, `ANALYTICS_VIEW`, `ORDER_VIEW`, `AUDIT_VIEW`, `STAFF_VIEW`, `STAFF_UPDATE` | Catalog/inventory writes, `STAFF_SUSPEND`, `STAFF_ROLE_ASSIGN` |
| SALES | Catalog, categories, images, offers, orders (view/process/status), payments (view/confirm), `INVENTORY_VIEW/ADJUST` | `TRANSACTION_VIEW`, `REPORT_VIEW`, `ANALYTICS_VIEW`, all staff administration |
| Customer | Own profile, own cart/orders/payments/addresses | Everything staff |

## 4. Security model

- **RLS on every public table**, all policies permission-scoped; no blanket `authenticated` policies; no DELETE policy anywhere (archive, never delete).
- **Append-only** `audit_logs`, `inventory_movements`, `transactions`, `payment_events` — enforced by `prevent_mutation()` triggers (verified: an attempted DELETE on `transactions` was rejected even from an admin SQL session).
- **Escalation guards** — `guard_user_roles()` rejects any self-modification of role assignments; `guard_profile_privileges()` rejects self-changes to `status`/`is_staff` without `STAFF_SUSPEND`. Edge functions additionally refuse self-targeted role/status actions.
- **Server-side authorization layer** — `getAuthContext()` → `requirePermissionOrResponse()` / `requireStaffOrResponse()`. Every protected endpoint verifies independently of route name; resource existence is checked before authorization outcomes are revealed (401 / 403 / 404 / 400).
- **Least privilege on SECURITY DEFINER functions** — only `has_role`, `has_permission`, `my_access` are executable by `authenticated` (RLS requires them). `guard_*` and `is_active_account` are revoked from everyone.
- **No public CEO-creation page.** First staff account requires the server-side `STAFF_BOOTSTRAP_SECRET` and must be CEO.
- UI guards (`RequireStaff`, `can()`) are experience only; the database and edge functions are the real boundary.

## 5. Test results (live, real JWTs)

Four throwaway accounts (CEO / HR / SALES / customer) plus unauthenticated. 49 checks, all expected outcomes.

| Check | CEO | HR | SALES | Customer | Anon |
| --- | --- | --- | --- | --- | --- |
| `staff-session` | ALLOW | ALLOW | ALLOW | ALLOW (non-staff, empty perms) | 401 |
| Read transactions (seeded row) | ALLOW | ALLOW | denied | denied | denied |
| Read inventory | ALLOW | denied | ALLOW | denied | denied |
| Read audit logs | ALLOW | ALLOW | denied | denied | denied |
| Create product (direct REST) | ALLOW | 403 | ALLOW | 403 | 403 |
| Create product (edge function) | ALLOW | 403 | ALLOW | 403 | 403 |
| Staff directory (`STAFF_VIEW`) | ALLOW | ALLOW | 403 | 403 | 401 |
| Suspend account (`STAFF_SUSPEND`) | ALLOW | 403 | 403 | — | 401 |
| Self-assign CEO role | 403 | blocked (trigger) | blocked | blocked | — |
| Self-change own status | blocked | blocked | blocked | blocked | — |
| Read another user's profile | — | — | — | denied | denied |
| Read all orders / payments | own scope only | scoped | scoped | own only | denied |

**Suspended-user run** (SALES set to SUSPENDED): login token still issues (provider-level), but `staff-session` → 403 "Account is not active", `my_access` → empty, inventory read → empty, product create → 403 RLS, edge function → 403. Access fully revoked.

Cleanup: all four test accounts, their profiles/roles and probe products were deleted, and the temporary test function was removed. One ledger row (`RBAC-TEST-TXN`, KES 1500) remains in `transactions` because the table is append-only by design — it can be neutralised with a compensating `ADJUSTMENT` row if desired.

## 6. Known/accepted notices

- Linter flags `has_role()` and `has_permission()` as callable by signed-in users — required, since the RLS policies themselves invoke them.
- Storage bucket policies for `product-images` must be set in the Cloud dashboard (migrations cannot alter `storage.objects`).
- M-Pesa credentials are still outstanding before payments can be exercised end to end.
