import { request } from '@/lib/request'
import type { WorkbenchSnapshot } from '@/types/api'

export function getWorkbench(): Promise<WorkbenchSnapshot> {
  return request.get<WorkbenchSnapshot>('/workbench', { silentError: true })
}
