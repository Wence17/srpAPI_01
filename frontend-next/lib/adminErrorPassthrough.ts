import { apiClient } from './apiClient'

export interface ErrorPassthroughRule {
  id: number
  name: string
  enabled: boolean
  priority: number
  error_codes: number[]
  keywords: string[]
  match_mode: 'any' | 'all'
  platforms: string[]
  passthrough_code: boolean
  response_code: number | null
  passthrough_body: boolean
  custom_message: string | null
  skip_monitoring: boolean
  description: string | null
  created_at: string
  updated_at: string
}

export interface CreateRuleRequest {
  name: string
  enabled?: boolean
  priority?: number
  error_codes?: number[]
  keywords?: string[]
  match_mode?: 'any' | 'all'
  platforms?: string[]
  passthrough_code?: boolean
  response_code?: number | null
  passthrough_body?: boolean
  custom_message?: string | null
  skip_monitoring?: boolean
  description?: string | null
}

export interface UpdateRuleRequest {
  name?: string
  enabled?: boolean
  priority?: number
  error_codes?: number[]
  keywords?: string[]
  match_mode?: 'any' | 'all'
  platforms?: string[]
  passthrough_code?: boolean
  response_code?: number | null
  passthrough_body?: boolean
  custom_message?: string | null
  skip_monitoring?: boolean
  description?: string | null
}

export async function list(): Promise<ErrorPassthroughRule[]> {
  const { data } = await apiClient.get<ErrorPassthroughRule[]>('/admin/error-passthrough-rules')
  return data
}

export async function create(ruleData: CreateRuleRequest): Promise<ErrorPassthroughRule> {
  const { data } = await apiClient.post<ErrorPassthroughRule>('/admin/error-passthrough-rules', ruleData)
  return data
}

export async function update(id: number, updates: UpdateRuleRequest): Promise<ErrorPassthroughRule> {
  const { data } = await apiClient.put<ErrorPassthroughRule>(
    `/admin/error-passthrough-rules/${id}`,
    updates,
  )
  return data
}

export async function deleteRule(id: number): Promise<{ message: string }> {
  const { data } = await apiClient.delete<{ message: string }>(`/admin/error-passthrough-rules/${id}`)
  return data
}

export async function toggleEnabled(id: number, enabled: boolean): Promise<ErrorPassthroughRule> {
  return update(id, { enabled })
}

export const adminErrorPassthroughAPI = {
  list,
  create,
  update,
  delete: deleteRule,
  toggleEnabled,
}
