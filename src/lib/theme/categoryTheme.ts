import type { CategoryTheme } from "@/lib/api/catalog";

/**
 * Category themes are data, not code: the sales panel picks one of these keys
 * per collection and the storefront re-maps its semantic tokens accordingly.
 */
export const CATEGORY_THEMES: { value: CategoryTheme; label: string }[] = [
  { value: "default", label: "Brand default (cherry & pink)" },
  { value: "gold-pink", label: "Gold with pink" },
  { value: "diamond-cream", label: "Diamond with cream" },
  { value: "silver-orange", label: "Silver with orange" },
];

export function themeClass(theme?: CategoryTheme | string | null): string {
  switch (theme) {
    case "gold-pink":
      return "theme-gold-pink";
    case "diamond-cream":
      return "theme-diamond-cream";
    case "silver-orange":
      return "theme-silver-orange";
    default:
      return "theme-default";
  }
}
