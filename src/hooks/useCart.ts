import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface CartLine {
  productId: string;
  variantId: string;
  name: string;
  slug: string;
  variantLabel: string | null;
  image: string | null;
  unitPrice: number;
  quantity: number;
}

interface CartState {
  items: CartLine[];
  isOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
  addItem: (line: Omit<CartLine, "quantity">, quantity?: number) => void;
  updateQuantity: (variantId: string, quantity: number) => void;
  removeItem: (variantId: string) => void;
  clearCart: () => void;
  getSubtotal: () => number;
  getItemCount: () => number;
}

const MAX_QTY = 20;

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      isOpen: false,

      openCart: () => set({ isOpen: true }),
      closeCart: () => set({ isOpen: false }),

      addItem: (line, quantity = 1) => {
        set((state) => {
          const existing = state.items.find((i) => i.variantId === line.variantId);
          if (existing) {
            return {
              isOpen: true,
              items: state.items.map((i) =>
                i.variantId === line.variantId
                  ? { ...i, quantity: Math.min(i.quantity + quantity, MAX_QTY) }
                  : i,
              ),
            };
          }
          return { isOpen: true, items: [...state.items, { ...line, quantity }] };
        });
      },

      updateQuantity: (variantId, quantity) => {
        if (quantity < 1) {
          get().removeItem(variantId);
          return;
        }
        set((state) => ({
          items: state.items.map((i) =>
            i.variantId === variantId ? { ...i, quantity: Math.min(quantity, MAX_QTY) } : i,
          ),
        }));
      },

      removeItem: (variantId) =>
        set((state) => ({ items: state.items.filter((i) => i.variantId !== variantId) })),

      clearCart: () => set({ items: [] }),

      getSubtotal: () => get().items.reduce((t, i) => t + i.unitPrice * i.quantity, 0),

      getItemCount: () => get().items.reduce((c, i) => c + i.quantity, 0),
    }),
    {
      name: "mia-bella-cart",
      partialize: (state) => ({ items: state.items }) as CartState,
    },
  ),
);

export const FREE_DELIVERY_THRESHOLD = 5000;
export const DELIVERY_FEE = 350;

export function deliveryFeeFor(subtotal: number) {
  return subtotal >= FREE_DELIVERY_THRESHOLD || subtotal === 0 ? 0 : DELIVERY_FEE;
}
