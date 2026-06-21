import { apiClient } from './apiClient'

export interface TLSFingerprintProfile {
  id: number
  name: string
  description: string | null
  enable_grease: boolean
  cipher_suites: number[]
  curves: number[]
  point_formats: number[]
  signature_algorithms: number[]
  alpn_protocols: string[]
  supported_versions: number[]
  key_share_groups: number[]
  psk_modes: number[]
  extensions: number[]
  created_at: string
  updated_at: string
}

export interface CreateProfileRequest {
  name: string
  description?: string | null
  enable_grease?: boolean
  cipher_suites?: number[]
  curves?: number[]
  point_formats?: number[]
  signature_algorithms?: number[]
  alpn_protocols?: string[]
  supported_versions?: number[]
  key_share_groups?: number[]
  psk_modes?: number[]
  extensions?: number[]
}

export interface UpdateProfileRequest {
  name?: string
  description?: string | null
  enable_grease?: boolean
  cipher_suites?: number[]
  curves?: number[]
  point_formats?: number[]
  signature_algorithms?: number[]
  alpn_protocols?: string[]
  supported_versions?: number[]
  key_share_groups?: number[]
  psk_modes?: number[]
  extensions?: number[]
}

export async function list(): Promise<TLSFingerprintProfile[]> {
  const { data } = await apiClient.get<TLSFingerprintProfile[]>('/admin/tls-fingerprint-profiles')
  return data
}

export async function create(profileData: CreateProfileRequest): Promise<TLSFingerprintProfile> {
  const { data } = await apiClient.post<TLSFingerprintProfile>(
    '/admin/tls-fingerprint-profiles',
    profileData,
  )
  return data
}

export async function update(
  id: number,
  updates: UpdateProfileRequest,
): Promise<TLSFingerprintProfile> {
  const { data } = await apiClient.put<TLSFingerprintProfile>(
    `/admin/tls-fingerprint-profiles/${id}`,
    updates,
  )
  return data
}

export async function deleteProfile(id: number): Promise<{ message: string }> {
  const { data } = await apiClient.delete<{ message: string }>(
    `/admin/tls-fingerprint-profiles/${id}`,
  )
  return data
}

export const adminTlsFingerprintProfilesAPI = {
  list,
  create,
  update,
  delete: deleteProfile,
}
