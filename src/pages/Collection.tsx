import { useMemo } from "react";
import { Navigate, useParams, useSearchParams } from "react-router-dom";
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
import { useCategories, useProducts } from "@/hooks/useCatalog";
import { themeClass } from "@/lib/theme/categoryTheme";
import type { SortKey } from "@/lib/api/catalog";

const sortOptions: { value: SortKey; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
  { value: "name_asc", label: "Name A–Z" },
];

const Collection = () => {
  const { slug } = useParams<{ slug: string }>();
  const [params, setParams] = useSearchParams();
  const sort = (params.get("sort") as SortKey) ?? "newest";
  const page = Number(params.get("page") ?? 1);

  const { data: categories, isLoading: catsLoading } = useCategories();
  const category = categories?.find((c) => c.slug === slug);

  const query = useMemo(
    () => ({ category_slug: slug, sort, page, limit: 24 }),
    [slug, sort, page],
  );
  const { data, isLoading } = useProducts(query);

  if (!catsLoading && categories && !category) {
    return <Navigate to="/products" replace />;
  }

  const update = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    if (!("page" in patch)) next.delete("page");
    setParams(next);
  };

  const pagination = data?.pagination;

  return (
    <Layout>
      <div className={themeClass(category?.theme)}>
        <section className="gradient-theme-soft border-b border-border">
          <div className="container-wide grid gap-8 py-14 md:grid-cols-[1.1fr,0.9fr] md:items-center md:py-20">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary">
                Collection
              </p>
              <h1 className="mt-3 font-serif text-4xl md:text-6xl">
                {category?.name ?? "Collection"}
              </h1>
              {category?.tagline && (
                <p className="mt-4 text-lg font-medium text-accent-foreground/80">
                  {category.tagline}
                </p>
              )}
              {category?.description && (
                <p className="mt-4 max-w-xl text-muted-foreground">{category.description}</p>
              )}
              <p className="mt-6 text-sm text-muted-foreground">
                {pagination ? `${pagination.total} available` : "Loading…"}
              </p>
            </div>
            {category?.image_url && (
              <div className="shadow-theme overflow-hidden rounded-[1.5rem]">
                <img
                  src={category.image_url}
                  alt={category.name}
                  className="aspect-[4/3] w-full object-cover"
                  loading="eager"
                />
              </div>
            )}
          </div>
        </section>

        <div className="bg-background pb-20">
          <div className="container-wide py-8">
            <div className="flex justify-end">
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

            <div className="mt-8 grid gap-x-5 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
              {isLoading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <Skeleton key={i} className="aspect-[4/5] rounded-[1.25rem]" />
                  ))
                : (data?.products ?? []).map((p) => <ProductCard key={p.id} product={p} />)}
            </div>

            {!isLoading && (data?.products?.length ?? 0) === 0 && (
              <p className="py-24 text-center text-muted-foreground">
                Nothing in this collection yet — check back soon.
              </p>
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
        </div>
      </div>
    </Layout>
  );
};

export default Collection;
