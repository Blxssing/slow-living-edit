import { z } from 'npm:zod@3'
import { getServiceRoleClient } from './supabase.ts'

/**
 * Centralised inventory service.
 *
 * Every stock change in the system flows through `apply_inventory_movement`
 * (or the reservation wrappers) inside Postgres, which locks the inventory row,
 * validates the transition, writes the immutable ledger entry and the audit log
 * in one transaction. No caller ever computes stock levels client-side.
 *
 * Stock model (unchanged from the existing schema):
 *   available = quantity - reserved - sold
 *   `sold` stays inside `quantity` as a lifetime counter of shipped units.
 */

export const MOVEMENT_TYPES = [
  'INITIAL_STOCK',
  'RESTOCK',
  'RESERVATION',
  'RESERVATION_RELEASE',
  'RESERVATION_EXPIRED',
  'SALE',
  'RETURN_RESTOCK',
  'RETURN_DAMAGED',
  'RETURN_NON_RESELLABLE',
  'DAMAGE',
  'LOSS',
  'MANUAL_ADJUSTMENT',
  'CORRECTION',
] as const

export type MovementType = (typeof MOVEMENT_TYPES)[number]

export const RESERVATION_STATUSES = [
  'ACTIVE',
  'CONVERTED',
  'RELEASED',
  'EXPIRED',
  'CANCELLED',
] as const

export const QuantitySchema = z.coerce
  .number()
  .int('Quantity must be a whole number')
  .refine((n) => Number.isFinite(n), 'Quantity must be numeric')

export const PositiveQuantitySchema = QuantitySchema.refine(
  (n) => n > 0,
  'Quantity must be greater than zero',
).refine((n) => n <= 1_000_000, 'Quantity is out of range')

export const ReasonSchema = z
  .string()
  .transform((s) => s.replace(/\s+/g, ' ').trim())
  .refine((s) => s.length >= 3, 'A reason of at least 3 characters is required')
  .refine((s) => s.length <= 500, 'Reason is too long')
  .refine((s) => !/[<>]/.test(s), 'HTML markup is not allowed')

export const NotesSchema = z
  .string()
  .transform((s) => s.replace(/\s+/g, ' ').trim())
  .refine((s) => s.length <= 1000, 'Notes are too long')
  .refine((s) => !/[<>]/.test(s), 'HTML markup is not allowed')
  .optional()

export const IdempotencySchema = z
  .string()
  .regex(/^[A-Za-z0-9_.:-]{8,120}$/, 'Invalid idempotency key')
  .optional()

/** Maps engine error codes to HTTP status + a customer-safe message. */
const ERROR_MAP: Record<string, { status: number; message: string }> = {
  INVENTORY_NOT_FOUND: { status: 404, message: 'Inventory record not found' },
  RESERVATION_NOT_FOUND: { status: 404, message: 'Reservation not found' },
  INSUFFICIENT_STOCK: { status: 409, message: 'Insufficient available stock' },
  NEGATIVE_STOCK: { status: 409, message: 'Operation would drive stock negative' },
  RESERVATION_INVALID: { status: 409, message: 'Reserved quantity is insufficient' },
  RETURN_EXCEEDS_SOLD: { status: 409, message: 'Return exceeds the quantity sold' },
  QUANTITY_INVALID: { status: 422, message: 'Quantity is invalid' },
  QUANTITY_OUT_OF_RANGE: { status: 422, message: 'Quantity is out of range' },
  MOVEMENT_TYPE_INVALID: { status: 422, message: 'Unknown movement type' },
  STATUS_INVALID: { status: 422, message: 'Invalid reservation status' },
}

export interface InventoryFailure {
  ok: false
  status: number
  message: string
}

export interface InventorySuccess<T> {
  ok: true
  data: T
}

export type InventoryResult<T> = InventorySuccess<T> | InventoryFailure

export function mapInventoryError(raw: unknown): InventoryFailure {
  const message = typeof raw === 'string' ? raw : ((raw as { message?: string })?.message ?? '')
  for (const [code, mapped] of Object.entries(ERROR_MAP)) {
    if (message.includes(code)) return { ok: false, ...mapped }
  }
  console.error('inventory engine error:', message)
  return { ok: false, status: 500, message: 'Inventory operation failed' }
}

export interface StockSnapshot {
  variant_id: string
  quantity: number
  reserved: number
  sold: number
  returned: number
  damaged: number
  lost: number
  available: number
  status: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK'
  movement_id?: string
  duplicate?: boolean
  reservation_id?: string
  expires_at?: string
}

async function callRpc<T>(fn: string, args: Record<string, unknown>): Promise<InventoryResult<T>> {
  const supabase = getServiceRoleClient()
  const { data, error } = await supabase.rpc(fn, args)
  if (error) return mapInventoryError(error)
  return { ok: true, data: data as T }
}

/* --------------------------- read operations --------------------------- */

export function stockStatus(available: number, threshold: number) {
  if (available <= 0) return 'OUT_OF_STOCK' as const
  if (available <= threshold) return 'LOW_STOCK' as const
  return 'IN_STOCK' as const
}

/** Public-safe view: availability and status only, never internal counters. */
export function publicStock(row: { quantity: number; reserved: number; sold: number; low_stock_threshold: number }) {
  const available = row.quantity - row.reserved - row.sold
  return { available: Math.max(available, 0), status: stockStatus(available, row.low_stock_threshold) }
}

export async function getInventory(variantId: string) {
  const supabase = getServiceRoleClient()
  const { data, error } = await supabase
    .from('inventory')
    .select('id, variant_id, quantity, reserved, sold, returned, damaged, lost, low_stock_threshold, updated_at')
    .eq('variant_id', variantId)
    .maybeSingle()
  if (error) return mapInventoryError(error)
  if (!data) return { ok: false as const, status: 404, message: 'Inventory record not found' }
  const available = data.quantity - data.reserved - data.sold
  return {
    ok: true as const,
    data: { ...data, available, status: stockStatus(available, data.low_stock_threshold) },
  }
}

export async function getAvailableStock(variantId: string) {
  const res = await getInventory(variantId)
  return res.ok ? res.data.available : 0
}

/* -------------------------- write operations --------------------------- */

interface MovementInput {
  variantId: string
  quantity: number
  reason: string
  actorId: string | null
  notes?: string
  referenceType?: string | null
  referenceId?: string | null
  idempotencyKey?: string | null
}

function movement(type: MovementType, input: MovementInput) {
  return callRpc<StockSnapshot>('apply_inventory_movement', {
    _variant_id: input.variantId,
    _movement_type: type,
    _quantity: input.quantity,
    _reason: input.reason,
    _actor_id: input.actorId,
    _notes: input.notes ?? null,
    _reference_type: input.referenceType ?? null,
    _reference_id: input.referenceId ?? null,
    _idempotency_key: input.idempotencyKey ?? null,
    _reservation_id: null,
  })
}

export const restockInventory = (i: MovementInput) => movement('RESTOCK', i)
export const adjustInventory = (i: MovementInput) => movement('MANUAL_ADJUSTMENT', i)
export const recordDamage = (i: MovementInput) => movement('DAMAGE', i)
export const recordLoss = (i: MovementInput) => movement('LOSS', i)

export function processReturn(
  disposition: 'RESTOCKED' | 'DAMAGED' | 'NON_RESELLABLE',
  input: MovementInput,
) {
  const type: MovementType =
    disposition === 'RESTOCKED'
      ? 'RETURN_RESTOCK'
      : disposition === 'DAMAGED'
        ? 'RETURN_DAMAGED'
        : 'RETURN_NON_RESELLABLE'
  return movement(type, input)
}

export function reserveStock(input: {
  variantId: string
  quantity: number
  referenceType?: 'CART' | 'ORDER' | 'MANUAL' | 'SYSTEM'
  referenceId?: string | null
  ttlMinutes?: number
  actorId: string | null
  idempotencyKey?: string | null
}) {
  return callRpc<StockSnapshot>('reserve_stock', {
    _variant_id: input.variantId,
    _quantity: input.quantity,
    _reference_type: input.referenceType ?? 'CART',
    _reference_id: input.referenceId ?? null,
    _ttl_minutes: input.ttlMinutes ?? 30,
    _actor_id: input.actorId,
    _idempotency_key: input.idempotencyKey ?? null,
  })
}

export function releaseReservation(input: {
  reservationId: string
  actorId: string | null
  finalStatus?: 'RELEASED' | 'CANCELLED' | 'EXPIRED'
  reason?: string
}) {
  return callRpc<StockSnapshot>('release_reservation', {
    _reservation_id: input.reservationId,
    _actor_id: input.actorId,
    _final_status: input.finalStatus ?? 'RELEASED',
    _reason: input.reason ?? 'Reservation released',
  })
}

export function commitSale(input: {
  reservationId: string
  actorId: string | null
  idempotencyKey?: string | null
}) {
  return callRpc<StockSnapshot>('commit_reservation', {
    _reservation_id: input.reservationId,
    _actor_id: input.actorId,
    _idempotency_key: input.idempotencyKey ?? null,
  })
}

export function expireStaleReservations(limit = 500) {
  return callRpc<number>('expire_stale_reservations', { _limit: limit })
}

export async function setLowStockThreshold(variantId: string, threshold: number, actorId: string | null) {
  const supabase = getServiceRoleClient()
  const { data: before } = await supabase
    .from('inventory')
    .select('id, low_stock_threshold')
    .eq('variant_id', variantId)
    .maybeSingle()
  if (!before) return { ok: false as const, status: 404, message: 'Inventory record not found' }

  const { error } = await supabase
    .from('inventory')
    .update({ low_stock_threshold: threshold, updated_by: actorId })
    .eq('id', before.id)
  if (error) return mapInventoryError(error)

  await supabase.from('audit_logs').insert({
    actor_id: actorId,
    action: 'INVENTORY_THRESHOLD_CHANGED',
    table_name: 'inventory',
    record_id: before.id,
    old_values: { low_stock_threshold: before.low_stock_threshold },
    new_values: { low_stock_threshold: threshold },
  })
  return { ok: true as const, data: { variant_id: variantId, low_stock_threshold: threshold } }
}
