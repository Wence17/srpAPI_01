import { apiClient } from './apiClient'
import type { ApiKey } from './types'

export interface UpdateApiKeyGroupResult {
  api_key: ApiKey
  auto_granted_group_access: boolean
  granted_group_id?: number
  granted_group_name?: string
}

export async function updateApiKeyGroup(
  id: number,
  groupId: number | null,
): Promise<UpdateApiKeyGroupResult> {
  const { data } = await apiClient.put<UpdateApiKeyGroupResult>(`/admin/api-keys/${id}`, {
    group_id: groupId === null ? 0 : groupId,
  })
  return data
}

export const adminApiKeysAPI = {
  updateApiKeyGroup,
}
