import { supabase } from "@/integrations/supabase/client";
import type { CategoryTheme } from "@/lib/api/catalog";

/* ------------------------------- helpers ------------------------------- */

async function invoke<T>(
  fn: string,
  init: { method: "GET" | "POST" | "PATCH"; body?: unknown; params?: Record<string, string> } = {
    method: "GET",
  },
): Promise<T> {
  const query = init.params ? new URLSearchParams(init.params).toString() : "";
  const { data, error } = await supabase.functions.invoke<T>(query ? `${fn}?${query}` : fn, {
    method: init.method,
    body: init.body as Record<string, unknown> | undefined,
  });
  if (error) {
    // Surface the function's own message when it sent one.
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      try {
        const payload = await ctx.json();
        throw new Error(payload?.error ?? error.message);
      } catch (e) {
        if (e instanceof Error && e.message !== error.message) throw e;
      }
    }
    throw error;
  }
  return data as T;
}

/* -------------------------------- orders -------------------------------- */

export const ORDER_STATUSES = [
  "pending_payment",
  "paid",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
  "payment_failed",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const NEXT_STATUSES: Record<OrderStatus, OrderStatus[]> = {
  pending_payment: ["paid", "payment_failed", "cancelled"],
  paid: ["processing", "cancelled", "refunded"],
  payment_failed: ["cancelled"],
  processing: ["shipped", "cancelled", "refunded"],
  shipped: ["delivered", "refunded"],
  delivered: ["refunded"],
  cancelled: [],
  refunded: [],
};

export const STATUS_LABEL: Record<OrderStatus, string> = {
  pending_payment: "Awaiting payment",
  paid: "Paid",
  payment_failed: "Payment failed",
  processing: "Processing",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

export interface StaffOrderItem {
  id: string;
  product_name: string;
  variant_label: string | null;
  sku?: string | null;
  quantity: number;
  unit_price: number;
  total_price: number;
  variant_id?: string | null;
}

export interface StaffOrder {
  id: string;
  order_number: string;
  status: OrderStatus;
  payment_status: string;
  currency: string;
  subtotal: number;
  shipping_cost: number;
  tax_amount: number;
  discount_amount: number;
  total: number;
  notes: string | null;
  guest_email: string | null;
  guest_phone: string | null;
  created_at: string;
  updated_at: string;
  placed_at?: string;
  customer: { id: string; full_name: string | null; email: string | null; phone: string | null } | null;
  items: StaffOrderItem[];
  address?: {
    recipient_name: string;
    phone: string;
    address_line_1: string;
    address_line_2: string | null;
    city: string;
    county: string | null;
    country: string;
  } | null;
  history?: { id: string; status: string; notes: string | null; created_at: string }[];
  payments?: {
    id: string;
    provider: string;
    method: string;
    amount: number;
    status: string;
    result_desc: string | null;
    external_transaction_id: string | null;
    paid_at: string | null;
    created_at: string;
  }[];
}

export interface OrderListResponse {
  orders: StaffOrder[];
  pagination: { page: number; limit: number; total: number; total_pages: number };
}

export function listOrders(params: { status?: OrderStatus; page?: number; sort?: string } = {}) {
  const query: Record<string, string> = {
    page: String(params.page ?? 1),
    limit: "20",
    sort: params.sort ?? "newest",
  };
  if (params.status) query.status = params.status;
  return invoke<OrderListResponse>("staff-list-orders", { method: "GET", params: query });
}

export function getOrder(orderId: string) {
  return invoke<{ order: StaffOrder }>("staff-order-detail", {
    method: "GET",
    params: { order_id: orderId },
  });
}

export function updateOrderStatus(input: { order_id: string; status: OrderStatus; notes?: string }) {
  return invoke<{ success: boolean }>("staff-update-order-status", {
    method: "POST",
    body: input,
  });
}

/* ------------------------------ categories ------------------------------ */

export interface StaffCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  tagline: string | null;
  theme: CategoryTheme;
  image_url: string | null;
  sort_order: number;
  is_active: boolean;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
}

export function listStaffCategories(status?: string) {
  const params: Record<string, string> = { page: "1", page_size: "50" };
  if (status) params.status = status;
  return invoke<{ categories: StaffCategory[] }>("staff-catalog-categories", {
    method: "GET",
    params,
  });
}

export function createCategory(body: Partial<StaffCategory> & { name: string }) {
  return invoke<{ category: StaffCategory }>("staff-catalog-categories", {
    method: "POST",
    body: { action: "CREATE", ...body },
  });
}

export function updateCategory(body: Partial<StaffCategory> & { id: string }) {
  return invoke<{ category: StaffCategory }>("staff-catalog-categories", {
    method: "PATCH",
    body,
  });
}

export function setCategoryArchived(id: string, archived: boolean) {
  return invoke<{ category: StaffCategory }>("staff-catalog-categories", {
    method: "POST",
    body: archived
      ? { action: "ARCHIVE", id }
      : { action: "RESTORE", id, restore_to: "ACTIVE" },
  });
}
