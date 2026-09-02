import { supabase } from "@/integrations/supabase/client";

export interface ProductImage {
  url: string;
  alt_text: string | null;
  is_primary: boolean;
  sort_order: number;
}

export interface ProductVariant {
  id: string;
  sku: string;
  option_1: string | null;
  option_2: string | null;
  option_3: string | null;
  price_adjustment: number;
}

export interface Promotion {
  base_price: number;
  discount_amount: number;
  effective_price: number;
  offer_id: string | null;
  offer_type: string | null;
  offer_value: number | null;
  discount_percent: number | null;
  promotional_labels: string[];
  ends_at: string | null;
}

export type CategoryTheme = "default" | "gold-pink" | "diamond-cream" | "silver-orange";

export interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  image_url?: string | null;
  tagline?: string | null;
  theme?: CategoryTheme | null;
  product_count?: number;
}

export interface CatalogProduct {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  base_price: number;
  compare_at_price: number | null;
  is_featured: boolean;
  promotion: Promotion | null;
  category: Category | null;
  images: ProductImage[];
  variants: ProductVariant[];
}

export interface ProductListResponse {
  products: CatalogProduct[];
  pagination: { page: number; limit: number; total: number; total_pages: number };
}

export type SortKey = "newest" | "price_asc" | "price_desc" | "name_asc";

export interface ProductQuery {
  category_slug?: string;
  search?: string;
  featured?: boolean;
  page?: number;
  limit?: number;
  sort?: SortKey;
}

async function invokeGet<T>(fn: string, params: Record<string, string> = {}): Promise<T> {
  const query = new URLSearchParams(params).toString();
  const { data, error } = await supabase.functions.invoke<T>(
    query ? `${fn}?${query}` : fn,
    { method: "GET" },
  );
  if (error) throw error;
  return data as T;
}

export function fetchProducts(query: ProductQuery = {}) {
  const params: Record<string, string> = {};
  if (query.category_slug) params.category_slug = query.category_slug;
  if (query.search) params.search = query.search;
  if (query.featured) params.featured = "true";
  params.page = String(query.page ?? 1);
  params.limit = String(query.limit ?? 24);
  params.sort = query.sort ?? "newest";
  return invokeGet<ProductListResponse>("public-products", params);
}

export function fetchProduct(slug: string) {
  return invokeGet<{ product: CatalogProduct & { related?: CatalogProduct[] } }>(
    "public-product-detail",
    { slug },
  );
}

export async function fetchCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, slug, description, image_url, tagline, theme, sort_order")
    .eq("status", "ACTIVE")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Category[];
}

/** Final price a customer pays for one unit, promotions applied. */
export function unitPrice(product: Pick<CatalogProduct, "base_price" | "promotion">): number {
  return product.promotion?.effective_price ?? product.base_price;
}

export function strikePrice(product: CatalogProduct): number | null {
  if (product.promotion && product.promotion.discount_amount > 0) return product.promotion.base_price;
  if (product.compare_at_price && product.compare_at_price > product.base_price) {
    return product.compare_at_price;
  }
  return null;
}

export function primaryImage(product: CatalogProduct): ProductImage | null {
  return product.images?.find((i) => i.is_primary) ?? product.images?.[0] ?? null;
}

export function formatKES(amount: number): string {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 0,
  }).format(amount);
}
