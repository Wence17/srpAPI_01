import { apiClient } from './apiClient'
import type {
  CreateUserAttributeRequest,
  UpdateUserAttributeRequest,
  UserAttributeDefinition,
  UserAttributeValue,
  UserAttributeValuesMap,
} from './types'

export interface BatchUserAttributesResponse {
  attributes: Record<number, Record<number, string>>
}

export async function listDefinitions(): Promise<UserAttributeDefinition[]> {
  const { data } = await apiClient.get<UserAttributeDefinition[]>('/admin/user-attributes')
  return data
}

export async function listEnabledDefinitions(): Promise<UserAttributeDefinition[]> {
  const { data } = await apiClient.get<UserAttributeDefinition[]>('/admin/user-attributes', {
    params: { enabled: true },
  })
  return data
}

export async function createDefinition(
  request: CreateUserAttributeRequest,
): Promise<UserAttributeDefinition> {
  const { data } = await apiClient.post<UserAttributeDefinition>('/admin/user-attributes', request)
  return data
}

export async function updateDefinition(
  id: number,
  request: UpdateUserAttributeRequest,
): Promise<UserAttributeDefinition> {
  const { data } = await apiClient.put<UserAttributeDefinition>(`/admin/user-attributes/${id}`, request)
  return data
}

export async function deleteDefinition(id: number): Promise<{ message: string }> {
  const { data } = await apiClient.delete<{ message: string }>(`/admin/user-attributes/${id}`)
  return data
}

export async function reorderDefinitions(ids: number[]): Promise<{ message: string }> {
  const { data } = await apiClient.put<{ message: string }>('/admin/user-attributes/reorder', { ids })
  return data
}

export async function getUserAttributeValues(userId: number): Promise<UserAttributeValue[]> {
  const { data } = await apiClient.get<UserAttributeValue[]>(`/admin/users/${userId}/attributes`)
  return data
}

export async function updateUserAttributeValues(
  userId: number,
  values: UserAttributeValuesMap,
): Promise<{ message: string }> {
  const { data } = await apiClient.put<{ message: string }>(`/admin/users/${userId}/attributes`, {
    values,
  })
  return data
}

export async function getBatchUserAttributes(
  userIds: number[],
): Promise<BatchUserAttributesResponse> {
  const { data } = await apiClient.post<BatchUserAttributesResponse>('/admin/user-attributes/batch', {
    user_ids: userIds,
  })
  return data
}

export const adminUserAttributesAPI = {
  listDefinitions,
  listEnabledDefinitions,
  createDefinition,
  updateDefinition,
  deleteDefinition,
  reorderDefinitions,
  getUserAttributeValues,
  updateUserAttributeValues,
  getBatchUserAttributes,
}
