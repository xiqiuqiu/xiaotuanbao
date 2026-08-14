import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { Button, Card, Drawer, Form, Spin, Typography, message, theme } from 'antd'
import { ArrowLeftOutlined, CommentOutlined } from '@ant-design/icons'
import type { AiCreateTaskSummary, AiReviewableBasicInfoField } from '@xiaotuanbao/shared'
import type { ReviewPackageDecision } from '@xiaotuanbao/ai-contracts'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/app/store/auth.store'
import { useUiStore } from '@/app/store/ui.store'
import { useAssistPaneSlot } from '@/layouts/assist-pane-slot'
import { AiCreateAssistChat } from '@/features/ai-assist/AiCreateAssistChat'
import { AiCreateAssistLoading } from '@/features/ai-assist/AiCreateAssistLoading'
import { AiReviewStickyBar } from '@/features/ai-assist/AiReviewStickyBar'
import { ASSIST_ERROR_TEXT } from '@/features/ai-assist/assist-error-text'
import { REVIEW_FIELD_LABELS } from '@/features/ai-assist/review-field-labels'
import { useAiCreateAssistBootstrap } from '@/features/ai-assist/useAiCreateAssistBootstrap'
import {
  confirmAiCreateTask,
  confirmAiReviewPackage,
  getAiCreateAssistAvailability,
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

const AUTOSAVE_DEBOUNCE_MS = 800

type DraftSaveStatus = 'idle' | 'saving' | 'saved' | 'error'

function newConfirmIdempotencyKey(taskId: string): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `confirm-${taskId}-${Date.now()}`
}

export function CreateDepartureWizard() {
  const { token } = theme.useToken()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const user = useAuthStore((state) => state.user)
  const setAssistPaneCollapsed = useUiStore((state) => state.setAssistPaneCollapsed)
  const assistPaneCollapsed = useUiStore((state) => state.assistPaneCollapsed)
  const { setContent } = useAssistPaneSlot()
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
  const [reviewDecision, setReviewDecision] = useState<ReviewPackageDecision | null>(null)
  const [infoForm] = Form.useForm<InfoFormValues>()
  const dirtyRef = useRef(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const persistInFlightRef = useRef<Promise<void> | null>(null)
  const confirmIdempotencyKeyRef = useRef<string | null>(null)
  const taskIdRef = useRef(taskId)
  const draftVersionRef = useRef(draftVersion)
  const routeValuesRef = useRef(routeValues)
  const templateSelectGenerationRef = useRef(0)
  const templateSelectAbortRef = useRef<AbortController | null>(null)

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

    if (persistInFlightRef.current) {
      await persistInFlightRef.current
    }

    const run = (async () => {
      const info = infoForm.getFieldsValue(true)
      const draft = buildDepartureCreationDraftSnapshot(routeValuesRef.current, info)
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
  }, [persistDraft])

  const flushDraft = useCallback(async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    if (!dirtyRef.current && taskIdRef.current && draftVersionRef.current != null) {
      return
    }
    await persistDraft()
  }, [persistDraft])

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
    [infoForm, loadDepartureNo, persistDraft, user],
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
          void navigate({
            to: '/departure/$departureId',
            params: { departureId: task.departureId },
            search: { tab: 'overview' },
          })
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
  }, [infoForm, loadDepartureNo, navigate, searchTaskId, user])

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
      if (startDate && next.routeName.trim() && (!name?.trim() || name === previousDefaultName)) {
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
    [handleRouteChange],
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
      navigate({
        to: '/departure/$departureId',
        params: { departureId: departure.id },
        search: { tab: 'overview' },
      })
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
  }, [flushDraft, navigate])

  const { data: assistAvailability } = useQuery({
    queryKey: ['ai-create-assist-availability'],
    queryFn: getAiCreateAssistAvailability,
  })

  const buildAssistDraft = useCallback(
    () => buildDepartureCreationDraftSnapshot(routeValuesRef.current, infoForm.getFieldsValue(true)),
    [infoForm],
  )

  const getAssistTaskId = useCallback(() => taskIdRef.current, [])

  const { bootstrap, reset, session, error, loading } = useAiCreateAssistBootstrap({
    enabled: Boolean(assistAvailability?.enabled),
    flushDraft,
    buildDraft: buildAssistDraft,
    getTaskId: getAssistTaskId,
    applySavedDraft,
    syncTaskSearch,
  })
  const bootstrapRef = useRef(bootstrap)
  bootstrapRef.current = bootstrap

  const { data: taskReview, refetch: refetchTaskReview } = useQuery({
    queryKey: ['ai-create-task', taskId],
    queryFn: () => getAiCreateTask(taskId!),
    enabled: Boolean(taskId),
    refetchInterval: session && !assistPaneCollapsed ? 2500 : false,
  })
  const pendingReview = taskReview?.pendingReview ?? null
  const refetchTaskReviewRef = useRef(refetchTaskReview)
  refetchTaskReviewRef.current = refetchTaskReview
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
      queryClient.setQueryData(['ai-create-task', summary.id], summary)
    },
    [applySavedDraft, infoForm, queryClient, user],
  )

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
    [pendingReview, queryClient, taskId],
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
      if (!taskId || !pendingReview || draftVersion == null) {
        throw new Error('没有待确认的审核包')
      }
      if (correctTimerRef.current) {
        clearTimeout(correctTimerRef.current)
        correctTimerRef.current = null
      }
      const corrections = pendingCorrectionsRef.current
      pendingCorrectionsRef.current = {}
      return confirmAiReviewPackage(taskId, pendingReview.id, {
        expectedVersion: draftVersion,
        ...(Object.keys(corrections).length > 0 ? { corrections } : {}),
      })
    },
    onSuccess: (summary) => {
      if (pendingReview) {
        setReviewDecision({
          reviewPackageId: pendingReview.id,
          status: 'confirmed',
          snapshotVersion: summary.draft.version,
        })
      }
      applyConfirmedTask(summary)
      message.success('已将确认值写入发团创建草稿')
    },
    onError: (caught) => {
      const conflict = readAiCreateTaskConflict(caught)
      if (conflict) {
        queryClient.setQueryData(['ai-create-task', conflict.id], conflict)
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
      return rejectAiReviewPackage(taskId, pendingReview.id)
    },
    onSuccess: (summary) => {
      if (pendingReview) {
        setReviewDecision({ reviewPackageId: pendingReview.id, status: 'rejected' })
      }
      applySavedDraft(summary)
      queryClient.setQueryData(['ai-create-task', summary.id], summary)
      message.success('已拒绝 AI 建议，发团创建草稿未改动')
    },
    onError: (caught) => {
      message.error(caught instanceof Error ? caught.message : '拒绝审核包失败')
    },
  })

  const openAssist = useCallback(() => {
    setAssistPaneCollapsed(false)
    void bootstrap()
  }, [bootstrap, setAssistPaneCollapsed])

  const ASSIST_PANE_EXIT_MS = 400 /* 480px slide; must match AssistPane.module.css 0.4s */

  useEffect(() => {
    if (!assistPaneCollapsed) {
      return
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      reset()
      return
    }
    const id = window.setTimeout(() => {
      reset()
    }, ASSIST_PANE_EXIT_MS)
    return () => {
      window.clearTimeout(id)
    }
  }, [assistPaneCollapsed, reset])

  useEffect(() => {
    if (!assistAvailability?.enabled || assistPaneCollapsed || session || error) {
      return
    }
    void bootstrap()
  }, [assistAvailability?.enabled, assistPaneCollapsed, bootstrap, error, session])

  useEffect(() => {
    if (!assistAvailability?.enabled) {
      return
    }

    if (session) {
      const currentTask = taskReview ?? session.task
      setContent(
        <AiCreateAssistChat
          agentRuntimeUrl={session.agentRuntimeUrl}
          delegationToken={session.delegationToken}
          taskId={session.task.id}
          runId={session.runId}
          conversationId={session.conversation.id}
          initialEvents={session.conversation.events}
          initialActiveBatch={session.conversation.activeBatch}
          snapshotVersion={currentTask.draft.version}
          stageKey="basic_info"
          runStatus="idle"
          reviewPackageId={currentTask.pendingReview?.id ?? null}
          progress={currentTask.pendingReview ? 'awaiting_review' : 'collecting'}
          pendingReview={currentTask.pendingReview}
          reviewDecision={reviewDecision}
          onReviewPackageSubmitted={() => {
            setReviewDecision(null)
            void refetchTaskReviewRef.current()
          }}
        />,
      )

      return () => {
        setContent(null)
      }
    }

    if (error) {
      setContent(
        <div className={styles.assistMessage}>
          <p role="alert">{error.message.trim() || ASSIST_ERROR_TEXT}</p>
          <Button aria-label="重试" onClick={() => void bootstrapRef.current()}>
            重试
          </Button>
        </div>,
      )

      return () => {
        setContent(null)
      }
    }

    if (loading) {
      setContent(<AiCreateAssistLoading />)

      return () => {
        setContent(null)
      }
    }
  }, [
    assistAvailability?.enabled,
    error,
    loading,
    reviewDecision,
    session,
    setContent,
    taskReview,
  ])

  const stepEnterKey = showCopyBootstrap ? 'bootstrap' : 'form'

  const saveStatusLabel =
    saveStatus === 'saving'
      ? '发团创建草稿保存中…'
      : saveStatus === 'saved'
        ? '发团创建草稿已保存'
        : saveStatus === 'error'
          ? '发团创建草稿保存失败'
          : null

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
            AI 辅助
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
