import { apiClient } from './apiClient'
import type { CustomMenuItem } from './types'

export interface AdminSystemSettings {
  site_name?: string
  payment_enabled?: boolean
  risk_control_enabled?: boolean
  available_channels_enabled?: boolean
  affiliate_enabled?: boolean
  channel_monitor_enabled?: boolean
  ops_monitoring_enabled?: boolean
  ops_realtime_monitoring_enabled?: boolean
  ops_query_mode_default?: string
  custom_menu_items?: CustomMenuItem[]
}

export type UpdateAdminSettingsRequest = Partial<AdminSystemSettings>

export async function getSettings(): Promise<AdminSystemSettings> {
  const { data } = await apiClient.get<AdminSystemSettings>('/admin/settings')
  return data
}

export async function updateSettings(settings: UpdateAdminSettingsRequest): Promise<AdminSystemSettings> {
  const { data } = await apiClient.put<AdminSystemSettings>('/admin/settings', settings)
  return data
}

export const adminSettingsAPI = {
  getSettings,
  updateSettings,
}
