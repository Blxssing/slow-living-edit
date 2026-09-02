# Mia Bella Cosmetics — Backend-First E-Commerce Architecture

Build a production-grade e-commerce backend for Mia Bella Cosmetics on Lovable Cloud (PostgreSQL + Auth + Edge Functions + Storage). The public storefront and internal staff system will be built on top of this backend later.

---

## Phase 1: Foundation & Role-Based Access Control

**Goal:** Secure identity model with three staff roles and a protected customer identity.

### Staff Roles
- `CEO` — highest business authority, full reporting and configuration access
- `HR` — business transaction/reporting access, staff and payroll-related data
- `SALES PEOPLE` — operational users, daily sales and order operations

### Deliverables
1. Create `app_role` enum and `user_roles` table with security-definer `has_role()` helper.
2. Enable email/password auth and Google sign-in for staff and customers.
3. Create `profiles` table (public, references `auth.users`) for name, phone, role metadata.
4. Add RLS policies so users read only their own profile; service role and role-based helpers govern staff access.
5. Seed one initial CEO account via migration/seed script.

### Security Rules
- Roles live in a separate `user_roles` table, never on `profiles`.
- All sensitive operations validated server-side via `has_role(auth.uid(), 'CEO')` etc.
- No client-side role checks for protected actions.

---

## Phase 2: Core Product & Inventory Schema

**Goal:** Normalized product catalog with strict inventory tracking.

### Tables
- `categories` — product categories
- `products` — core product info, pricing, status (active/archived/discontinued)
- `product_variants` — size, shade, weight, SKU, barcode, price override
- `inventory` — per-variant stock ledger with `quantity`, `reserved`, `sold`
- `product_images` — image references stored in secure object storage

### Inventory States
- `available` = `quantity - reserved - sold`
- `reserved` = stock held during checkout/payment pending
- `sold` = stock tied to completed orders
- Released on payment failure or timeout

### Deliverables
1. Migrations for all product/inventory tables with GRANTs and RLS.
2. Database functions:
   - `reserve_inventory(variant_id, qty)` — moves available to reserved
   - `release_inventory(variant_id, qty)` — moves reserved back to available
   - `commit_inventory(variant_id, qty)` — moves reserved to sold
3. Triggers to prevent negative stock and audit inventory changes.
4. Public read-only product/variant APIs via Edge Function.

---

## Phase 3: Orders & Checkout

**Goal:** Reliable order lifecycle with historical price preservation.

### Tables
- `orders` — customer, status, totals, shipping address, timestamps
- `order_items` — snapshot of product name, variant details, unit price, quantity
- `shipping_addresses` — normalized address records
- `order_status_history` — every status transition with actor and timestamp

### Order States
`pending_payment` → `paid` / `payment_failed` → `processing` → `shipped` → `delivered` / `cancelled`

### Deliverables
1. Migrations for orders, order_items, addresses, status history.
2. Edge Function `create-order`:
   - Validates cart items against current inventory
   - Reserves inventory
   - Creates order with price snapshots
   - Returns order ID and payment request
3. Edge Function `cancel-order` — releases reserved inventory, logs status change.
4. RLS: customers see only their own orders; staff see orders based on role.

---

## Phase 4: Payments (M-Pesa Daraja)

**Goal:** Secure payment initiation and confirmation via M-Pesa Daraja API.

### Tables
- `payments` — payment method, amount, currency, status, external transaction ID, metadata
- `payment_attempts` — every initiation/response/callback for audit

### Payment Flow
1. Server initiates STK push via Daraja API.
2. Customer receives prompt and authorizes on phone.
3. Daraja sends server-side callback to Edge Function.
4. Callback updates payment status and order status.
5. On success, inventory reserved → sold. On failure/timeout, reserved → available.

### Deliverables
1. Migrations for payments and payment attempts.
2. Edge Function `mpesa-initiate` — validates order, calls Daraja, records attempt.
3. Edge Function `mpesa-callback` — verifies callback, updates payment/order, commits inventory.
4. Edge Function `mpesa-query` — reconciliation query for pending payments.
5. Secrets: `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`, `MPESA_PASSKEY`, `MPESA_SHORTCODE`.
6. Idempotency keys and signature validation on callbacks.

---

## Phase 5: Staff Management System

**Goal:** Internal dashboard for authorized staff with role-based access.

### Permissions Matrix
| Feature | CEO | HR | SALES |
|---------|-----|-----|-------|
| View all orders | yes | yes | yes (own + assigned) |
| Update order status | yes | no | yes (operational) |
| Manage products | yes | no | no |
| Manage inventory | yes | no | yes |
| View financial reports | yes | yes | no |
| Manage staff roles | yes | no | no |
| View customers | yes | yes | yes |

### Deliverables
1. Edge Functions for staff operations:
   - `staff-list-orders`
   - `staff-update-order-status`
   - `staff-manage-product`
   - `staff-adjust-inventory`
   - `staff-sales-report`
2. Audit logging table `audit_logs` capturing actor, action, table, record ID, old/new values.
3. Database functions for aggregated reports (daily sales, inventory valuation).

---

## Phase 6: Public Storefront APIs

**Goal:** Customer-facing read APIs and cart/checkout flow.

### Deliverables
1. Edge Function `public-products` — list/filter/paginate active products.
2. Edge Function `public-product-detail` — single product with variants.
3. Edge Function `customer-create-order` — authenticated customers only.
4. Edge Function `customer-order-history` — own orders only.
5. Guest checkout support via temporary session/cart (optional v2).

---

## Phase 7: Storage, Validation & Security Hardening

**Goal:** Secure file uploads and robust input validation.

### Deliverables
1. Storage bucket `product-images` with size/type limits and public read policy.
2. Zod validation on every Edge Function input.
3. Rate limiting on payment and auth endpoints.
4. Standardized error responses (no stack traces, no internal details).
5. Indexes on frequently queried columns: order status, product status, inventory variant, payment external ID.

---

## Phase 8: Frontend (After Backend is Solid)

**Goal:** Build the React/Vite customer storefront and staff dashboard on top of the verified backend.

### Deliverables
1. Public pages: home, product listing, product detail, cart, checkout, order confirmation.
2. Staff pages: login, dashboard, orders, products, inventory, reports (role-gated).
3. Use Lovable Cloud auth SDK for sign-in/sign-up.
4. No client-side role enforcement for protected actions — all mutations go through Edge Functions.

---

## Immediate First Step

Create the database schema for Phase 1 and Phase 2:
- `app_role` enum
- `user_roles` table
- `profiles` table
- `categories`, `products`, `product_variants`, `inventory`, `product_images`
- GRANTs and RLS policies for every public table
- Security-definer helper functions

This gives us the identity and product foundation before adding orders, payments, and staff workflows.
