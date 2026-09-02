import { Link } from "react-router-dom";
import { Heart } from "lucide-react";
import { Layout } from "@/components/Layout";
import { ProductCard } from "@/components/ProductCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useProducts } from "@/hooks/useCatalog";
import { useWishlist } from "@/hooks/useWishlist";

const Wishlist = () => {
  const ids = useWishlist((s) => s.ids);
  const clear = useWishlist((s) => s.clear);
  const { data, isLoading } = useProducts({ limit: 100 });

  const saved = (data?.products ?? []).filter((p) => ids.includes(p.id));

  return (
    <Layout>
      <section className="border-b border-border bg-secondary">
        <div className="container-wide py-12">
          <h1 className="font-serif text-4xl md:text-5xl">Wishlist</h1>
          <p className="mt-2 text-muted-foreground">{ids.length} saved item(s)</p>
        </div>
      </section>

      <div className="container-wide py-12">
        {isLoading ? (
          <div className="grid gap-x-5 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="aspect-[4/5] rounded-[1.25rem]" />
            ))}
          </div>
        ) : saved.length === 0 ? (
          <div className="py-20 text-center">
            <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-secondary">
              <Heart className="h-8 w-8 text-primary" />
            </div>
            <h2 className="mt-6 font-serif text-3xl">Nothing saved yet</h2>
            <p className="mt-3 text-muted-foreground">
              Tap the heart on any product to keep it here.
            </p>
            <Button asChild className="mt-8 rounded-full">
              <Link to="/products">Browse products</Link>
            </Button>
          </div>
        ) : (
          <>
            <div className="grid gap-x-5 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
              {saved.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
            <div className="mt-10 text-center">
              <Button variant="ghost" className="rounded-full" onClick={clear}>
                Clear wishlist
              </Button>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
};

export default Wishlist;
