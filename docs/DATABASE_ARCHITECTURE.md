# Mia Bella Cosmetics — Stage 2: Production Database Architecture Report

Status: **design report — no schema changes executed yet.**

---

## 0. Existing project inspection

| Area | Finding |
|---|---|
| Framework | React 18 + Vite 5 + TypeScript + Tailwind (client-side SPA) |
| Backend | Lovable Cloud = managed PostgreSQL + Auth + Storage + Deno Edge Functions |
| Database | PostgreSQL (connected and live) |
| Migrations | 4 version-controlled files in `supabase/migrations/` |
| Existing tables | `profiles`, `user_roles`, `categories`, `products`, `product_variants`, `inventory`, `product_images`, `shipping_addresses`, `orders`, `order_items`, `order_status_history`, `payments`, `payment_attempts`, `audit_logs` |
| Enums | `app_role` = `CEO`, `HR`, `SALES PEOPLE` |
| Functions | `has_role`, `reserve_inventory`, `release_inventory`, `commit_inventory`, `get_available_inventory`, `update_updated_at_column` (all SECURITY DEFINER, EXECUTE revoked from PUBLIC) |
| Triggers | 8 × `updated_at` maintenance triggers |
| RLS | Enabled on every public table; read policies exist, all writes denied to clients (server-only via Edge Functions) |
| Auth | Supabase Auth (email/password). `profiles.id` → `auth.users.id` |
| Storage | 1 private bucket: `product-images` |
| Env vars | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`; server secrets incl. `SUPABASE_SERVICE_ROLE_KEY`, `STAFF_BOOTSTRAP_SECRET`, `LOVABLE_API_KEY` |
| Data volume | 4 categories, 4 products, 4 variants, 4 inventory rows. **Zero orders, order_items, payments, profiles, user_roles, audit_logs.** |

**Conclusion:** the catalog foundation is real and worth keeping; the transactional side is empty, so it can be extended freely with zero data-loss risk. Nothing will be dropped.

---

## 1. Conflicts between the existing schema and the Stage 2 specification

| # | Conflict | Resolution |
|---|---|---|
| C1 | Role value is `SALES PEOPLE`; spec asks for `SALES` | Add `SALES` to the `app_role` enum (enum values cannot be dropped safely). New grants use `SALES`; `has_permission()` treats both as the same role via a mapping. No rows exist to migrate. |
| C2 | Authorization is role-hardcoded (`has_role(...,'CEO')`) | Introduce `permissions` + `role_permissions` + `has_permission(user_id, permission_key)`. RLS/Edge Functions migrate to permission checks; `has_role` remains as the low-level primitive. |
| C3 | Spec wants product-level inventory; project has **variant-level** inventory | Keep variant-level (a strict superset — a product with no options gets one default variant). Add a `product_stock` view aggregating to product level for reporting. No duplication. |
| C4 | No `customers` table; orders link to `auth.users` + guest email | Add `customers` as the commercial identity, with optional `auth_user_id`. `orders.customer_id` (auth uid) is retained for RLS; new `orders.customer_ref` FK → `customers.id` carries guest and account orders uniformly. |
| C5 | `orders` has no human-friendly order number | Add `order_number TEXT UNIQUE NOT NULL` generated `MB-YYYY-NNNNNN` by a sequence-backed trigger. |
| C6 | `payments` lacks M-Pesa correlation and idempotency fields | Add `provider_reference`, `checkout_request_id`, `merchant_request_id`, `paid_at`; partial unique index guaranteeing **one** `PAID` payment per order. |
| C7 | `payment_attempts` is a log, not an idempotent event store | Add `payment_events` with `UNIQUE (provider, provider_event_id)`; keep `payment_attempts` as the outbound request log. |
| C8 | Status values are free-form lowercase text | Add CHECK constraints with the specified uppercase-controlled vocabularies on new tables; existing lowercase order/payment statuses are normalized in the same migration (zero rows affected). |
| C9 | Money is untyped `numeric` | Tighten to `numeric(12,2)` with `>= 0` CHECKs and `currency CHAR(3) DEFAULT 'KES'`. |
| D1 | Missing entirely | `permissions`, `role_permissions`, `offers`, `inventory_movements`, `customers`, `transactions`, `content_sections`, `payment_events` |

**Data-loss risk: none.** All changes are additive (`ADD COLUMN`, `CREATE TABLE`, `CREATE INDEX`) plus constraint tightening on empty or conforming tables. A pre-migration snapshot is still taken by the platform automatically.

---

## 2. ERD description

```text
auth.users ──1:1── profiles ──0:1── customers
     │                 │
     │                 └──< audit_logs (actor)
     │                 └──< created_by / updated_by on catalog + CMS tables
     └──< user_roles >── app_role ──< role_permissions >── permissions

categories ──< products ──< product_variants ──1:1── inventory
                  │              │                      │
                  │              │                      └──< inventory_movements
                  │              └──< order_items (snapshot)
                  ├──< product_images
                  └──< offers (product | category | global scope)

customers ──< customer_addresses
     └──< orders ──< order_items
              ├──< order_status_history
              ├──< payments ──< payment_events
              │                  └──< payment_attempts (outbound log)
              └──< transactions >── payments

content_sections  (standalone, page + section_type driven)
audit_logs        (append-only, entity_type + entity_id polymorphic)
```

---

## 3. Table catalogue

Legend: **[K]** keep as-is · **[E]** extend · **[N]** new.

### Identity & access

**profiles [E]** — application identity mirror of `auth.users`.
`id uuid PK → auth.users`, `full_name`, `email text`, `phone`, `avatar_url`, `is_staff bool`, **+`status text CHECK IN ('ACTIVE','SUSPENDED','ARCHIVED') DEFAULT 'ACTIVE'`**, **+`last_login_at timestamptz`**, `created_at`, `updated_at`.
No `role` column — role lives only in `user_roles` (privilege-escalation prevention). Self-update policy excludes `is_staff` and `status` (writes are server-only anyway).

**user_roles [E]** — `(user_id, role)` unique. Enum gains `SALES`. Index on `user_id`.

**permissions [N]** — `id uuid PK`, `key text UNIQUE` (e.g. `PRODUCT_CREATE`), `description`, `domain text`, `created_at`. Seeded with the full list in §6 of the brief.

**role_permissions [N]** — `id uuid PK`, `role app_role`, `permission_id uuid → permissions ON DELETE CASCADE`, `UNIQUE (role, permission_id)`.
Baseline grant matrix:
- **CEO** — every permission.
- **HR** — `*_VIEW` on products/offers/orders/payments/transactions, `REPORT_VIEW`, `ANALYTICS_VIEW`, `AUDIT_VIEW`, `STAFF_MANAGE`.
- **SALES** — `PRODUCT_VIEW`, `OFFER_VIEW`, `ORDER_VIEW`, `ORDER_PROCESS`, `ORDER_UPDATE_STATUS`, `PAYMENT_VIEW`, `INVENTORY_ADJUST`, `CMS_VIEW`.

**has_permission(_user_id uuid, _key text) → boolean** — STABLE SECURITY DEFINER, `search_path=public`, EXECUTE granted to `authenticated` + `service_role`. Joins `user_roles → role_permissions → permissions`. This is the single authorization primitive for RLS and Edge Functions.

### Catalog

**categories [E]** — add `status text CHECK IN ('ACTIVE','ARCHIVED') DEFAULT 'ACTIVE'` (backfilled from `is_active`), `created_by`, `updated_by`. `slug` gets a UNIQUE constraint. `is_active` retained temporarily for the existing read policy, then dropped in a follow-up once functions are updated.

**products [E]** — add `brand text`, `currency char(3) NOT NULL DEFAULT 'KES'`, `sku text UNIQUE`, `created_by`, `updated_by`; `base_price` → `numeric(12,2) CHECK (base_price >= 0)`; `status` vocabulary normalized to `DRAFT | ACTIVE | ARCHIVED` via CHECK. `slug` UNIQUE.

**product_variants [K/E]** — SKU-bearing purchasable unit; `price_adjustment` → `numeric(12,2)`.

**product_images [E]** — add `created_by`. FK `product_id ON DELETE CASCADE` (images belong to the product); deleting an image never touches the product. Partial unique index: one `is_primary = true` per product.

**offers [N]** — scalable scope model rather than product-only:
`id`, `name`, `offer_type CHECK IN ('PERCENTAGE','FIXED_AMOUNT','LABEL_ONLY')`, `value numeric(12,2) CHECK (value >= 0)`, `promotional_label text`, `scope CHECK IN ('PRODUCT','CATEGORY','GLOBAL')`, `product_id → products`, `category_id → categories`, `start_at timestamptz`, `end_at timestamptz`, `status CHECK IN ('DRAFT','ACTIVE','ARCHIVED')`, `priority int`, audit columns.
Constraints: scope/target consistency CHECK (PRODUCT ⇒ product_id NOT NULL and category_id NULL, etc.); `CHECK (end_at IS NULL OR end_at > start_at)`; percentage offers `CHECK (offer_type <> 'PERCENTAGE' OR value <= 100)`.
Rationale: a single scoped table now supports campaign-level promotions without a schema rewrite; a future `campaigns` table simply becomes a nullable FK.

### Inventory

**inventory [E]** — per variant. `quantity`, `reserved`, `sold`, `low_stock_threshold`, existing CHECK `quantity >= reserved + sold`. `available` stays **derived** (`get_available_inventory`) plus a generated column `available_quantity int GENERATED ALWAYS AS (quantity - reserved - sold) STORED` so it can be indexed and can never drift.

**inventory_movements [N]** — append-only ledger: `id`, `variant_id → product_variants`, `product_id → products`, `movement_type CHECK IN ('STOCK_IN','SALE','RETURN','ADJUSTMENT','DAMAGE','RESTOCK','RESERVATION','RELEASE')`, `quantity int CHECK (quantity <> 0)`, `reason text`, `reference_type text`, `reference_id uuid`, `performed_by uuid`, `created_at`. No UPDATE/DELETE grants to any client role; the reserve/release/commit functions insert rows inside the same transaction as the inventory update, eliminating race conditions via the existing conditional `UPDATE ... WHERE available >= qty`.

### Customers

**customers [N]** — `id`, `auth_user_id uuid UNIQUE NULL → auth.users`, `full_name`, `email citext`, `phone`, `status CHECK IN ('ACTIVE','BLOCKED')`, timestamps. Guest checkout stays possible (`auth_user_id NULL`). Partial unique index on `lower(email)` where email IS NOT NULL.

**customer_addresses [N]** — `id`, `customer_id → customers ON DELETE CASCADE`, `recipient_name`, `phone`, `county`, `town`, `address_line`, `additional_instructions`, `is_default bool`, timestamps. Only fulfilment-necessary PII. Existing `shipping_addresses` remains for order-time snapshots.

### Commerce

**Cart:** client-side (localStorage) + **authoritative server revalidation**. No cart tables. At checkout, `create-order` re-reads product status, current price, active offers, quantity and inventory inside one transaction and recomputes every total; the browser's numbers are inputs, never truth. If abandoned-cart analytics are later required, a `carts` table can be added without touching checkout.

**orders [E]** — add `order_number text UNIQUE NOT NULL` (`MB-YYYY-NNNNNN`, sequence + trigger), `customer_ref uuid → customers`, `payment_status CHECK IN ('PENDING','PROCESSING','PAID','FAILED','CANCELLED','REFUNDED')`, `delivery_fee numeric(12,2)` (rename of `shipping_cost` kept as an added column with backfill), `placed_at`. Money columns → `numeric(12,2) CHECK (>= 0)`. Status CHECK: `PENDING_PAYMENT | PAID | PAYMENT_FAILED | PROCESSING | SHIPPED | DELIVERED | CANCELLED | REFUNDED`.

**order_items [K/E]** — already snapshot-based (`product_name`, `variant_label`, `sku`, `unit_price`, `quantity`, `total_price`). Add `discount_amount numeric(12,2) DEFAULT 0`. FKs to `products`/`product_variants` are `ON DELETE SET NULL` so catalog changes can never rewrite history; the snapshot columns are `NOT NULL`. Reporting **never** joins to `products` for price or name.

### Payments

**payments [E]** — add `provider_reference`, `checkout_request_id`, `merchant_request_id`, `paid_at`; status CHECK `PENDING | PROCESSING | PAID | FAILED | CANCELLED | REFUNDED`; `amount numeric(12,2) CHECK (amount > 0)`. **Partial unique index `(order_id) WHERE status = 'PAID'`** — Rule 5, one successful payment per order, enforced by the database.

**payment_events [N]** — `id`, `payment_id`, `order_id`, `provider text`, `provider_event_id text`, `event_type`, `result_code`, `result_desc`, `raw_payload jsonb`, `signature_valid bool`, `processed_at`, `created_at`, `UNIQUE (provider, provider_event_id)`. A duplicate M-Pesa callback hits the unique violation, is recognised as already-seen, and returns success without re-committing inventory or re-creating transactions. Retries are safe because processing is keyed on the event row.

**payment_attempts [K]** — outbound request/response audit log (STK push payloads).

### Financial

**transactions [N]** — append-oriented ledger: `id`, `order_id → orders`, `payment_id → payments`, `transaction_type CHECK IN ('SALE','REFUND','ADJUSTMENT')`, `amount numeric(12,2)`, `currency char(3) DEFAULT 'KES'`, `reference text`, `status CHECK IN ('POSTED','REVERSED')`, `transaction_date timestamptz NOT NULL DEFAULT now()`, `reversal_of uuid → transactions`, `created_at`. No UPDATE/DELETE grants; corrections are new `ADJUSTMENT`/`REFUND` rows referencing the original.

**Reporting** — `report_sales_summary(_from timestamptz, _to timestamptz)` SECURITY DEFINER, `service_role` only, gated behind `REPORT_VIEW` in the Edge Function. Returns orders count, units sold, gross sales, discounts, net sales, AOV, successful/failed payments, refunds — computed from `transactions` + `order_items` snapshots, never from `products`.

### CMS

**content_sections [N]** — `id`, `page text`, `section_type CHECK IN ('HERO','BANNER','PRODUCT_GRID','PROMOTION','IMAGE_TEXT','TESTIMONIALS','FAQ','VIDEO','FEATURED_PRODUCTS','CATEGORY_SECTION')`, `title`, `content text`, `image_url`, `config jsonb DEFAULT '{}'`, `sort_order int`, `status CHECK IN ('DRAFT','PUBLISHED','ARCHIVED')`, `published_at`, audit columns. One extensible table; new section types are a CHECK value plus a `config` shape, not a new table. Public read policy: `status = 'PUBLISHED'`.

### Auditing

**audit_logs [E]** — existing columns `actor_id`, `action`, `table_name`, `record_id`, `old_values`, `new_values`, `ip_address`, `user_agent`, `created_at`. Add `entity_type text` / `entity_id uuid` / `metadata jsonb` as the specification's vocabulary (`table_name`/`record_id` backfilled and kept as aliases until Edge Functions are updated). Append-only: `GRANT SELECT, INSERT` only; no UPDATE/DELETE grant to any role including `authenticated`. Read restricted to `AUDIT_VIEW`.

---

## 4. Indexing plan (each index justified)

| Index | Why |
|---|---|
| `products(slug)` UNIQUE | storefront product-detail lookup by slug |
| `products(category_id)`, `products(status)`, `products(status, is_featured)` | category listing + active/featured filters |
| `product_variants(product_id)`, `product_images(product_id)` | detail-page child fetches |
| `offers(status, start_at, end_at)`, `offers(product_id)`, `offers(category_id)` | active-offer resolution at checkout |
| `inventory(variant_id)` UNIQUE, `inventory(available_quantity)` | reservation lookups, low-stock reports |
| `inventory_movements(variant_id, created_at DESC)`, `(reference_type, reference_id)` | stock history, order traceability |
| `orders(order_number)` UNIQUE, `(customer_id)`, `(customer_ref)`, `(status)`, `(payment_status)`, `(created_at DESC)` | customer history, staff queues, date-range reports |
| `order_items(order_id)`, `(product_id)` | order detail, per-product sales reports |
| `payments(order_id)`, `(status)`, `(transaction_reference)`, `(checkout_request_id)` | callback correlation, reconciliation |
| `payments(order_id) WHERE status='PAID'` UNIQUE | integrity, not speed |
| `payment_events(provider, provider_event_id)` UNIQUE | idempotency |
| `transactions(transaction_date DESC)`, `(order_id)`, `(payment_id)`, `(transaction_type)` | financial reporting windows |
| `audit_logs(actor_id)`, `(created_at DESC)`, `(entity_type, entity_id)` | audit search |
| `content_sections(page, status, sort_order)` | CMS page render |

Deliberately **not** indexed: descriptions, low-cardinality booleans without a filtering query, and every `updated_at`.

---

## 5. Money, time, deletion

- **Money:** `numeric(12,2)` everywhere, `CHECK (>= 0)`, `currency char(3) DEFAULT 'KES'`. All authoritative arithmetic (totals, discounts, tax) happens in SQL/Edge Functions; the browser never computes an authoritative amount. Rounding: half-up at 2 dp at line-item level, then summed.
- **Time:** `timestamptz` only, stored UTC, `DEFAULT now()`. Display-time conversion (EAT, UTC+3) is a frontend concern.
- **Deletion:** no hard deletes for categories, products, offers, CMS. `status = 'ARCHIVED'`. Orders, payments, transactions, audit logs, inventory movements are permanent.

---

## 6. Security architecture (RLS)

- Every table: RLS enabled, explicit GRANTs, **no blanket `authenticated can do everything` policy anywhere**.
- **Public/anon read only:** active categories, `DRAFT`-excluded active products with their variants/images, active offers, published CMS sections.
- **Customers:** `orders`, `order_items`, `payments`, `order_status_history`, `customer_addresses` readable only where the row resolves to `auth.uid()`.
- **Staff:** every staff read policy is `has_permission(auth.uid(), '<PERMISSION>')` — e.g. `ORDER_VIEW` for orders, `PAYMENT_VIEW` for payments, `REPORT_VIEW`/`TRANSACTION_VIEW` for transactions, `AUDIT_VIEW` for audit logs. HR therefore gets reporting reads without operational writes; SALES gets operations without financial reporting; CEO holds all permissions.
- **Writes:** no client role receives INSERT/UPDATE/DELETE on business tables. All mutations flow through Edge Functions with the service-role client after a server-side permission check. `audit_logs`, `inventory_movements`, `transactions`, `payment_events` additionally have no UPDATE/DELETE grant at all — append-only at the privilege level.
- SECURITY DEFINER functions keep `EXECUTE` revoked from `PUBLIC`; only `has_role` and `has_permission` are granted to `authenticated` (required by RLS).

---

## 7. Data-integrity rules → mechanism

| Rule | Enforced by |
|---|---|
| 1 order → existing customer | FK `orders.customer_ref → customers`, `orders.customer_id → auth.users` |
| 2 item belongs to order | FK `order_items.order_id` NOT NULL, `ON DELETE CASCADE` |
| 3 historical price preserved | NOT NULL snapshot columns; product FKs `ON DELETE SET NULL`; reporting never joins to `products` for price/name |
| 4 payment belongs to order | FK `payments.order_id` NOT NULL |
| 5 no duplicate success | partial unique index on `payments(order_id) WHERE status='PAID'` + `payment_events` unique provider event id |
| 6 no negative inventory | CHECK `quantity >= reserved + sold`, non-negative CHECKs, conditional-UPDATE reservation functions |
| 7 archived products unbuyable | `create-order` validates `status='ACTIVE'`; CHECK vocabulary makes the state explicit |
| 8 expired offers don't apply | offer resolution filters `status='ACTIVE' AND now() BETWEEN start_at AND coalesce(end_at,'infinity')`; date-range CHECK |
| 9 traceable financials | `transactions` FKs to order+payment, `reversal_of` chain, append-only grants |
| 10 audit immutability | no UPDATE/DELETE grant on `audit_logs` |

**Consistency review:** no circular FK dependencies (`customers → orders → payments → transactions` is a DAG; `transactions.reversal_of` is self-referential and nullable). No duplicated calculated values except the generated `available_quantity`, which the database maintains. No permission leak paths: every staff policy is permission-gated, every customer policy is `auth.uid()`-scoped.

---

## 8. Migration plan (safe sequence)

All steps additive; existing rows and functions keep working throughout.

1. **M1 — Identity & permissions:** add `SALES` enum value; `permissions`, `role_permissions`; seed permission catalogue + role matrix; `has_permission()`; extend `profiles` (`email`, `status`, `last_login_at`).
2. **M2 — Catalog hardening:** `offers`; category/product status + audit columns; money type tightening; unique slugs; catalog indexes.
3. **M3 — Inventory ledger:** `inventory_movements`; `available_quantity` generated column; update reserve/release/commit functions to write movement rows in-transaction.
4. **M4 — Customers & orders:** `customers`, `customer_addresses`; `orders.order_number` (sequence + trigger), `customer_ref`, `payment_status`, `delivery_fee`; order indexes.
5. **M5 — Payments & finance:** payment columns + paid-uniqueness index; `payment_events`; `transactions`; `report_sales_summary()`.
6. **M6 — CMS & audit:** `content_sections`; audit column additions and append-only grant tightening.
7. **M7 — Policy switch-over:** replace `has_role(...)` staff policies with `has_permission(...)`; then Edge Functions are updated to match (code stage, after migrations).

Each step is one reviewable migration file; a failure stops the sequence without leaving the earlier steps inconsistent. Backups: the platform snapshots before each migration; catalog data (4 categories / 4 products) is additionally reproducible from the existing seed SQL.

---

## 9. Deferred by design

Warehouses/multi-location stock, coupon codes, product reviews, returns/RMA, notification queue, multi-provider payment routing, `carts` persistence. Each slots into this schema as a new table plus a nullable FK — no rewrite required.

---

## 10. Research notes applied (Postgres/Supabase best practice)

Sources: Supabase "Custom Claims & RBAC", "Row Level Security", "RLS Performance and Best Practices".

1. **Official RBAC shape adopted:** `user_roles` + `role_permissions` + a security-definer `authorize`-style function. Deviation: permissions are a **table** (`permissions.key`) rather than an `app_permission` enum, because adding a permission must not require an enum `ALTER TYPE` (which cannot run inside some transaction contexts and is irreversible). Extensibility beats the marginal type-safety win.
2. **No JWT custom-claims hook (yet).** Claims embedded via `custom_access_token_hook` are fast but go **stale** until token refresh — dangerous for revoking a fired staff member's access. Permissions are read live from the database through `has_permission()`, which is `STABLE` and therefore evaluated once per statement, not per row. If reporting load later demands it, a claims hook can be layered on without schema change.
3. **RLS performance rules enforced on every policy:**
   - wrap auth functions: `(select auth.uid())` — lets Postgres treat it as an initPlan constant instead of a per-row call;
   - always declare `TO authenticated` / `TO anon` so the policy is skipped entirely for other roles;
   - index every column referenced in a `USING` clause (`orders.customer_id`, `order_items.order_id`, `user_roles.user_id`);
   - keep predicates function-call-shaped (`has_permission(...)`) rather than inline sub-selects, avoiding recursive-policy faults.
4. **Never reference a table inside its own policy** — all cross-table checks go through security-definer functions (`has_role`, `has_permission`), preventing "infinite recursion detected in policy".
5. **Grants are not policies:** RLS is enabled *and* GRANTs are scoped per role on every new table; `anon` is granted only where a public-read policy genuinely exists.
6. **Money:** `numeric(12,2)`, never `float8`/`money`. **Time:** `timestamptz` only.
7. **Idempotency:** enforced by unique constraints (`payment_events(provider, provider_event_id)`, partial unique on paid payments), not by application-level "check then insert", which races.
8. **Concurrency:** stock changes use single-statement conditional updates (`UPDATE ... WHERE quantity - reserved - sold >= qty`) — atomic under concurrent checkout without explicit locking.
