import { Link } from "react-router-dom";
import { Instagram, Mail, Phone, Send } from "lucide-react";
import { useCategories } from "@/hooks/useCatalog";

export const Footer = () => {
  const { data: categories } = useCategories();

  return (
    <footer className="mt-24 bg-foreground text-background">
      <div className="container-wide grid gap-12 py-16 md:grid-cols-4 md:py-20">
        <div className="md:col-span-2">
          <Link to="/" className="font-serif text-3xl tracking-tight">
            Mia<span className="text-primary">Bella</span>
          </Link>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-background/60">
            Beauty essentials curated in Nairobi. Clean formulas, honest pricing and
            delivery countrywide.
          </p>

          <form
            className="mt-8 flex max-w-sm items-center gap-2 rounded-full border border-background/20 p-1.5"
            onSubmit={(e) => e.preventDefault()}
          >
            <label htmlFor="newsletter" className="sr-only">
              Email address
            </label>
            <input
              id="newsletter"
              type="email"
              placeholder="Join the list"
              className="flex-1 bg-transparent px-4 text-sm outline-none placeholder:text-background/40"
            />
            <button
              type="submit"
              aria-label="Subscribe"
              className="grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>

        <nav aria-label="Shop">
          <h2 className="text-[0.68rem] font-bold uppercase tracking-[0.2em] text-background/40">
            Shop
          </h2>
          <ul className="mt-5 space-y-3 text-sm text-background/75">
            <li>
              <Link to="/products" className="hover:text-background">
                All products
              </Link>
            </li>
            {(categories ?? []).slice(0, 5).map((cat) => (
              <li key={cat.id}>
                <Link to={`/collection/${cat.slug}`} className="hover:text-background">
                  {cat.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="Company">
          <h2 className="text-[0.68rem] font-bold uppercase tracking-[0.2em] text-background/40">
            Company
          </h2>
          <ul className="mt-5 space-y-3 text-sm text-background/75">
            <li>
              <Link to="/about" className="hover:text-background">
                Our story
              </Link>
            </li>
            <li>
              <Link to="/wishlist" className="hover:text-background">
                Wishlist
              </Link>
            </li>
            <li>
              <Link to="/staff/login" className="hover:text-background">
                Staff portal
              </Link>
            </li>
            <li className="flex items-center gap-2">
              <Phone className="h-3.5 w-3.5" /> +254 700 000 000
            </li>
            <li className="flex items-center gap-2">
              <Mail className="h-3.5 w-3.5" /> hello@miabella.co.ke
            </li>
            <li className="flex items-center gap-2">
              <Instagram className="h-3.5 w-3.5" /> @miabella
            </li>
          </ul>
        </nav>
      </div>

      <div className="border-t border-background/10">
        <div className="container-wide flex flex-col items-center justify-between gap-2 py-6 text-xs text-background/45 md:flex-row">
          <p>© {new Date().getFullYear()} Mia Bella Beauty. All rights reserved.</p>
          <p>Pay securely with M-Pesa</p>
        </div>
      </div>
    </footer>
  );
};
