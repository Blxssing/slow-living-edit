create table public.shipping_addresses (
    id uuid primary key default gen_random_uuid(),
    profile_id uuid references public.profiles(id) on delete set null,
    full_name text not null,
    phone text not null,
    address_line_1 text not null,
    address_line_2 text,
    city text not null,
    state_province text,
    postal_code text,
    country text not null default 'Kenya',
    is_default boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

grant select, insert on public.shipping_addresses to authenticated;
grant all on public.shipping_addresses to service_role;

alter table public.shipping_addresses enable row level security;

create policy "Users can read own shipping addresses"
on public.shipping_addresses
for select
to authenticated
using (profile_id = auth.uid());

create policy "Users can insert own shipping addresses"
on public.shipping_addresses
for insert
to authenticated
with check (profile_id = auth.uid());

create table public.orders (
    id uuid primary key default gen_random_uuid(),
    customer_id uuid references auth.users(id) on delete set null,
    guest_email text,
    guest_phone text,
    status text not null default 'pending_payment' check (status in ('pending_payment', 'paid', 'payment_failed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded')),
    currency text not null default 'KES',
    subtotal decimal(12,2) not null,
    shipping_cost decimal(12,2) not null default 0,
    tax_amount decimal(12,2) not null default 0,
    discount_amount decimal(12,2) not null default 0,
    total decimal(12,2) not null,
    shipping_address_id uuid references public.shipping_addresses(id) on delete set null,
    notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

grant select, insert on public.orders to authenticated;
grant all on public.orders to service_role;

alter table public.orders enable row level security;

create policy "Customers can read own orders"
on public.orders
for select
to authenticated
using (customer_id = auth.uid());

create policy "Staff can read all orders"
on public.orders
for select
to authenticated
using (
    public.has_role(auth.uid(), 'CEO')
    or public.has_role(auth.uid(), 'HR')
    or public.has_role(auth.uid(), 'SALES PEOPLE')
);

create table public.order_items (
    id uuid primary key default gen_random_uuid(),
    order_id uuid not null references public.orders(id) on delete cascade,
    product_id uuid references public.products(id) on delete set null,
    variant_id uuid references public.product_variants(id) on delete set null,
    product_name text not null,
    variant_label text,
    sku text,
    unit_price decimal(12,2) not null,
    quantity int not null check (quantity > 0),
    total_price decimal(12,2) not null,
    created_at timestamptz not null default now()
);

grant select on public.order_items to authenticated;
grant all on public.order_items to service_role;

alter table public.order_items enable row level security;

create policy "Customers can read own order items"
on public.order_items
for select
to authenticated
using (
    exists (
        select 1 from public.orders
        where id = order_items.order_id and customer_id = auth.uid()
    )
);

create policy "Staff can read all order items"
on public.order_items
for select
to authenticated
using (
    public.has_role(auth.uid(), 'CEO')
    or public.has_role(auth.uid(), 'HR')
    or public.has_role(auth.uid(), 'SALES PEOPLE')
);

create table public.order_status_history (
    id uuid primary key default gen_random_uuid(),
    order_id uuid not null references public.orders(id) on delete cascade,
    status text not null check (status in ('pending_payment', 'paid', 'payment_failed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded')),
    actor_id uuid references auth.users(id) on delete set null,
    notes text,
    created_at timestamptz not null default now()
);

grant select on public.order_status_history to authenticated;
grant all on public.order_status_history to service_role;

alter table public.order_status_history enable row level security;

create policy "Customers can read own order status history"
on public.order_status_history
for select
to authenticated
using (
    exists (
        select 1 from public.orders
        where id = order_status_history.order_id and customer_id = auth.uid()
    )
);

create policy "Staff can read all order status history"
on public.order_status_history
for select
to authenticated
using (
    public.has_role(auth.uid(), 'CEO')
    or public.has_role(auth.uid(), 'HR')
    or public.has_role(auth.uid(), 'SALES PEOPLE')
);

create table public.payments (
    id uuid primary key default gen_random_uuid(),
    order_id uuid not null references public.orders(id) on delete cascade,
    method text not null default 'mpesa' check (method in ('mpesa', 'card', 'bank_transfer', 'cash', 'other')),
    amount decimal(12,2) not null,
    currency text not null default 'KES',
    status text not null default 'pending' check (status in ('pending', 'initiated', 'completed', 'failed', 'cancelled', 'refunded')),
    external_transaction_id text,
    result_code text,
    result_desc text,
    metadata jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

grant select on public.payments to authenticated;
grant all on public.payments to service_role;

alter table public.payments enable row level security;

create policy "Customers can read own payments"
on public.payments
for select
to authenticated
using (
    exists (
        select 1 from public.orders
        where id = payments.order_id and customer_id = auth.uid()
    )
);

create policy "Staff can read all payments"
on public.payments
for select
to authenticated
using (
    public.has_role(auth.uid(), 'CEO')
    or public.has_role(auth.uid(), 'HR')
    or public.has_role(auth.uid(), 'SALES PEOPLE')
);

create table public.payment_attempts (
    id uuid primary key default gen_random_uuid(),
    payment_id uuid references public.payments(id) on delete cascade,
    order_id uuid references public.orders(id) on delete cascade,
    direction text not null check (direction in ('outgoing', 'incoming', 'reconciliation')),
    payload jsonb,
    response jsonb,
    status text,
    error_message text,
    created_at timestamptz not null default now()
);

grant select on public.payment_attempts to authenticated;
grant all on public.payment_attempts to service_role;

alter table public.payment_attempts enable row level security;

create policy "Customers can read own payment attempts"
on public.payment_attempts
for select
to authenticated
using (
    exists (
        select 1 from public.orders
        where id = payment_attempts.order_id and customer_id = auth.uid()
    )
);

create policy "Staff can read all payment attempts"
on public.payment_attempts
for select
to authenticated
using (
    public.has_role(auth.uid(), 'CEO')
    or public.has_role(auth.uid(), 'HR')
    or public.has_role(auth.uid(), 'SALES PEOPLE')
);

create trigger update_shipping_addresses_updated_at before update on public.shipping_addresses
for each row execute function public.update_updated_at_column();

create trigger update_orders_updated_at before update on public.orders
for each row execute function public.update_updated_at_column();

create trigger update_payments_updated_at before update on public.payments
for each row execute function public.update_updated_at_column();