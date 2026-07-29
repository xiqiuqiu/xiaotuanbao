import type { RuleObject } from 'antd/es/form'
import type { SourceOrderGuestSummary } from '@/types/api'

export type GuestFormFieldName = 'name' | 'phone' | 'gender' | 'notes'

export const guestFormFieldRules: Record<GuestFormFieldName, RuleObject[]> = {
  name: [{ required: true, message: '请输入姓名' }],
  phone: [],
  gender: [],
  notes: [],
}

export function isGuestFormFieldRequired(field: GuestFormFieldName): boolean {
  return guestFormFieldRules[field].some((rule) => rule.required === true)
}

/** 设计稿对照条文案：客名单 N · 客源单人数 M（备忘名单 ≠ 客源单人数） */
export function formatGuestCountContrast(
  guestListCount: number,
  sourceOrderGuestCount: number,
): string {
  return `客名单 ${guestListCount} 人 · 客源单人数 ${sourceOrderGuestCount} 人`
}

/** 抽屉内一行式名单行（已提交到本会话列表，尚未必达服务端）。 */
export interface SourceOrderGuestFormRow {
  /** 服务端 id；新建临时行以 `tmp-` 前缀。 */
  id: string
  name: string
  phone?: string
  gender?: string
  notes?: string
}

export interface SourceOrderGuestSyncBundle {
  baseline: SourceOrderGuestSummary[]
  next: SourceOrderGuestFormRow[]
}

export type GuestSyncOp =
  | { type: 'create'; payload: { name: string; phone?: string; gender?: string; notes?: string } }
  | {
      type: 'update'
      guestId: string
      payload: { name: string; phone?: string | null; gender?: string; notes?: string | null }
    }
  | { type: 'delete'; guestId: string }

function normalizeOptional(value: string | null | undefined): string {
  return (value ?? '').trim()
}

function toCreatePayload(row: SourceOrderGuestFormRow) {
  const phone = normalizeOptional(row.phone)
  const notes = normalizeOptional(row.notes)
  const gender = normalizeOptional(row.gender)
  return {
    name: row.name.trim(),
    ...(phone ? { phone } : {}),
    ...(gender ? { gender } : {}),
    ...(notes ? { notes } : {}),
  }
}

function guestFieldsChanged(
  baseline: SourceOrderGuestSummary,
  next: SourceOrderGuestFormRow,
): boolean {
  return (
    baseline.name !== next.name.trim() ||
    normalizeOptional(baseline.phone) !== normalizeOptional(next.phone) ||
    normalizeOptional(baseline.gender) !== normalizeOptional(next.gender) ||
    normalizeOptional(baseline.notes) !== normalizeOptional(next.notes)
  )
}

/** 将会话内名单相对基线差分成 create/update/delete 操作（不回写客源单人数）。 */
export function planSourceOrderGuestSync(
  baseline: SourceOrderGuestSummary[],
  next: SourceOrderGuestFormRow[],
): GuestSyncOp[] {
  const ops: GuestSyncOp[] = []
  const nextById = new Map<string, SourceOrderGuestFormRow>()
  for (const row of next) {
    if (!row.id.startsWith('tmp-')) {
      nextById.set(row.id, row)
    }
  }
  const baselineById = new Map(baseline.map((item) => [item.id, item]))

  for (const old of baseline) {
    if (!nextById.has(old.id)) {
      ops.push({ type: 'delete', guestId: old.id })
    }
  }

  for (const row of next) {
    if (row.id.startsWith('tmp-')) {
      ops.push({ type: 'create', payload: toCreatePayload(row) })
      continue
    }
    const previous = baselineById.get(row.id)
    if (!previous) {
      ops.push({ type: 'create', payload: toCreatePayload(row) })
      continue
    }
    if (guestFieldsChanged(previous, row)) {
      const phone = normalizeOptional(row.phone)
      const notes = normalizeOptional(row.notes)
      const gender = normalizeOptional(row.gender)
      ops.push({
        type: 'update',
        guestId: row.id,
        payload: {
          name: row.name.trim(),
          phone: phone || null,
          gender: gender || undefined,
          notes: notes || null,
        },
      })
    }
  }

  return ops
}

export function createTempGuestId(): string {
  return `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function guestSummaryToFormRow(
  guest: SourceOrderGuestSummary,
): SourceOrderGuestFormRow {
  return {
    id: guest.id,
    name: guest.name,
    phone: guest.phone ?? undefined,
    gender: guest.gender || undefined,
    notes: guest.notes ?? undefined,
  }
}
