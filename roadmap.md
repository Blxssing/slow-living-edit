# Mia Bella — Roadmap

## Stage 6: Seed catalog
- [ ] Real categories (skincare, lips, eyes, face, body, fragrance)
- [ ] ~18-24 real products with prices (KES), variants, inventory
- [ ] Product images (generated) uploaded to product-images bucket / public URLs

## Stage 7: Customer storefront
- [ ] Design system (tokens, fonts) — no generic AI look
- [ ] Home, category listing, product detail (ACTIVE only, promotions applied)
- [ ] Cart (local state + persisted), cart drawer

## Stage 8: Checkout + M-Pesa
- [ ] Checkout form (contact, delivery address)
- [ ] Edge fn: create order + reserve inventory
- [ ] M-Pesa STK push initiate + callback fn, payment status polling
- [ ] Order confirmation page

## Stage 9: Staff dashboard
- [ ] Auth + RBAC-aware shell/nav
- [ ] Catalog mgmt, Orders, Inventory, Payments, Analytics
