import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { Button, Card, Form, Grid, Spin, Steps, Typography, message, theme } from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/app/store/auth.store'
import {
  confirmAiCreateTask,
  getAiCreateTask,
  saveDepartureCreationDraft,
} from '@/services/ai-create-task.service'
import { previewDepartureNo } from '@/services/departure.service'
import { getRouteTemplate } from '@/services/route-template.service'
import { CreateDepartureStepInfo } from './CreateDepartureStepInfo'
import { CreateDepartureStepRoute } from './CreateDepartureStepRoute'
import { useCopyFromDepartureSearch } from '../hooks/useCopyFromDepartureSearch'
import styles from './CreateDepartureWizard.module.css'
import {
  applyDraftSnapshotToInfoForm,
  applyDraftSnapshotToRoute,
  buildDepartureCreationDraftSnapshot,
  canProceedFromRouteStep,
  createInfoFormValues,
  type InfoFormValues,
  createInitialRouteStepValues,
  getShanghaiTodayString,
  type RouteStepValues,
} from '../utils/departure-wizard-form'

const STEP_ITEMS = [{ title: '选择路线' }, { title: '填写信息' }]
const AUTOSAVE_DEBOUNCE_MS = 800

const focusRouteStepGap = (nextRouteValues: RouteStepValues) => {
  if (nextRouteValues.mode === 'template') {
    document.querySelector<HTMLElement>('[aria-label^="选择路线 "]')?.focus()
    return
  }

  if (!nextRouteValues.routeName.trim()) {
    document.querySelector<HTMLElement>('[aria-label="路线名称"]')?.focus()
    return
  }

  document.querySelector<HTMLElement>('[aria-label="出团日期"]')?.focus()
}

type DraftSaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export function CreateDepartureWizard() {
  const screens = Grid.useBreakpoint()
  const { token } = theme.useToken()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const user = useAuthStore((state) => state.user)
  const search = useSearch({ strict: false }) as { copyFrom?: string; taskId?: string }
  const copyFromId = search.copyFrom?.trim()
  const searchTaskId = search.taskId?.trim()

  const [currentStep, setCurrentStep] = useState(0)
  const [routeValues, setRouteValues] = useState<RouteStepValues>(() => createInitialRouteStepValues())
  const [initializingStep2, setInitializingStep2] = useState(
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
  const confirmIdempotencyKeyRef = useRef<string | null>(null)
  const taskIdRef = useRef(taskId)
  const draftVersionRef = useRef(draftVersion)
  const routeValuesRef = useRef(routeValues)

  useEffect(() => {
    taskIdRef.current = taskId
  }, [taskId])

  useEffect(() => {
    draftVersionRef.current = draftVersion
  }, [draftVersion])

  useEffect(() => {
    routeValuesRef.current = routeValues
  }, [routeValues])

  const isCopyMode = routeValues.mode === 'copy'
  const canProceed = canProceedFromRouteStep(routeValues)
  const awaitingCopySource = Boolean(copyFromId) && !isCopyMode && !searchTaskId
  const showCopyBootstrap =
    awaitingCopySource ||
    restoringTask ||
    (isCopyMode && (initializingStep2 || currentStep === 0))

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
      if (
        draft.mode === 'manual' &&
        !draft.routeName &&
        !draft.name &&
        !draft.startDate
      ) {
        return
      }

      setSaveStatus('saving')
      try {
        const currentTaskId = taskIdRef.current
        const currentVersion = draftVersionRef.current
        const result = await saveDepartureCreationDraft({
          taskId: currentTaskId ?? undefined,
          expectedVersion: currentTaskId ? (currentVersion ?? undefined) : undefined,
          draft,
        })
        setTaskId(result.id)
        setDraftVersion(result.draft.version)
        taskIdRef.current = result.id
        draftVersionRef.current = result.draft.version
        dirtyRef.current = false
        setSaveStatus('saved')
        if (!currentTaskId) {
          syncTaskSearch(result.id)
        }
      } catch (error) {
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
  }, [infoForm, syncTaskSearch, user])

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

      setInitializingStep2(true)
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
        setCurrentStep(1)
        dirtyRef.current = true
        await persistDraft()
      } catch (error) {
        message.error(error instanceof Error ? error.message : '发团创建草稿保存失败')
      } finally {
        setInitializingStep2(false)
      }
    },
    [infoForm, loadDepartureNo, persistDraft, user],
  )

  const handleCopyLoadError = useCallback(() => {
    setInitializingStep2(false)
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
        setCurrentStep(1)
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
          setInitializingStep2(false)
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

  const handleRouteStepNext = async () => {
    if (!canProceed) {
      if (routeValues.mode === 'template') {
        message.warning('请先选择一条常用路线')
      } else if (!routeValues.routeName.trim()) {
        message.warning('请填写路线名称')
      } else {
        message.warning('请选择出团日期')
      }
      focusRouteStepGap(routeValues)
      return
    }

    if (routeValues.mode === 'template' && routeValues.templateId) {
      try {
        const detail = await getRouteTemplate(routeValues.templateId)
        const nextRouteValues: RouteStepValues = {
          ...routeValues,
          previewSegmentCount: detail.segmentCount,
          previewResourceCount: detail.resourceCount,
        }
        setRouteValues(nextRouteValues)
        await enterInfoStep(nextRouteValues)
      } catch (error) {
        message.error(error instanceof Error ? error.message : '加载路线详情失败')
      }
      return
    }

    await enterInfoStep(routeValues)
  }

  const createMutation = useMutation({
    mutationFn: async () => {
      await flushDraft()
      const currentTaskId = taskIdRef.current
      const currentVersion = draftVersionRef.current
      if (!currentTaskId || currentVersion == null) {
        throw new Error('发团创建草稿尚未保存，请稍后再试')
      }
      if (!confirmIdempotencyKeyRef.current) {
        confirmIdempotencyKeyRef.current =
          typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `confirm-${currentTaskId}-${Date.now()}`
      }
      return confirmAiCreateTask(
        currentTaskId,
        { expectedVersion: currentVersion },
        confirmIdempotencyKeyRef.current,
      )
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
      message.error(error instanceof Error ? error.message : '创建失败')
    },
  })

  const handleCreate = async () => {
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

  const showSteps = !isCopyMode && !copyFromId && !searchTaskId
  const stepEnterKey = showCopyBootstrap
    ? 'bootstrap'
    : !isCopyMode && currentStep === 0
      ? 'route'
      : 'info'

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

      <Card className={styles.wizardCard} styles={{ body: { padding: 0, height: '100%' } }}>
        <div
          className={
            showSteps ? styles.wizardBody : `${styles.wizardBody} ${styles.wizardBodyNoRail}`
          }
        >
          {showSteps ? (
            <aside className={styles.stepRail} aria-label="创建进度">
              <Steps
                current={currentStep}
                orientation={screens.lg ? 'vertical' : 'horizontal'}
                responsive={false}
                items={[
                  { title: STEP_ITEMS[0].title, content: '选择或输入本次发团路线' },
                  { title: STEP_ITEMS[1].title, content: '填写发团基础信息' },
                ]}
              />
            </aside>
          ) : null}

          <section className={styles.workspace} aria-label="发团创建内容">
            {currentStep === 0 || showCopyBootstrap ? (
              <Form form={infoForm} className={styles.hiddenForm} aria-hidden />
            ) : null}
            <div key={stepEnterKey} className={styles.stepEnter}>
              {showCopyBootstrap ? (
                <div className={styles.loadingState}>
                  <Spin
                    description={restoringTask ? '正在恢复发团创建草稿…' : '正在加载源发团…'}
                  />
                </div>
              ) : !isCopyMode && currentStep === 0 ? (
                <CreateDepartureStepRoute values={routeValues} onChange={setRouteValues} />
              ) : (
                <CreateDepartureStepInfo
                  form={infoForm}
                  route={routeValues}
                  onValuesChange={scheduleAutosave}
                />
              )}
            </div>
          </section>
        </div>

        <footer className={styles.wizardFooter}>
          <div>
            {showSteps && currentStep === 1 ? (
              <Button
                onClick={() => {
                  void flushDraft()
                    .then(() => setCurrentStep(0))
                    .catch((error) => {
                      message.error(
                        error instanceof Error ? error.message : '发团创建草稿保存失败，请处理后再返回',
                      )
                    })
                }}
              >
                上一步
              </Button>
            ) : (
              <Button onClick={goBack}>返回</Button>
            )}
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
            {!isCopyMode && !copyFromId && !searchTaskId && currentStep === 0 ? (
              <Button
                type="primary"
                loading={initializingStep2}
                onClick={() => void handleRouteStepNext()}
              >
                下一步
              </Button>
            ) : (
              <Button
                type="primary"
                loading={createMutation.isPending}
                disabled={showCopyBootstrap || initializingStep2}
                onClick={() => void handleCreate()}
              >
                创建发团
              </Button>
            )}
          </div>
        </footer>
      </Card>
    </div>
  )
}
