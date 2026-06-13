import { apiClient } from './apiClient'
import type { Group } from './types'

export async function getAvailable(): Promise<Group[]> {
  const { data } = await apiClient.get<Group[]>('/groups/available')
  return data
}

export async function getUserGroupRates(): Promise<Record<number, number>> {
  const { data } = await apiClient.get<Record<number, number> | null>('/groups/rates')
  return data || {}
}

export const userGroupsAPI = {
  getAvailable,
  getUserGroupRates,
}

export default userGroupsAPI
