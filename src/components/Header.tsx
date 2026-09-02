import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Heart, Menu, Search, ShoppingBag, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCart } from "@/hooks/useCart";
import { useWishlist } from "@/hooks/useWishlist";
import { useCategories } from "@/hooks/useCatalog";
import { CartDrawer } from "@/components/CartDrawer";

const staticLinks = [
  { label: "Shop all", to: "/products" },
  { label: "New arrivals", to: "/products?sort=newest" },
  { label: "Best sellers", to: "/products?featured=true" },
];

export const Header = () => {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [term, setTerm] = useState("");
  const navigate = useNavigate();
  const location = useLocation();

  const itemCount = useCart((s) => s.getItemCount());
  const openCart = useCart((s) => s.openCart);
  const wishCount = useWishlist((s) => s.ids.length);
  const { data: categories } = useCategories();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
    setSearchOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!term.trim()) return;
    navigate(`/products?search=${encodeURIComponent(term.trim())}`);
    setTerm("");
  };

  const navCategories = (categories ?? []).slice(0, 5);

  return (
    <>
      <div className="gradient-cherry text-primary-foreground">
        <div className="container-wide flex h-9 items-center justify-center overflow-hidden">
          <p className="whitespace-nowrap text-[0.68rem] font-semibold uppercase tracking-[0.18em]">
            Free delivery on orders over KSh 5,000 · New drop just landed
          </p>
        </div>
      </div>

      <header
        className={cn(
          "sticky top-0 z-50 transition-all duration-300",
          scrolled
            ? "border-b border-border bg-background/85 backdrop-blur-xl"
            : "bg-background",
        )}
      >
        <div className="container-wide flex h-16 items-center justify-between gap-4 md:h-20">
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => setMenuOpen(true)}
            className="grid h-10 w-10 place-items-center rounded-full hover:bg-muted lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>

          <Link
            to="/"
            className="font-serif text-xl font-semibold tracking-tight md:text-2xl lg:mr-6"
          >
            Mia<span className="text-primary">Bella</span>
          </Link>

          <nav aria-label="Main" className="hidden flex-1 items-center justify-center gap-7 lg:flex">
            {staticLinks.map((link) => (
              <Link
                key={link.label}
                to={link.to}
                className="link-underline text-sm font-semibold text-foreground/80 transition-colors hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
            {navCategories.map((cat) => (
              <Link
                key={cat.id}
                to={`/collection/${cat.slug}`}
                className="link-underline text-sm font-semibold text-foreground/80 transition-colors hover:text-foreground"
              >
                {cat.name}
              </Link>
            ))}
            <Link
              to="/about"
              className="link-underline text-sm font-semibold text-foreground/80 transition-colors hover:text-foreground"
            >
              About
            </Link>
          </nav>

          <div className="flex items-center gap-0.5">
            <button
              type="button"
              aria-label="Search products"
              onClick={() => setSearchOpen((v) => !v)}
              className="grid h-10 w-10 place-items-center rounded-full hover:bg-muted"
            >
              <Search className="h-[1.15rem] w-[1.15rem]" />
            </button>
            <Link
              to="/wishlist"
              aria-label={`Wishlist, ${wishCount} items`}
              className="relative hidden h-10 w-10 place-items-center rounded-full hover:bg-muted md:grid"
            >
              <Heart className="h-[1.15rem] w-[1.15rem]" />
              {wishCount > 0 && (
                <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-primary" />
              )}
            </Link>
            <button
              type="button"
              onClick={openCart}
              aria-label={`Shopping bag, ${itemCount} items`}
              className="relative grid h-10 w-10 place-items-center rounded-full hover:bg-muted"
            >
              <ShoppingBag className="h-[1.15rem] w-[1.15rem]" />
              {itemCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[0.65rem] font-bold text-primary-foreground">
                  {itemCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {searchOpen && (
          <div className="border-t border-border bg-background">
            <form onSubmit={submitSearch} className="container-wide flex items-center gap-3 py-4">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                autoFocus
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="Search lipsticks, serums, perfume…"
                aria-label="Search products"
                className="flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
              />
              <button type="button" aria-label="Close search" onClick={() => setSearchOpen(false)}>
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </form>
          </div>
        )}
      </header>

      {menuOpen && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-background lg:hidden">
          <div className="flex h-16 items-center justify-between px-5">
            <span className="font-serif text-xl font-semibold">
              Mia<span className="text-primary">Bella</span>
            </span>
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setMenuOpen(false)}
              className="grid h-10 w-10 place-items-center rounded-full hover:bg-muted"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <nav aria-label="Mobile" className="flex-1 overflow-y-auto px-5 py-6">
            <ul className="space-y-1">
              {[...staticLinks, ...navCategories.map((c) => ({ label: c.name, to: `/collection/${c.slug}` })), { label: "About", to: "/about" }, { label: "Wishlist", to: "/wishlist" }].map(
                (link) => (
                  <li key={link.label}>
                    <Link
                      to={link.to}
                      className="block border-b border-border py-4 font-serif text-2xl"
                    >
                      {link.label}
                    </Link>
                  </li>
                ),
              )}
            </ul>
          </nav>
        </div>
      )}

      <CartDrawer />
    </>
  );
};
