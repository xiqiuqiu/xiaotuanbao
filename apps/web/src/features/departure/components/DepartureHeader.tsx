import { useNavigate, useSearch } from '@tanstack/react-router'
import type { DepartureDetail } from '@/types/api'
import type { DepartureNextAction } from '../utils/departure-next-action'
import { DepartureHeaderCard } from './DepartureHeaderCard'
import { DepartureNextActionAlert } from './DepartureNextActionAlert'
import { DepartureOperationsSheetDrawer } from './DepartureOperationsSheetDrawer'
import { DepartureOverviewDrawer } from './DepartureOverviewDrawer'
import { DepartureTransitionModal } from './DepartureTransitionModal'
import { DepartureUnarchiveModal } from './DepartureUnarchiveModal'
import { SaveAsRouteTemplateModal } from './SaveAsRouteTemplateModal'
import { useDepartureHeaderActions } from './useDepartureHeaderActions'

interface DepartureHeaderProps {
  departure: DepartureDetail
  canEdit: boolean
  onUpdated: () => void
}

export function DepartureHeader({ departure, canEdit, onUpdated }: DepartureHeaderProps) {
  const navigate = useNavigate()
  const search = useSearch({ strict: false })
  const {
    overviewForm,
    closeForm,
    unarchiveForm,
    saveModalOpen,
    setSaveModalOpen,
    editDrawerOpen,
    setEditDrawerOpen,
    operationsSheetOpen,
    setOperationsSheetOpen,
    unarchiveModalOpen,
    setUnarchiveModalOpen,
    historyOpen,
    setHistoryOpen,
    transitionAction,
    setTransitionAction,
    actionLoading,
    unarchivePending,
    menuItems,
    primaryAction,
    handleActionKey,
    handleTransitionConfirm,
    handleCloseSubmit,
    handleUnarchiveSubmit,
  } = useDepartureHeaderActions(departure, canEdit, onUpdated)

  const handleNextAction = (action: NonNullable<DepartureNextAction['action']>) => {
    if (action.intent === 'edit') {
      handleActionKey('edit')
      return
    }
    if (action.intent === 'pending_settlement') {
      handleActionKey('pending_settlement')
      return
    }
    if (action.intent === 'mark_settled') {
      handleActionKey('settled')
      return
    }
    if (action.intent === 'close') {
      handleActionKey('close')
      return
    }
    if (action.intent === 'unarchive') {
      handleActionKey('unarchive')
      return
    }
    if (action.intent === 'open_history') {
      setHistoryOpen(true)
      return
    }
    if (action.tab) {
      void navigate({
        to: '/departure/$departureId',
        params: { departureId: departure.id },
        search: {
          ...search,
          tab: action.tab,
          ...(search.listReturn ? { listReturn: search.listReturn } : {}),
        },
        replace: true,
      })
    }
  }

  return (
    <>
      <DepartureHeaderCard
        departure={departure}
        menuItems={menuItems}
        primaryAction={primaryAction}
        historyOpen={historyOpen}
        onHistoryOpenChange={setHistoryOpen}
      />

      <DepartureNextActionAlert
        departure={departure}
        canWrite={canEdit}
        onAction={handleNextAction}
      />

      <SaveAsRouteTemplateModal
        departure={departure}
        open={saveModalOpen}
        onClose={() => setSaveModalOpen(false)}
      />

      <DepartureOverviewDrawer
        open={editDrawerOpen}
        departure={departure}
        form={overviewForm}
        onClose={() => {
          setEditDrawerOpen(false)
          overviewForm.resetFields()
        }}
        onUpdated={onUpdated}
      />

      <DepartureOperationsSheetDrawer
        open={operationsSheetOpen}
        departureId={departure.id}
        onClose={() => setOperationsSheetOpen(false)}
      />

      <DepartureTransitionModal
        open={transitionAction !== null}
        action={transitionAction}
        departure={departure}
        loading={actionLoading}
        closeForm={closeForm}
        onClose={() => {
          setTransitionAction(null)
          closeForm.resetFields()
        }}
        onConfirm={handleTransitionConfirm}
        onCloseSubmit={handleCloseSubmit}
      />

      <DepartureUnarchiveModal
        open={unarchiveModalOpen}
        departure={departure}
        loading={unarchivePending}
        form={unarchiveForm}
        onClose={() => {
          setUnarchiveModalOpen(false)
          unarchiveForm.resetFields()
        }}
        onSubmit={handleUnarchiveSubmit}
      />
    </>
  )
}
