import { Link } from "react-router-dom";
import { ArrowRight, Leaf, ShieldCheck, Truck } from "lucide-react";
import { Layout } from "@/components/Layout";
import { ProductCard } from "@/components/ProductCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCategories, useProducts } from "@/hooks/useCatalog";

const perks = [
  { icon: Truck, title: "Countrywide delivery", copy: "Free over KSh 5,000" },
  { icon: ShieldCheck, title: "100% authentic", copy: "Sourced from brand partners" },
  { icon: Leaf, title: "Clean formulas", copy: "Cruelty free, always" },
];

const Index = () => {
  const { data: featured, isLoading: loadingFeatured } = useProducts({ featured: true, limit: 8 });
  const { data: latest, isLoading: loadingLatest } = useProducts({ sort: "newest", limit: 8 });
  const { data: categories } = useCategories();

  return (
    <Layout>
      <section className="relative overflow-hidden bg-secondary">
        <div className="container-wide grid items-center gap-10 py-16 md:grid-cols-2 md:py-24">
          <div className="max-w-xl">
            <p className="text-[0.7rem] font-bold uppercase tracking-[0.24em] text-primary">
              New season beauty
            </p>
            <h1 className="mt-4 font-serif text-4xl leading-[1.05] md:text-6xl">
              Glow that feels like <span className="text-gradient-cherry">you</span>.
            </h1>
            <p className="mt-5 text-base leading-relaxed text-muted-foreground md:text-lg">
              Skincare, colour and fragrance chosen by our Nairobi studio — tested on
              real routines, priced honestly, delivered fast.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="rounded-full px-8">
                <Link to="/products">
                  Shop the collection
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="rounded-full px-8">
                <Link to="/products?featured=true">Best sellers</Link>
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {(featured?.products ?? []).slice(0, 2).map((p, i) => (
              <div key={p.id} className={i === 1 ? "mt-10" : ""}>
                <ProductCard product={p} priority />
              </div>
            ))}
            {loadingFeatured &&
              [0, 1].map((i) => (
                <Skeleton key={i} className={`aspect-[4/5] rounded-[1.25rem] ${i === 1 ? "mt-10" : ""}`} />
              ))}
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-background">
        <div className="container-wide grid gap-6 py-8 sm:grid-cols-3">
          {perks.map((perk) => (
            <div key={perk.title} className="flex items-center gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-secondary">
                <perk.icon className="h-5 w-5 text-primary" />
              </span>
              <span>
                <span className="block text-sm font-semibold">{perk.title}</span>
                <span className="block text-sm text-muted-foreground">{perk.copy}</span>
              </span>
            </div>
          ))}
        </div>
      </section>

      {(categories?.length ?? 0) > 0 && (
        <section className="container-wide py-16 md:py-20">
          <h2 className="font-serif text-3xl md:text-4xl">Shop by category</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {categories!.slice(0, 8).map((cat) => (
              <Link
                key={cat.id}
                to={`/products?category=${cat.slug}`}
                className="image-zoom group relative flex aspect-[5/4] items-end overflow-hidden rounded-[1.25rem] bg-muted p-5"
              >
                {cat.image_url && (
                  <img
                    src={cat.image_url}
                    alt={cat.name}
                    loading="lazy"
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                )}
                <span className="absolute inset-0 bg-gradient-to-t from-foreground/70 to-transparent" />
                <span className="relative font-serif text-xl text-background">{cat.name}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="container-wide py-8 md:py-12">
        <div className="flex items-end justify-between gap-4">
          <h2 className="font-serif text-3xl md:text-4xl">Best sellers</h2>
          <Link to="/products?featured=true" className="link-underline text-sm font-semibold">
            View all
          </Link>
        </div>
        <div className="mt-8 grid gap-x-5 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          {loadingFeatured
            ? [0, 1, 2, 3].map((i) => <Skeleton key={i} className="aspect-[4/5] rounded-[1.25rem]" />)
            : (featured?.products ?? []).slice(0, 4).map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
        </div>
      </section>

      <section className="container-wide py-8 md:py-16">
        <div className="flex items-end justify-between gap-4">
          <h2 className="font-serif text-3xl md:text-4xl">Just landed</h2>
          <Link to="/products?sort=newest" className="link-underline text-sm font-semibold">
            View all
          </Link>
        </div>
        <div className="mt-8 grid gap-x-5 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          {loadingLatest
            ? [0, 1, 2, 3].map((i) => <Skeleton key={i} className="aspect-[4/5] rounded-[1.25rem]" />)
            : (latest?.products ?? []).slice(0, 4).map((p) => <ProductCard key={p.id} product={p} />)}
        </div>
      </section>
    </Layout>
  );
};

export default Index;
