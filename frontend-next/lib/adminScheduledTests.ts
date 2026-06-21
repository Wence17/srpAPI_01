import { apiClient } from './apiClient'
import type {
  CreateScheduledTestPlanRequest,
  ScheduledTestPlan,
  ScheduledTestResult,
  UpdateScheduledTestPlanRequest,
} from './types'

export async function listByAccount(accountId: number): Promise<ScheduledTestPlan[]> {
  const { data } = await apiClient.get<ScheduledTestPlan[]>(
    `/admin/accounts/${accountId}/scheduled-test-plans`,
  )
  return data ?? []
}

export async function create(req: CreateScheduledTestPlanRequest): Promise<ScheduledTestPlan> {
  const { data } = await apiClient.post<ScheduledTestPlan>('/admin/scheduled-test-plans', req)
  return data
}

export async function update(
  id: number,
  req: UpdateScheduledTestPlanRequest,
): Promise<ScheduledTestPlan> {
  const { data } = await apiClient.put<ScheduledTestPlan>(`/admin/scheduled-test-plans/${id}`, req)
  return data
}

export async function deletePlan(id: number): Promise<void> {
  await apiClient.delete(`/admin/scheduled-test-plans/${id}`)
}

export async function listResults(planId: number, limit?: number): Promise<ScheduledTestResult[]> {
  const { data } = await apiClient.get<ScheduledTestResult[]>(
    `/admin/scheduled-test-plans/${planId}/results`,
    { params: limit ? { limit } : undefined },
  )
  return data ?? []
}

export const adminScheduledTestsAPI = {
  listByAccount,
  create,
  update,
  delete: deletePlan,
  listResults,
}
