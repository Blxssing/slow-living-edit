import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { ProductCard } from "@/components/ProductCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useCategories, useProducts } from "@/hooks/useCatalog";
import type { SortKey } from "@/lib/api/catalog";

const sortOptions: { value: SortKey; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
  { value: "name_asc", label: "Name A–Z" },
];

const Products = () => {
  const [params, setParams] = useSearchParams();
  const category = params.get("category") ?? undefined;
  const search = params.get("search") ?? undefined;
  const featured = params.get("featured") === "true";
  const sort = (params.get("sort") as SortKey) ?? "newest";
  const page = Number(params.get("page") ?? 1);

  const query = useMemo(
    () => ({ category_slug: category, search, featured, sort, page, limit: 24 }),
    [category, search, featured, sort, page],
  );

  const { data, isLoading, isError } = useProducts(query);
  const { data: categories } = useCategories();

  const update = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => {
      if (!v) next.delete(k);
      else next.set(k, v);
    });
    if (!("page" in patch)) next.delete("page");
    setParams(next);
  };

  const heading = search
    ? `Results for “${search}”`
    : featured
      ? "Best sellers"
      : categories?.find((c) => c.slug === category)?.name ?? "All products";

  const pagination = data?.pagination;

  return (
    <Layout>
      <section className="border-b border-border bg-secondary">
        <div className="container-wide py-12 md:py-16">
          <h1 className="font-serif text-4xl md:text-5xl">{heading}</h1>
          <p className="mt-3 text-muted-foreground">
            {pagination ? `${pagination.total} products` : "Loading products…"}
          </p>
        </div>
      </section>

      <div className="container-wide py-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => update({ category: undefined, featured: undefined })}
              className={cn(
                "rounded-full border px-4 py-2 text-sm font-semibold transition-colors",
                !category && !featured
                  ? "border-foreground bg-foreground text-background"
                  : "border-border hover:bg-muted",
              )}
            >
              All
            </button>
            {(categories ?? []).map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => update({ category: cat.slug, featured: undefined })}
                className={cn(
                  "rounded-full border px-4 py-2 text-sm font-semibold transition-colors",
                  category === cat.slug
                    ? "border-foreground bg-foreground text-background"
                    : "border-border hover:bg-muted",
                )}
              >
                {cat.name}
              </button>
            ))}
          </div>

          <Select value={sort} onValueChange={(v) => update({ sort: v })}>
            <SelectTrigger className="w-52 rounded-full">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              {sortOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isError && (
          <p className="py-20 text-center text-muted-foreground">
            We couldn’t load products right now. Please try again.
          </p>
        )}

        <div className="mt-10 grid gap-x-5 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          {isLoading
            ? Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="aspect-[4/5] rounded-[1.25rem]" />
              ))
            : (data?.products ?? []).map((p) => <ProductCard key={p.id} product={p} />)}
        </div>

        {!isLoading && (data?.products?.length ?? 0) === 0 && (
          <div className="py-24 text-center">
            <p className="font-serif text-2xl">Nothing here yet</p>
            <p className="mt-2 text-muted-foreground">
              Try another category or clear your filters.
            </p>
            <Button
              variant="outline"
              className="mt-6 rounded-full"
              onClick={() => setParams(new URLSearchParams())}
            >
              Clear filters
            </Button>
          </div>
        )}

        {pagination && pagination.total_pages > 1 && (
          <div className="mt-14 flex items-center justify-center gap-3">
            <Button
              variant="outline"
              className="rounded-full"
              disabled={page <= 1}
              onClick={() => update({ page: String(page - 1) })}
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {pagination.page} of {pagination.total_pages}
            </span>
            <Button
              variant="outline"
              className="rounded-full"
              disabled={page >= pagination.total_pages}
              onClick={() => update({ page: String(page + 1) })}
            >
              Next
            </Button>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Products;
