import type { DepartureDetail } from '@/types/api'
import { DepartureHeaderAlerts } from './DepartureHeaderAlerts'
import { DepartureHeaderCard } from './DepartureHeaderCard'
import { DepartureOperationsSheetDrawer } from './DepartureOperationsSheetDrawer'
import { DepartureOverviewDrawer } from './DepartureOverviewDrawer'
import { DepartureTransitionModal } from './DepartureTransitionModal'
import { DepartureUnarchiveModal } from './DepartureUnarchiveModal'
import { SaveAsRouteTemplateModal } from './SaveAsRouteTemplateModal'
import { useDepartureHeaderActions } from './useDepartureHeaderActions'

interface DepartureHeaderProps {
  departure: DepartureDetail
  onUpdated: () => void
}

export function DepartureHeader({ departure, onUpdated }: DepartureHeaderProps) {
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
    transitionAction,
    setTransitionAction,
    canTransitionToSettled,
    canUnarchive,
    actionLoading,
    unarchivePending,
    menuItems,
    handleTransitionConfirm,
    handleCloseSubmit,
    handleUnarchiveSubmit,
  } = useDepartureHeaderActions(departure, onUpdated)

  return (
    <>
      <DepartureHeaderCard departure={departure} menuItems={menuItems} />

      <DepartureHeaderAlerts
        canUnarchive={canUnarchive}
        canTransitionToSettled={canTransitionToSettled}
        onUnarchive={() => setUnarchiveModalOpen(true)}
        onMarkSettled={() => setTransitionAction('settled')}
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
