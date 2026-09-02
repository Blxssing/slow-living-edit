create type public.app_role as enum ('CEO', 'HR', 'SALES PEOPLE');

create table public.user_roles (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users(id) on delete cascade not null,
    role app_role not null,
    created_at timestamptz not null default now(),
    unique (user_id, role)
);

grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;

alter table public.user_roles enable row level security;

create policy "Users can read own roles"
on public.user_roles
for select
to authenticated
using (auth.uid() = user_id);

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = _user_id
      and role = _role
  );
$$;

create table public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    full_name text,
    phone text,
    avatar_url text,
    is_staff boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;

alter table public.profiles enable row level security;

create policy "Users can read own profile"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

create policy "Users can update own profile"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "Users can insert own profile"
on public.profiles
for insert
to authenticated
with check (auth.uid() = id);

create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

create table public.categories (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    slug text not null unique,
    description text,
    image_url text,
    sort_order int not null default 0,
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

grant select on public.categories to anon, authenticated;
grant all on public.categories to service_role;

alter table public.categories enable row level security;

create policy "Active categories are publicly readable"
on public.categories
for select
to anon, authenticated
using (is_active = true);

create table public.products (
    id uuid primary key default gen_random_uuid(),
    category_id uuid references public.categories(id),
    name text not null,
    slug text not null unique,
    description text,
    base_price decimal(12,2) not null,
    compare_at_price decimal(12,2),
    status text not null default 'active' check (status in ('active', 'archived', 'discontinued')),
    is_featured boolean not null default false,
    weight_g int,
    meta_title text,
    meta_description text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

grant select on public.products to anon, authenticated;
grant all on public.products to service_role;

alter table public.products enable row level security;

create policy "Active products are publicly readable"
on public.products
for select
to anon, authenticated
using (status = 'active');

create table public.product_variants (
    id uuid primary key default gen_random_uuid(),
    product_id uuid not null references public.products(id) on delete cascade,
    sku text not null unique,
    barcode text,
    option_1 text,
    option_2 text,
    option_3 text,
    price_adjustment decimal(12,2) not null default 0,
    weight_g int,
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

grant select on public.product_variants to anon, authenticated;
grant all on public.product_variants to service_role;

alter table public.product_variants enable row level security;

create policy "Active variants of active products are publicly readable"
on public.product_variants
for select
to anon, authenticated
using (
    is_active = true
    and exists (
        select 1 from public.products
        where id = product_id and status = 'active'
    )
);

create table public.inventory (
    id uuid primary key default gen_random_uuid(),
    variant_id uuid not null unique references public.product_variants(id) on delete cascade,
    quantity int not null default 0 check (quantity >= 0),
    reserved int not null default 0 check (reserved >= 0),
    sold int not null default 0 check (sold >= 0),
    low_stock_threshold int not null default 5,
    updated_at timestamptz not null default now(),
    constraint inventory_nonnegative check (quantity >= reserved + sold)
);

grant select on public.inventory to authenticated;
grant all on public.inventory to service_role;

alter table public.inventory enable row level security;

create policy "Staff can read inventory"
on public.inventory
for select
to authenticated
using (
    public.has_role(auth.uid(), 'CEO')
    or public.has_role(auth.uid(), 'HR')
    or public.has_role(auth.uid(), 'SALES PEOPLE')
);

create table public.product_images (
    id uuid primary key default gen_random_uuid(),
    product_id uuid not null references public.products(id) on delete cascade,
    variant_id uuid references public.product_variants(id) on delete set null,
    url text not null,
    alt_text text,
    sort_order int not null default 0,
    is_primary boolean not null default false,
    created_at timestamptz not null default now()
);

grant select on public.product_images to anon, authenticated;
grant all on public.product_images to service_role;

alter table public.product_images enable row level security;

create policy "Product images are publicly readable"
on public.product_images
for select
to anon, authenticated
using (
    exists (
        select 1 from public.products
        where id = product_id and status = 'active'
    )
);

create table public.audit_logs (
    id uuid primary key default gen_random_uuid(),
    actor_id uuid references auth.users(id) on delete set null,
    action text not null,
    table_name text not null,
    record_id uuid,
    old_values jsonb,
    new_values jsonb,
    ip_address inet,
    user_agent text,
    created_at timestamptz not null default now()
);

grant insert on public.audit_logs to authenticated;
grant all on public.audit_logs to service_role;

alter table public.audit_logs enable row level security;

create policy "Staff can read audit logs"
on public.audit_logs
for select
to authenticated
using (
    public.has_role(auth.uid(), 'CEO')
    or public.has_role(auth.uid(), 'HR')
);

create or replace function public.reserve_inventory(_variant_id uuid, _qty int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    updated int;
begin
    update public.inventory
    set reserved = reserved + _qty,
        updated_at = now()
    where variant_id = _variant_id
      and (quantity - reserved - sold) >= _qty;

    get diagnostics updated = row_count;
    return updated > 0;
end;
$$;

create or replace function public.release_inventory(_variant_id uuid, _qty int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    updated int;
begin
    update public.inventory
    set reserved = greatest(reserved - _qty, 0),
        updated_at = now()
    where variant_id = _variant_id
      and reserved >= _qty;

    get diagnostics updated = row_count;
    return updated > 0;
end;
$$;

create or replace function public.commit_inventory(_variant_id uuid, _qty int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    updated int;
begin
    update public.inventory
    set reserved = greatest(reserved - _qty, 0),
        sold = sold + _qty,
        updated_at = now()
    where variant_id = _variant_id
      and reserved >= _qty;

    get diagnostics updated = row_count;
    return updated > 0;
end;
$$;

create or replace function public.get_available_inventory(_variant_id uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(quantity - reserved - sold, 0)
  from public.inventory
  where variant_id = _variant_id;
$$;

create trigger update_profiles_updated_at before update on public.profiles
for each row execute function public.update_updated_at_column();

create trigger update_categories_updated_at before update on public.categories
for each row execute function public.update_updated_at_column();

create trigger update_products_updated_at before update on public.products
for each row execute function public.update_updated_at_column();

create trigger update_product_variants_updated_at before update on public.product_variants
for each row execute function public.update_updated_at_column();

create trigger update_inventory_updated_at before update on public.inventory
for each row execute function public.update_updated_at_column();