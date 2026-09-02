import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Heart, Minus, Plus, ShieldCheck, ShoppingBag, Truck } from "lucide-react";
import { toast } from "sonner";
import { Layout } from "@/components/Layout";
import { ProductCard } from "@/components/ProductCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useCart } from "@/hooks/useCart";
import { useWishlist } from "@/hooks/useWishlist";
import { useProduct } from "@/hooks/useCatalog";
import { formatKES, strikePrice, unitPrice } from "@/lib/api/catalog";

const ProductDetail = () => {
  const { slug } = useParams<{ slug: string }>();
  const { data, isLoading, isError } = useProduct(slug);
  const product = data?.product;

  const addItem = useCart((s) => s.addItem);
  const toggleWish = useWishlist((s) => s.toggle);
  const wished = useWishlist((s) => (product ? s.ids.includes(product.id) : false));

  const [activeImage, setActiveImage] = useState(0);
  const [variantId, setVariantId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    setActiveImage(0);
    setQuantity(1);
    setVariantId(product?.variants?.[0]?.id ?? null);
  }, [product?.id, product?.variants]);

  const variant = useMemo(
    () => product?.variants?.find((v) => v.id === variantId) ?? product?.variants?.[0] ?? null,
    [product, variantId],
  );

  const price = product ? unitPrice(product) + (variant?.price_adjustment ?? 0) : 0;
  const strike = product ? strikePrice(product) : null;

  useEffect(() => {
    if (!product) return;
    document.title = `${product.name} | Mia Bella Beauty`;
  }, [product]);

  if (isLoading) {
    return (
      <Layout>
        <div className="container-wide grid gap-10 py-12 md:grid-cols-2">
          <Skeleton className="aspect-[4/5] rounded-[1.5rem]" />
          <div className="space-y-4">
            <Skeleton className="h-10 w-3/4" />
            <Skeleton className="h-6 w-1/3" />
            <Skeleton className="h-32 w-full" />
          </div>
        </div>
      </Layout>
    );
  }

  if (isError || !product) {
    return (
      <Layout>
        <div className="container-narrow py-28 text-center">
          <h1 className="font-serif text-4xl">Product not found</h1>
          <p className="mt-3 text-muted-foreground">
            This piece may have sold out or been retired.
          </p>
          <Button asChild className="mt-8 rounded-full">
            <Link to="/products">Back to shop</Link>
          </Button>
        </div>
      </Layout>
    );
  }

  const images = product.images ?? [];
  const gallery = images.length ? images : [{ url: "", alt_text: product.name, is_primary: true, sort_order: 0 }];

  const handleAdd = () => {
    if (!variant) {
      toast.error("This product is currently unavailable");
      return;
    }
    addItem(
      {
        productId: product.id,
        variantId: variant.id,
        name: product.name,
        slug: product.slug,
        variantLabel: variant.option_1,
        image: gallery[0]?.url ?? null,
        unitPrice: price,
      },
      quantity,
    );
    toast.success(`${product.name} added to your bag`);
  };

  return (
    <Layout>
      <nav aria-label="Breadcrumb" className="container-wide py-5 text-sm text-muted-foreground">
        <Link to="/" className="hover:text-foreground">
          Home
        </Link>
        <span className="px-2">/</span>
        <Link to="/products" className="hover:text-foreground">
          Shop
        </Link>
        {product.category && (
          <>
            <span className="px-2">/</span>
            <Link
              to={`/products?category=${product.category.slug}`}
              className="hover:text-foreground"
            >
              {product.category.name}
            </Link>
          </>
        )}
      </nav>

      <section className="container-wide grid gap-10 pb-16 md:grid-cols-2 md:gap-14">
        <div className="space-y-4">
          <div className="aspect-[4/5] overflow-hidden rounded-[1.5rem] bg-muted">
            {gallery[activeImage]?.url ? (
              <img
                src={gallery[activeImage].url}
                alt={gallery[activeImage].alt_text ?? product.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="grid h-full place-items-center text-sm text-muted-foreground">
                No image
              </div>
            )}
          </div>
          {gallery.length > 1 && (
            <div className="flex gap-3 overflow-x-auto">
              {gallery.map((img, i) => (
                <button
                  key={img.url + i}
                  type="button"
                  aria-label={`View image ${i + 1}`}
                  onClick={() => setActiveImage(i)}
                  className={cn(
                    "h-20 w-16 shrink-0 overflow-hidden rounded-xl border-2 transition-colors",
                    i === activeImage ? "border-primary" : "border-transparent",
                  )}
                >
                  <img src={img.url} alt="" loading="lazy" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          {product.category && (
            <p className="text-[0.7rem] font-bold uppercase tracking-[0.2em] text-muted-foreground">
              {product.category.name}
            </p>
          )}
          <h1 className="mt-3 font-serif text-4xl leading-tight md:text-5xl">{product.name}</h1>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="text-2xl font-semibold text-primary">{formatKES(price)}</span>
            {strike && (
              <span className="text-lg text-muted-foreground line-through">{formatKES(strike)}</span>
            )}
            {product.promotion?.promotional_labels?.map((label) => (
              <span
                key={label}
                className="rounded-full gradient-cherry px-3 py-1 text-[0.65rem] font-bold uppercase tracking-widest text-primary-foreground"
              >
                {label}
              </span>
            ))}
          </div>

          {product.description && (
            <p className="mt-6 leading-relaxed text-muted-foreground">{product.description}</p>
          )}

          {product.variants && product.variants.length > 1 && (
            <div className="mt-8">
              <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
                Options
              </h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {product.variants.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setVariantId(v.id)}
                    className={cn(
                      "rounded-full border px-4 py-2 text-sm font-semibold transition-colors",
                      v.id === variant?.id
                        ? "border-foreground bg-foreground text-background"
                        : "border-border hover:bg-muted",
                    )}
                  >
                    {v.option_1 ?? v.sku}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1 rounded-full border border-border p-1">
              <button
                type="button"
                aria-label="Decrease quantity"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="grid h-10 w-10 place-items-center rounded-full hover:bg-muted"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-8 text-center font-semibold">{quantity}</span>
              <button
                type="button"
                aria-label="Increase quantity"
                onClick={() => setQuantity((q) => Math.min(20, q + 1))}
                className="grid h-10 w-10 place-items-center rounded-full hover:bg-muted"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>

            <Button size="lg" className="h-12 flex-1 rounded-full" onClick={handleAdd}>
              <ShoppingBag className="mr-2 h-4 w-4" />
              Add to bag · {formatKES(price * quantity)}
            </Button>

            <Button
              size="lg"
              variant="outline"
              aria-pressed={wished}
              className="h-12 w-12 rounded-full p-0"
              onClick={() => toggleWish(product.id)}
            >
              <Heart className={cn("h-5 w-5", wished && "fill-primary text-primary")} />
            </Button>
          </div>

          <ul className="mt-8 space-y-3 border-t border-border pt-6 text-sm text-muted-foreground">
            <li className="flex items-center gap-3">
              <Truck className="h-4 w-4 text-primary" /> Free delivery on orders over KSh 5,000
            </li>
            <li className="flex items-center gap-3">
              <ShieldCheck className="h-4 w-4 text-primary" /> Authentic products, pay with M-Pesa
            </li>
          </ul>
        </div>
      </section>

      {product.related && product.related.length > 0 && (
        <section className="container-wide pb-8">
          <h2 className="font-serif text-3xl">You may also like</h2>
          <div className="mt-8 grid gap-x-5 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            {product.related.slice(0, 4).map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}
    </Layout>
  );
};

export default ProductDetail;
