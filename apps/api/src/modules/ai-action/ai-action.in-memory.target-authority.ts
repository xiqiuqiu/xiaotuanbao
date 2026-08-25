import type {
  AiActionConversationFact,
  AiActionMaterialFact,
  AiActionMaterialPinFact,
  AiActionTargetAuthority,
  AiActionTaskFact,
} from './ai-action.target'

export class InMemoryAiActionTargetAuthority implements AiActionTargetAuthority {
  readonly tasks: AiActionTaskFact[]
  readonly materials: AiActionMaterialFact[]
  readonly pins: Array<AiActionMaterialPinFact & { inputBatchId: string }>
  readonly conversations: AiActionConversationFact[]

  constructor(seed: {
    tasks?: AiActionTaskFact[]
    materials?: AiActionMaterialFact[]
    pins?: Array<AiActionMaterialPinFact & { inputBatchId: string }>
    conversations?: AiActionConversationFact[]
  } = {}) {
    this.tasks = seed.tasks ? [...seed.tasks] : []
    this.materials = seed.materials ? [...seed.materials] : []
    this.pins = seed.pins ? [...seed.pins] : []
    this.conversations = seed.conversations ? [...seed.conversations] : []
  }

  async findTask(taskId: string): Promise<AiActionTaskFact | null> {
    return this.tasks.find((task) => task.id === taskId) ?? null
  }

  async findMaterial(materialId: string): Promise<AiActionMaterialFact | null> {
    return this.materials.find((material) => material.id === materialId) ?? null
  }

  async findPinnedMaterial(params: {
    inputBatchId: string
    materialId: string
  }): Promise<AiActionMaterialPinFact | null> {
    const pin = this.pins.find(
      (item) => item.inputBatchId === params.inputBatchId && item.materialId === params.materialId,
    )
    if (!pin) {
      return null
    }
    return {
      materialId: pin.materialId,
      organizationId: pin.organizationId,
      parseResultVersion: pin.parseResultVersion,
    }
  }

  async findConversation(conversationId: string): Promise<AiActionConversationFact | null> {
    return this.conversations.find((conversation) => conversation.id === conversationId) ?? null
  }
}

export function authorityForActor(actor: {
  organizationId: string
  userId?: string
  taskId?: string
  conversationId?: string
  inputBatchId?: string
}): InMemoryAiActionTargetAuthority {
  return new InMemoryAiActionTargetAuthority({
    tasks: actor.taskId
      ? [
          {
            id: actor.taskId,
            organizationId: actor.organizationId,
            ownerUserId: actor.userId ?? 'user-1',
            draftId: 'draft-1',
            draftVersion: 1,
          },
        ]
      : [],
    materials: [
      { id: 'mat-1', organizationId: actor.organizationId },
      { id: 'mat-other', organizationId: 'org-other' },
    ],
    pins: actor.inputBatchId
      ? [
          {
            materialId: 'mat-1',
            organizationId: actor.organizationId,
            inputBatchId: actor.inputBatchId,
            parseResultVersion: 1,
          },
        ]
      : [],
    conversations: actor.conversationId
      ? [
          {
            id: actor.conversationId,
            organizationId: actor.organizationId,
            creatorUserId: actor.userId ?? 'user-1',
          },
        ]
      : [],
  })
}
