import {
  EMPTY_SOURCE_ORDER_FILTERS,
  type SourceOrderFilterDraft,
} from '../utils/source-order-filter-state'
import type { SourceOrderSummary } from '@/types/api'

interface FilterState {
  draft: SourceOrderFilterDraft
  applied: SourceOrderFilterDraft
}

type FilterAction =
  | { type: 'SET_DRAFT'; draft: SourceOrderFilterDraft }
  | { type: 'APPLY' }
  | { type: 'RESET' }

export function filterReducer(state: FilterState, action: FilterAction): FilterState {
  switch (action.type) {
    case 'SET_DRAFT':
      return { ...state, draft: action.draft }
    case 'APPLY':
      return {
        ...state,
        applied: {
          ...state.draft,
          keyword: state.draft.keyword.trim(),
        },
      }
    case 'RESET':
      return {
        draft: EMPTY_SOURCE_ORDER_FILTERS,
        applied: EMPTY_SOURCE_ORDER_FILTERS,
      }
  }
}

interface DrawerState {
  drawerOpen: boolean
  guestDrawerOpen: boolean
  editingOrder: SourceOrderSummary | null
  viewOnly: boolean
  guestOrder: SourceOrderSummary | null
}

type DrawerAction =
  | { type: 'OPEN_CREATE' }
  | { type: 'OPEN_VIEW'; order: SourceOrderSummary }
  | { type: 'OPEN_EDIT'; order: SourceOrderSummary }
  | { type: 'OPEN_GUESTS'; order: SourceOrderSummary }
  | { type: 'CLOSE_DRAWER' }
  | { type: 'CLOSE_GUEST_DRAWER' }

export const initialDrawerState: DrawerState = {
  drawerOpen: false,
  guestDrawerOpen: false,
  editingOrder: null,
  viewOnly: false,
  guestOrder: null,
}

export function drawerReducer(state: DrawerState, action: DrawerAction): DrawerState {
  switch (action.type) {
    case 'OPEN_CREATE':
      return {
        ...state,
        drawerOpen: true,
        editingOrder: null,
        viewOnly: false,
      }
    case 'OPEN_VIEW':
      return {
        ...state,
        drawerOpen: true,
        editingOrder: action.order,
        viewOnly: true,
      }
    case 'OPEN_EDIT':
      return {
        ...state,
        drawerOpen: true,
        editingOrder: action.order,
        viewOnly: false,
      }
    case 'OPEN_GUESTS':
      return {
        ...state,
        guestDrawerOpen: true,
        guestOrder: action.order,
      }
    case 'CLOSE_DRAWER':
      return {
        ...state,
        drawerOpen: false,
        editingOrder: null,
        viewOnly: false,
      }
    case 'CLOSE_GUEST_DRAWER':
      return {
        ...state,
        guestDrawerOpen: false,
        guestOrder: null,
      }
  }
}

export type { DrawerState, FilterState }
