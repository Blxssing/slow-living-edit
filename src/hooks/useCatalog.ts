import { useQuery } from "@tanstack/react-query";
import {
  fetchCategories,
  fetchProduct,
  fetchProducts,
  type ProductQuery,
} from "@/lib/api/catalog";

export function useProducts(query: ProductQuery = {}) {
  return useQuery({
    queryKey: ["products", query],
    queryFn: () => fetchProducts(query),
    staleTime: 60_000,
  });
}

export function useProduct(slug: string | undefined) {
  return useQuery({
    queryKey: ["product", slug],
    queryFn: () => fetchProduct(slug as string),
    enabled: Boolean(slug),
    staleTime: 60_000,
  });
}

export function useCategories() {
  return useQuery({
    queryKey: ["categories"],
    queryFn: fetchCategories,
    staleTime: 5 * 60_000,
  });
}
