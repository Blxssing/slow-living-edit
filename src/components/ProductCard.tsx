import { Link } from "react-router-dom";
import { Heart, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useCart } from "@/hooks/useCart";
import { useWishlist } from "@/hooks/useWishlist";
import {
  formatKES,
  primaryImage,
  strikePrice,
  unitPrice,
  type CatalogProduct,
} from "@/lib/api/catalog";

interface ProductCardProps {
  product: CatalogProduct;
  className?: string;
  priority?: boolean;
}

export const ProductCard = ({ product, className, priority }: ProductCardProps) => {
  const addItem = useCart((s) => s.addItem);
  const toggleWish = useWishlist((s) => s.toggle);
  const wished = useWishlist((s) => s.ids.includes(product.id));

  const image = primaryImage(product);
  const price = unitPrice(product);
  const strike = strikePrice(product);
  const variant = product.variants?.[0];
  const label = product.promotion?.promotional_labels?.[0];

  const handleAdd = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!variant) {
      toast.error("This product is currently unavailable");
      return;
    }
    addItem({
      productId: product.id,
      variantId: variant.id,
      name: product.name,
      slug: product.slug,
      variantLabel: variant.option_1,
      image: image?.url ?? null,
      unitPrice: price + (variant.price_adjustment ?? 0),
    });
    toast.success(`${product.name} added to your bag`);
  };

  return (
    <article className={cn("group relative", className)}>
      <Link to={`/product/${product.slug}`} className="block">
        <div className="image-zoom relative aspect-[4/5] rounded-[1.25rem] bg-muted">
          {image ? (
            <img
              src={image.url}
              alt={image.alt_text ?? product.name}
              loading={priority ? "eager" : "lazy"}
              decoding="async"
              className="h-full w-full rounded-[1.25rem] object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No image
            </div>
          )}

          <div className="pointer-events-none absolute left-3 top-3 flex flex-col gap-2">
            {label && (
              <span className="rounded-full gradient-cherry px-3 py-1 text-[0.65rem] font-bold uppercase tracking-widest text-primary-foreground">
                {label}
              </span>
            )}
            {!label && strike && (
              <span className="rounded-full bg-primary px-3 py-1 text-[0.65rem] font-bold uppercase tracking-widest text-primary-foreground">
                Sale
              </span>
            )}
            {product.is_featured && !label && !strike && (
              <span className="rounded-full bg-secondary px-3 py-1 text-[0.65rem] font-bold uppercase tracking-widest text-secondary-foreground">
                Best seller
              </span>
            )}
          </div>

          <button
            type="button"
            aria-label={wished ? `Remove ${product.name} from wishlist` : `Save ${product.name} to wishlist`}
            aria-pressed={wished}
            onClick={(e) => {
              e.preventDefault();
              toggleWish(product.id);
            }}
            className="absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-full bg-background/85 backdrop-blur transition-colors hover:bg-background"
          >
            <Heart className={cn("h-4 w-4", wished ? "fill-primary text-primary" : "text-foreground")} />
          </button>

          <button
            type="button"
            onClick={handleAdd}
            className="absolute inset-x-3 bottom-3 flex h-11 items-center justify-center gap-2 rounded-full bg-foreground text-sm font-semibold text-background opacity-0 transition-all duration-300 focus-visible:opacity-100 group-hover:opacity-100 md:translate-y-2 md:group-hover:translate-y-0"
          >
            <ShoppingBag className="h-4 w-4" />
            Add to bag
          </button>
        </div>

        <div className="mt-4 space-y-1">
          {product.category && (
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {product.category.name}
            </p>
          )}
          <h3 className="font-serif text-lg leading-snug">{product.name}</h3>
          <p className="flex items-baseline gap-2">
            <span className="text-base font-semibold text-primary">{formatKES(price)}</span>
            {strike && (
              <span className="text-sm text-muted-foreground line-through">{formatKES(strike)}</span>
            )}
          </p>
        </div>
      </Link>

      <button
        type="button"
        onClick={handleAdd}
        className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-full border border-foreground/15 text-sm font-semibold transition-colors hover:bg-foreground hover:text-background md:hidden"
      >
        <ShoppingBag className="h-4 w-4" />
        Add to bag
      </button>
    </article>
  );
};
