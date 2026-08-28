import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { App, Button, Card, Drawer, Form, Spin, Typography, theme } from 'antd'
import { ArrowLeftOutlined, CommentOutlined } from '@ant-design/icons'
import { pendingCandidateSnapshotDrift, preservePendingCandidateBaseline } from '@xiaotuanbao/ai-contracts'
import type {
  AiCreateAssistTaskStatus,
  AiCreateTaskSummary,
  AiReviewPackageView,
  AiReviewableBasicInfoField,
} from '@xiaotuanbao/shared'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/app/store/auth.store'
import { useUiStore } from '@/app/store/ui.store'
import { useAgentConversationStore } from '@/features/agent-conversation/agent-conversation.store'
import { useAgentConversationRuntimeStore } from '@/features/agent-conversation/agent-conversation-runtime.store'
import { agentTaskCompletedNavigation } from '@/features/agent-conversation/task-descriptor-navigation'
import { AiReviewStickyBar } from '@/features/ai-assist/AiReviewStickyBar'
import { REVIEW_FIELD_LABELS } from '@/features/ai-assist/review-field-labels'
import {
  assistStateRefetchInterval,
  taskReviewRefetchInterval,
} from '@/features/ai-assist/ai-create-assist-polling'
import {
  confirmAiCreateTask,
  confirmAiReviewPackage,
  getAiCreateAssistAvailability,
  getAiCreateAssistTaskState,
  getAiCreateTask,
  patchAiReviewPackage,
  rejectAiReviewPackage,
  saveDepartureCreationDraft,
} from '@/services/ai-create-task.service'
import { previewDepartureNo } from '@/services/departure.service'
import { getRouteTemplate } from '@/services/route-template.service'
import { CreateDepartureStepInfo } from './CreateDepartureStepInfo'
import { CreateDepartureStepRoute } from './CreateDepartureStepRoute'
import { useCopyFromDepartureSearch } from '../hooks/useCopyFromDepartureSearch'
import { ApiError } from '@/lib/request'
import styles from './CreateDepartureWizard.module.css'
import {
  applyDraftSnapshotToInfoForm,
  applyDraftSnapshotToRoute,
  applySelectedRouteTemplate,
  buildDefaultDepartureName,
  buildDepartureCreationDraftSnapshot,
  canPersistDepartureCreationDraft,
  computeDayCount,
  createInfoFormValues,
  type InfoFormValues,
  createInitialRouteStepValues,
  getShanghaiTodayString,
  hasUsableRouteSource,
  resolveEndDateAfterTemplateSelect,
  type RouteStepValues,
  switchRouteSourceToManual,
} from '../utils/departure-wizard-form'
import { readAiCreateTaskConflict } from '../utils/ai-create-task-conflict'
import {
  latestConversationEventSequence,
  proposedTaskToClaim,
} from '../utils/wizard-task-claim'

const AUTOSAVE_DEBOUNCE_MS = 800

const ASSIST_TASK_STATUS_LABELS: Partial<Record<AiCreateAssistTaskStatus, string>> = {
  parsing: '解析中',
  ai_processing: 'AI 处理中',
  awaiting_user_input: '待回答',
  awaiting_review: '待审核',
  failed: '处理失败',
}

type DraftSaveStatus = 'idle' | 'saving' | 'saved' | 'error'

function newConfirmIdempotencyKey(taskId: string): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `confirm-${taskId}-${Date.now()}`
}

function useCreateDepartureWizardController() {
  const { token } = theme.useToken()
  const { message } = App.useApp()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const user = useAuthStore((state) => state.user)
  const setAssistPaneCollapsed = useUiStore((state) => state.setAssistPaneCollapsed)
  const assistPaneCollapsed = useUiStore((state) => state.assistPaneCollapsed)
  const conversationId = useAgentConversationStore((state) => state.conversationId)
  const conversationView = useAgentConversationStore((state) => state.view)
  const openHistoricalConversation = useAgentConversationStore(
    (state) => state.openHistoricalConversation,
  )
  const runtimeConversationId = useAgentConversationRuntimeStore((state) => state.conversationId)
  const conversationEvents = useAgentConversationRuntimeStore((state) => state.events)
  const search = useSearch({ strict: false }) as { copyFrom?: string; taskId?: string }
  const copyFromId = search.copyFrom?.trim()
  const searchTaskId = search.taskId?.trim()

  const [routeValues, setRouteValues] = useState<RouteStepValues>(() => createInitialRouteStepValues())
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false)
  const [initializingForm, setInitializingForm] = useState(
    () => Boolean(copyFromId) || Boolean(searchTaskId),
  )
  const [restoringTask, setRestoringTask] = useState(() => Boolean(searchTaskId))
  const [taskId, setTaskId] = useState<string | null>(searchTaskId ?? null)
  const [draftVersion, setDraftVersion] = useState<number | null>(null)
  const [saveStatus, setSaveStatus] = useState<DraftSaveStatus>('idle')
  const [infoForm] = Form.useForm<InfoFormValues>()
  const dirtyRef = useRef(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const persistInFlightRef = useRef<Promise<void> | null>(null)
  const taskClaimInFlightRef = useRef<Promise<void> | null>(null)
  const confirmIdempotencyKeyRef = useRef<string | null>(null)
  const taskIdRef = useRef(taskId)
  const draftVersionRef = useRef(draftVersion)
  const routeValuesRef = useRef(routeValues)
  const pendingReviewRef = useRef<AiReviewPackageView | null>(null)
  const templateSelectGenerationRef = useRef(0)
  const templateSelectAbortRef = useRef<AbortController | null>(null)
  const claimCursorRef = useRef<{
    conversationId: string | null
    afterSequence: number
    armed: boolean
  } | null>(null)

  if (!claimCursorRef.current) {
    const runtimeMatches = Boolean(conversationId) && runtimeConversationId === conversationId
    claimCursorRef.current = {
      conversationId,
      afterSequence: runtimeMatches
        ? latestConversationEventSequence(conversationEvents)
        : 0,
      armed: !conversationId || runtimeMatches,
    }
  }

  useEffect(() => {
    taskIdRef.current = taskId
  }, [taskId])

  useEffect(() => {
    draftVersionRef.current = draftVersion
  }, [draftVersion])

  useEffect(() => {
    routeValuesRef.current = routeValues
  }, [routeValues])

  useEffect(() => {
    return () => {
      templateSelectAbortRef.current?.abort()
    }
  }, [])

  const isCopyMode = routeValues.mode === 'copy'
  const awaitingCopySource = Boolean(copyFromId) && !isCopyMode && !searchTaskId
  const showCopyBootstrap = awaitingCopySource || restoringTask || (isCopyMode && initializingForm)

  const syncTaskSearch = useCallback(
    (nextTaskId: string) => {
      void navigate({
        to: '/departure/new',
        search: {
          ...(copyFromId ? { copyFrom: copyFromId } : {}),
          taskId: nextTaskId,
        },
        replace: true,
      })
    },
    [copyFromId, navigate],
  )

  const applySavedDraft = useCallback(
    (result: { id: string; draft: { version: number } }, options?: { keepDirty?: boolean }) => {
      setTaskId(result.id)
      setDraftVersion(result.draft.version)
      taskIdRef.current = result.id
      draftVersionRef.current = result.draft.version
      if (!options?.keepDirty) {
        dirtyRef.current = false
        setSaveStatus('saved')
      }
    },
    [],
  )

  const persistDraft = useCallback(async () => {
    if (!user) {
      throw new Error('请先登录')
    }

    if (taskClaimInFlightRef.current) {
      await taskClaimInFlightRef.current
    }

    if (persistInFlightRef.current) {
      await persistInFlightRef.current
    }

    const run = (async () => {
      const info = infoForm.getFieldsValue(true)
      const pending = pendingReviewRef.current
      const draft = pending?.baselineSnapshot
        ? preservePendingCandidateBaseline({
            draft: buildDepartureCreationDraftSnapshot(routeValuesRef.current, info),
            baselineSnapshot: pending.baselineSnapshot,
            candidateFields: pending.candidates.map((candidate) => candidate.fieldKey),
          })
        : buildDepartureCreationDraftSnapshot(routeValuesRef.current, info)
      if (!canPersistDepartureCreationDraft(draft)) {
        return
      }

      setSaveStatus('saving')
      try {
        const currentTaskId = taskIdRef.current
        const currentVersion = draftVersionRef.current
        const result = await saveDepartureCreationDraft(
          {
            taskId: currentTaskId ?? undefined,
            expectedVersion: currentTaskId ? (currentVersion ?? undefined) : undefined,
            draft,
          },
          { silentError: true },
        )
        applySavedDraft(result)
        if (!currentTaskId) {
          syncTaskSearch(result.id)
        }
      } catch (error) {
        const conflict = readAiCreateTaskConflict(error)
        if (conflict) {
          applySavedDraft(conflict, { keepDirty: true })
          try {
            const retried = await saveDepartureCreationDraft(
              {
                taskId: conflict.id,
                expectedVersion: conflict.draft.version,
                draft,
              },
              { silentError: true },
            )
            applySavedDraft(retried)
            return
          } catch (retryError) {
            const retryConflict = readAiCreateTaskConflict(retryError)
            if (retryConflict) {
              applySavedDraft(retryConflict, { keepDirty: true })
            }
            setSaveStatus('error')
            throw retryError
          }
        }
        setSaveStatus('error')
        throw error
      }
    })()

    persistInFlightRef.current = run.finally(() => {
      if (persistInFlightRef.current === run) {
        persistInFlightRef.current = null
      }
    })
    await persistInFlightRef.current
  }, [applySavedDraft, infoForm, syncTaskSearch, user])

  useEffect(() => {
    const cursor = claimCursorRef.current
    if (!cursor) return

    const latestSequence = latestConversationEventSequence(conversationEvents)
    if (cursor.conversationId !== conversationId) {
      const startedWhileWizardOpen = cursor.conversationId === null && conversationId !== null
      cursor.conversationId = conversationId
      cursor.afterSequence = startedWhileWizardOpen ? 0 : latestSequence
      cursor.armed = startedWhileWizardOpen || runtimeConversationId === conversationId
      if (!startedWhileWizardOpen) return
    }

    if (!cursor.armed) {
      if (conversationId && runtimeConversationId === conversationId) {
        cursor.afterSequence = latestSequence
        cursor.armed = true
      }
      return
    }

    const proposedTaskId = proposedTaskToClaim({
      conversationId,
      runtimeConversationId,
      events: conversationEvents,
      afterSequence: cursor.afterSequence,
      currentTaskId: taskIdRef.current,
      historical: conversationView === 'history',
    })
    cursor.afterSequence = Math.max(cursor.afterSequence, latestSequence)
    if (!proposedTaskId || taskClaimInFlightRef.current) return

    const claim = getAiCreateTask(proposedTaskId).then((task) => {
      if (task.departureId || taskIdRef.current) return
      applySavedDraft(task, { keepDirty: true })
      syncTaskSearch(task.id)
    })
    const trackedClaim = claim
      .catch((error) => {
        message.error(error instanceof Error ? error.message : '认领 AI 建团任务失败')
      })
      .finally(() => {
        if (taskClaimInFlightRef.current === trackedClaim) {
          taskClaimInFlightRef.current = null
        }
      })
    taskClaimInFlightRef.current = trackedClaim
  }, [
    applySavedDraft,
    conversationEvents,
    conversationId,
    conversationView,
    message,
    runtimeConversationId,
    syncTaskSearch,
  ])

  const scheduleAutosave = useCallback(() => {
    dirtyRef.current = true
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
    }
    saveTimerRef.current = setTimeout(() => {
      void persistDraft().catch((error) => {
        message.error(error instanceof Error ? error.message : '发团创建草稿保存失败，请勿离开本页')
      })
    }, AUTOSAVE_DEBOUNCE_MS)
  }, [message, persistDraft])

  const flushDraft = useCallback(async (options?: { restorePendingBaseline?: boolean }) => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    if (options?.restorePendingBaseline) {
      const pending = pendingReviewRef.current
      if (pending?.baselineSnapshot && pending.candidates.length > 0) {
        const draft = buildDepartureCreationDraftSnapshot(
          routeValuesRef.current,
          infoForm.getFieldsValue(true),
        )
        if (
          pendingCandidateSnapshotDrift({
            draft,
            baselineSnapshot: pending.baselineSnapshot,
            candidateFields: pending.candidates.map((candidate) => candidate.fieldKey),
          })
        ) {
          dirtyRef.current = true
        }
      }
    }
    if (!dirtyRef.current && taskIdRef.current && draftVersionRef.current != null) {
      return
    }
    await persistDraft()
  }, [infoForm, persistDraft])

  const loadDepartureNo = useCallback(async () => {
    const result = await previewDepartureNo()
    infoForm.setFieldValue('departureNo', result.departureNo)
    return result.departureNo
  }, [infoForm])

  const enterInfoStep = useCallback(
    async (nextRouteValues: RouteStepValues) => {
      if (!user) {
        message.error('请先登录')
        return
      }

      setInitializingForm(true)
      try {
        const startDate = nextRouteValues.startDate ?? getShanghaiTodayString()
        const initialValues = createInfoFormValues(
          nextRouteValues,
          user.id,
          startDate,
          '',
        )
        infoForm.setFieldsValue(initialValues)
        await loadDepartureNo()
        setRouteValues(nextRouteValues)
        routeValuesRef.current = nextRouteValues
        dirtyRef.current = true
        await persistDraft()
      } catch (error) {
        message.error(error instanceof Error ? error.message : '发团创建草稿保存失败')
      } finally {
        setInitializingForm(false)
      }
    },
    [infoForm, loadDepartureNo, message, persistDraft, user],
  )

  const handleCopyLoadError = useCallback(() => {
    setInitializingForm(false)
  }, [])

  useCopyFromDepartureSearch({
    copyFrom: searchTaskId ? undefined : copyFromId,
    navigate,
    setRouteValues,
    enterInfoStep,
    onLoadError: handleCopyLoadError,
  })

  useEffect(() => {
    if (!searchTaskId || !user) {
      return
    }

    let cancelled = false
    setRestoringTask(true)
    void getAiCreateTask(searchTaskId)
      .then(async (task) => {
        if (cancelled) return
        if (task.departureId) {
          message.info('该 AI 建团任务已创建正式发团，正在打开详情')
          void navigate(agentTaskCompletedNavigation(task.departureId))
          return
        }

        const nextRoute = applyDraftSnapshotToRoute(task.draft.snapshot)
        const nextInfo = applyDraftSnapshotToInfoForm(task.draft.snapshot, user.id)
        setRouteValues(nextRoute)
        routeValuesRef.current = nextRoute
        infoForm.setFieldsValue(nextInfo)
        setTaskId(task.id)
        setDraftVersion(task.draft.version)
        taskIdRef.current = task.id
        draftVersionRef.current = task.draft.version
        dirtyRef.current = false
        setSaveStatus('saved')
        const restoreConversationId =
          task.pendingReview?.conversationId ??
          task.pendingReviews?.find((pkg) => pkg.conversationId)?.conversationId
        if (restoreConversationId && !useAgentConversationStore.getState().conversationId) {
          openHistoricalConversation({ id: restoreConversationId, title: '历史会话' })
        }
        try {
          await loadDepartureNo()
        } catch {
          // 预览团号失败不阻断恢复
        }
      })
      .catch((error) => {
        if (cancelled) return
        message.error(error instanceof Error ? error.message : '恢复发团创建草稿失败')
      })
      .finally(() => {
        if (!cancelled) {
          setRestoringTask(false)
          setInitializingForm(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [infoForm, loadDepartureNo, message, navigate, openHistoricalConversation, searchTaskId, user])

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
      }
    }
  }, [])

  const formInitializedRef = useRef(false)

  useEffect(() => {
    if (formInitializedRef.current || copyFromId || searchTaskId || !user) {
      return
    }

    formInitializedRef.current = true
    const startDate = getShanghaiTodayString()
    infoForm.setFieldsValue(createInfoFormValues(createInitialRouteStepValues(), user.id, startDate, ''))
    void loadDepartureNo().catch(() => {
      // 预览团号失败不阻断空表
    })
  }, [copyFromId, infoForm, loadDepartureNo, searchTaskId, user])

  const applyRouteToInfoForm = useCallback(
    (previous: RouteStepValues, next: RouteStepValues) => {
      const startDate = infoForm.getFieldValue('startDate') as string | undefined
      const endDate = infoForm.getFieldValue('endDate') as string | undefined
      const name = infoForm.getFieldValue('name') as string | undefined
      const updates: Partial<InfoFormValues> = {}

      if (next.mode === 'template') {
        const nextEndDate = resolveEndDateAfterTemplateSelect(
          startDate,
          endDate,
          next.defaultDayCount,
        )
        if (nextEndDate && nextEndDate !== endDate) {
          updates.endDate = nextEndDate
          if (startDate) updates.dayCount = computeDayCount(startDate, nextEndDate)
        }
      }

      const previousDefaultName = buildDefaultDepartureName(previous.routeName, startDate)
      const pendingNameCandidate = pendingReviewRef.current?.candidates.some(
        (candidate) => candidate.fieldKey === 'name',
      )
      if (
        !pendingNameCandidate &&
        startDate &&
        next.routeName.trim() &&
        (!name?.trim() || name === previousDefaultName)
      ) {
        updates.name = buildDefaultDepartureName(next.routeName, startDate)
      }

      if (Object.keys(updates).length > 0) {
        infoForm.setFieldsValue(updates)
      }
    },
    [infoForm],
  )

  const invalidateTemplateSelect = useCallback(() => {
    templateSelectAbortRef.current?.abort()
    templateSelectAbortRef.current = null
    templateSelectGenerationRef.current += 1
  }, [])

  const handleRouteChange = useCallback(
    (next: RouteStepValues) => {
      if (next.mode !== 'template') {
        invalidateTemplateSelect()
      }
      const previous = routeValuesRef.current
      setRouteValues(next)
      routeValuesRef.current = next
      setTemplatePickerOpen(false)
      applyRouteToInfoForm(previous, next)
      scheduleAutosave()
    },
    [applyRouteToInfoForm, invalidateTemplateSelect, scheduleAutosave],
  )

  const handleSelectTemplate = useCallback(
    async (template: {
      id: string
      name: string
      defaultDayCount: number
      segmentCount?: number
      resourceCount?: number
    }) => {
      templateSelectAbortRef.current?.abort()
      const controller = new AbortController()
      templateSelectAbortRef.current = controller
      const generation = ++templateSelectGenerationRef.current

      let next = applySelectedRouteTemplate(routeValuesRef.current, template)
      try {
        const detail = await getRouteTemplate(template.id, controller.signal)
        if (generation !== templateSelectGenerationRef.current) return
        next = applySelectedRouteTemplate(routeValuesRef.current, {
          id: detail.id,
          name: detail.name,
          defaultDayCount: detail.defaultDayCount,
          segmentCount: detail.segmentCount,
          resourceCount: detail.resourceCount,
        })
      } catch (error) {
        if (controller.signal.aborted || generation !== templateSelectGenerationRef.current) {
          return
        }
        message.error(error instanceof Error ? error.message : '加载路线详情失败')
      }
      if (generation !== templateSelectGenerationRef.current) return
      handleRouteChange(next)
    },
    [handleRouteChange, message],
  )

  const handleClearSelectedTemplate = useCallback(() => {
    handleRouteChange(switchRouteSourceToManual(routeValuesRef.current))
  }, [handleRouteChange])

  const createMutation = useMutation({
    mutationFn: async () => {
      const runConfirm = async () => {
        await flushDraft()
        const currentTaskId = taskIdRef.current
        const currentVersion = draftVersionRef.current
        if (!currentTaskId || currentVersion == null) {
          throw new Error('发团创建草稿尚未保存，请稍后再试')
        }
        if (!confirmIdempotencyKeyRef.current) {
          confirmIdempotencyKeyRef.current = newConfirmIdempotencyKey(currentTaskId)
        }
        return confirmAiCreateTask(
          currentTaskId,
          { expectedVersion: currentVersion },
          confirmIdempotencyKeyRef.current,
          { silentError: true },
        )
      }

      try {
        return await runConfirm()
      } catch (error) {
        const conflict = readAiCreateTaskConflict(error)
        if (!conflict) {
          throw error
        }
        applySavedDraft(conflict, { keepDirty: true })
        confirmIdempotencyKeyRef.current = null
        return runConfirm()
      }
    },
    onSuccess: (departure) => {
      message.success('发团已创建')
      dirtyRef.current = false
      confirmIdempotencyKeyRef.current = null
      queryClient.invalidateQueries({ queryKey: ['departures'] })
      queryClient.invalidateQueries({ queryKey: ['route-templates'] })
      navigate(agentTaskCompletedNavigation(departure.id))
    },
    onError: (error) => {
      const conflict = readAiCreateTaskConflict(error)
      if (conflict) {
        applySavedDraft(conflict, { keepDirty: true })
        confirmIdempotencyKeyRef.current = null
      }
      message.error(error instanceof Error ? error.message : '创建失败')
    },
  })

  const handleCreate = async () => {
    if (!hasUsableRouteSource(routeValues)) {
      message.warning('请填写路线名称')
      document.querySelector<HTMLElement>('[aria-label="路线名称"]')?.focus()
      return
    }

    try {
      await infoForm.validateFields()
      createMutation.mutate()
    } catch {
      // validation errors are shown by antd Form
    }
  }

  const goBack = useCallback(() => {
    const leave = () => {
      void navigate({ to: '/departure' })
    }
    if (!dirtyRef.current) {
      leave()
      return
    }
    void flushDraft()
      .then(leave)
      .catch((error) => {
        message.error(error instanceof Error ? error.message : '发团创建草稿保存失败，请处理后再离开')
      })
  }, [flushDraft, message, navigate])

  const { data: assistAvailability } = useQuery({
    queryKey: ['ai-create-assist-availability'],
    queryFn: getAiCreateAssistAvailability,
  })

  const { data: assistTaskState } = useQuery({
    queryKey: ['ai-create-assist-state', taskId],
    queryFn: () => getAiCreateAssistTaskState(taskId!),
    enabled: Boolean(assistAvailability?.enabled && taskId),
    refetchInterval: (current) => assistStateRefetchInterval(current.state.data?.status),
    refetchIntervalInBackground: false,
  })
  const assistTaskStatusLabel = assistTaskState
    ? ASSIST_TASK_STATUS_LABELS[assistTaskState.status]
    : undefined

  const { data: taskReview } = useQuery({
    queryKey: ['ai-create-task', taskId],
    queryFn: () => getAiCreateTask(taskId!),
    enabled: Boolean(taskId),
    refetchInterval: (current) =>
      taskReviewRefetchInterval({
        paneOpen: !assistPaneCollapsed,
        hasPendingReview: Boolean(
          current.state.data?.pendingReview || (current.state.data?.pendingReviews?.length ?? 0) > 0,
        ),
        assistStatus: assistTaskState?.status,
      }),
    refetchIntervalInBackground: false,
  })
  const pendingReview = conversationId
    ? ((taskReview?.pendingReviews ?? []).find((pkg) => pkg.conversationId === conversationId) ??
      (taskReview?.pendingReview?.conversationId === conversationId
        ? taskReview.pendingReview
        : null))
    : (taskReview?.pendingReview ?? null)
  useEffect(() => {
    pendingReviewRef.current = pendingReview
  }, [pendingReview])
  const pendingCorrectionsRef = useRef<
    Partial<Record<AiReviewableBasicInfoField, string | number | null>>
  >({})

  const applyConfirmedTask = useCallback(
    (summary: AiCreateTaskSummary) => {
      applySavedDraft(summary)
      const nextRoute = applyDraftSnapshotToRoute(summary.draft.snapshot)
      setRouteValues(nextRoute)
      if (user) {
        infoForm.setFieldsValue(applyDraftSnapshotToInfoForm(summary.draft.snapshot, user.id))
      }
    },
    [applySavedDraft, infoForm, user],
  )

  useEffect(() => {
    if (!taskReview || draftVersion == null || initializingForm || restoringTask) {
      return
    }
    if (taskReview.draft.version <= draftVersion) {
      return
    }
    applyConfirmedTask(taskReview)
  }, [applyConfirmedTask, draftVersion, initializingForm, restoringTask, taskReview])

  const correctTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleCorrectCandidate = useCallback(
    (fieldKey: AiReviewableBasicInfoField, value: string | number | null) => {
      if (!taskId || !pendingReview) return
      pendingCorrectionsRef.current = { ...pendingCorrectionsRef.current, [fieldKey]: value }
      if (correctTimerRef.current) {
        clearTimeout(correctTimerRef.current)
      }
      correctTimerRef.current = setTimeout(() => {
        void patchAiReviewPackage(taskId, pendingReview.id, {
          corrections: { ...pendingCorrectionsRef.current },
        })
          .then((summary) => {
            queryClient.setQueryData(['ai-create-task', summary.id], summary)
          })
          .catch((caught) => {
            message.error(caught instanceof Error ? caught.message : '修正候选失败')
          })
      }, 300)
    },
    [message, pendingReview, queryClient, taskId],
  )

  useEffect(() => {
    pendingCorrectionsRef.current = {}
  }, [pendingReview?.id])

  useEffect(() => {
    return () => {
      if (correctTimerRef.current) {
        clearTimeout(correctTimerRef.current)
      }
    }
  }, [])

  const confirmReviewMutation = useMutation({
    mutationFn: async () => {
      if (!taskId || !pendingReview) {
        throw new Error('没有待确认的审核包')
      }
      if (correctTimerRef.current) {
        clearTimeout(correctTimerRef.current)
        correctTimerRef.current = null
      }
      await flushDraft({ restorePendingBaseline: true })
      const currentVersion = draftVersionRef.current
      if (currentVersion == null) {
        throw new Error('没有待确认的审核包')
      }
      const corrections = pendingCorrectionsRef.current
      pendingCorrectionsRef.current = {}
      return confirmAiReviewPackage(
        taskId,
        pendingReview.id,
        {
          expectedVersion: currentVersion,
          expectedPackageVersion: pendingReview.version,
          ...(Object.keys(corrections).length > 0 ? { corrections } : {}),
        },
        newConfirmIdempotencyKey(taskId),
      )
    },
    onSuccess: (summary) => {
      queryClient.setQueryData(['ai-create-task', summary.id], summary)
      applyConfirmedTask(summary)
      message.success('已将确认值写入发团创建草稿')
    },
    onError: (caught) => {
      const conflict = readAiCreateTaskConflict(caught)
      if (conflict) {
        queryClient.setQueryData(['ai-create-task', conflict.id], conflict)
        applyConfirmedTask(conflict)
        if (caught instanceof Error && caught.message.includes('已处理')) {
          return
        }
        const fields =
          caught instanceof ApiError &&
          caught.data &&
          typeof caught.data === 'object' &&
          'reviewConflict' in caught.data
            ? (caught.data as { reviewConflict?: { conflictFields?: string[] } }).reviewConflict
                ?.conflictFields
            : undefined
        const labels = (fields ?? [])
          .map((field) => REVIEW_FIELD_LABELS[field as AiReviewableBasicInfoField] ?? field)
          .join('、')
        message.error(
          labels
            ? `草稿在候选产生后已变化（${labels}），旧候选不能覆盖新值`
            : '草稿已变化，旧候选不能覆盖新值',
        )
        return
      }
      message.error(caught instanceof Error ? caught.message : '确认审核包失败')
    },
  })

  const rejectReviewMutation = useMutation({
    mutationFn: async () => {
      if (!taskId || !pendingReview) {
        throw new Error('没有待确认的审核包')
      }
      return rejectAiReviewPackage(taskId, pendingReview.id, {
        expectedPackageVersion: pendingReview.version,
      })
    },
    onSuccess: (summary) => {
      applySavedDraft(summary)
      queryClient.setQueryData(['ai-create-task', summary.id], summary)
      message.success('已拒绝 AI 建议，发团创建草稿未改动')
    },
    onError: (caught) => {
      const conflict = readAiCreateTaskConflict(caught)
      if (conflict && caught instanceof Error && caught.message.includes('已处理')) {
        queryClient.setQueryData(['ai-create-task', conflict.id], conflict)
        applyConfirmedTask(conflict)
        return
      }
      message.error(caught instanceof Error ? caught.message : '拒绝审核包失败')
    },
  })

  const openAssist = useCallback(() => {
    setAssistPaneCollapsed(false)
  }, [setAssistPaneCollapsed])

  const stepEnterKey = showCopyBootstrap ? 'bootstrap' : 'form'

  const saveStatusLabel =
    saveStatus === 'saving'
      ? '发团创建草稿保存中…'
      : saveStatus === 'saved'
        ? '发团创建草稿已保存'
        : saveStatus === 'error'
          ? '发团创建草稿保存失败'
          : null

  return {
    token,
    goBack,
    isCopyMode,
    copyFromId,
    assistAvailability,
    openAssist,
    assistTaskStatusLabel,
    pendingReview,
    draftVersion,
    confirmReviewMutation,
    rejectReviewMutation,
    stepEnterKey,
    showCopyBootstrap,
    restoringTask,
    infoForm,
    routeValues,
    scheduleAutosave,
    handleRouteChange,
    setTemplatePickerOpen,
    templatePickerOpen,
    handleCorrectCandidate,
    saveStatusLabel,
    saveStatus,
    createMutation,
    initializingForm,
    handleCreate,
    handleSelectTemplate,
    handleClearSelectedTemplate,
  }
}

function CreateDepartureWizardView({
  token,
  goBack,
  isCopyMode,
  copyFromId,
  assistAvailability,
  openAssist,
  assistTaskStatusLabel,
  pendingReview,
  draftVersion,
  confirmReviewMutation,
  rejectReviewMutation,
  stepEnterKey,
  showCopyBootstrap,
  restoringTask,
  infoForm,
  routeValues,
  scheduleAutosave,
  handleRouteChange,
  setTemplatePickerOpen,
  templatePickerOpen,
  handleCorrectCandidate,
  saveStatusLabel,
  saveStatus,
  createMutation,
  initializingForm,
  handleCreate,
  handleSelectTemplate,
  handleClearSelectedTemplate,
}: ReturnType<typeof useCreateDepartureWizardController>) {
  return (
    <div
      className={styles.page}
      style={{ '--wizard-border': token.colorBorderSecondary } as CSSProperties}
    >
      <div className={styles.pageHeader}>
        <div>
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            style={{ paddingInlineStart: 0 }}
            onClick={goBack}
          >
            返回发团列表
          </Button>
          <Typography.Title level={4} className={styles.title}>
            {isCopyMode || copyFromId ? '复制发团' : '新建发团'}
          </Typography.Title>
        </div>
        {assistAvailability?.enabled ? (
          <Button aria-label="AI 辅助" icon={<CommentOutlined />} onClick={openAssist}>
            {assistTaskStatusLabel ? `AI 辅助 · ${assistTaskStatusLabel}` : 'AI 辅助'}
          </Button>
        ) : null}
      </div>

      <Card className={styles.wizardCard} styles={{ body: { padding: 0, height: '100%' } }}>
        <div className={`${styles.wizardBody} ${styles.wizardBodyNoRail}`}>
          <section className={styles.workspace} aria-label="发团创建内容">
            {pendingReview && draftVersion != null ? (
              <AiReviewStickyBar
                pendingReview={pendingReview}
                confirming={confirmReviewMutation.isPending}
                rejecting={rejectReviewMutation.isPending}
                onConfirm={() => confirmReviewMutation.mutate()}
                onReject={() => rejectReviewMutation.mutate()}
              />
            ) : null}
            <div key={stepEnterKey} className={styles.stepEnter}>
              {showCopyBootstrap ? (
                <div className={styles.loadingState}>
                  <Spin
                    description={restoringTask ? '正在恢复发团创建草稿…' : '正在加载源发团…'}
                  />
                </div>
              ) : (
                <CreateDepartureStepInfo
                  form={infoForm}
                  route={routeValues}
                  onValuesChange={scheduleAutosave}
                  onRouteChange={handleRouteChange}
                  onOpenTemplatePicker={() => setTemplatePickerOpen(true)}
                  templatePickerOpen={templatePickerOpen}
                  pendingReview={pendingReview}
                  onCorrectCandidate={handleCorrectCandidate}
                />
              )}
            </div>
          </section>
        </div>

        <footer className={styles.wizardFooter}>
          <div>
            <Button onClick={goBack}>返回</Button>
            {saveStatusLabel ? (
              <Typography.Text
                type={saveStatus === 'error' ? 'danger' : 'secondary'}
                style={{ marginInlineStart: 12 }}
              >
                {saveStatusLabel}
              </Typography.Text>
            ) : null}
          </div>
          <div>
            <Button
              type={pendingReview ? 'default' : 'primary'}
              loading={createMutation.isPending}
              disabled={showCopyBootstrap || initializingForm}
              onClick={() => void handleCreate()}
            >
              创建发团
            </Button>
          </div>
        </footer>
      </Card>

      <Drawer
        title="选用常用路线"
        open={templatePickerOpen}
        onClose={() => setTemplatePickerOpen(false)}
        size="min(720px, 100vw)"
        destroyOnHidden
      >
        <CreateDepartureStepRoute
          values={routeValues}
          enabled={templatePickerOpen}
          onSelect={(template) => {
            void handleSelectTemplate(template)
          }}
          onClearSelected={handleClearSelectedTemplate}
        />
      </Drawer>
    </div>
  )
}

export function CreateDepartureWizard() {
  const controller = useCreateDepartureWizardController()
  return <CreateDepartureWizardView {...controller} />
}
