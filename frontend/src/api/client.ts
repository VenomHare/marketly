import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { refreshTokenKey, useAuthStorage } from './auth-storage'

const client = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 20_000,
  headers: { 'Content-Type': 'application/json' },
})

type RetryConfig = InternalAxiosRequestConfig & { _retried?: boolean }
type ApiEnvelope<T> = { data: T }
let refreshRequest: Promise<string> | null = null

client.interceptors.request.use((config) => {
  const token = useAuthStorage.getState().accessToken
  if (token) config.headers.Authorization = `Bearer ${token}`
  else if (config.url?.startsWith('/cart')) {
    let sessionId = localStorage.getItem('bz_session_id')
    if (!sessionId) {
      sessionId = crypto.randomUUID()
      localStorage.setItem('bz_session_id', sessionId)
    }
    config.headers['X-Session-Id'] = sessionId
  }
  return config
})

client.interceptors.response.use((response) => response, async (error: AxiosError) => {
  const config = error.config as RetryConfig | undefined
  if (error.response?.status !== 401 || !config || config._retried || /\/auth\/(login|refresh)$/.test(config.url || '')) return Promise.reject(error)
  const refreshToken = localStorage.getItem(refreshTokenKey)
  if (!refreshToken) return Promise.reject(error)
  config._retried = true
  try {
    refreshRequest ??= client.post<ApiEnvelope<{ access_token: string; refresh_token: string }>>('/auth/refresh', { refresh_token: refreshToken }).then(({ data }) => {
      useAuthStorage.getState().setAccessToken(data.data.access_token)
      localStorage.setItem(refreshTokenKey, data.data.refresh_token)
      return data.data.access_token
    }).finally(() => { refreshRequest = null })
    const accessToken = await refreshRequest
    config.headers.Authorization = `Bearer ${accessToken}`
    return client(config)
  } catch (refreshError) {
    useAuthStorage.getState().clear()
    localStorage.removeItem(refreshTokenKey)
    const next = `${location.pathname}${location.search}`
    location.assign(`/login?next=${encodeURIComponent(next)}`)
    return Promise.reject(refreshError)
  }
})

export async function getData<T>(path: string): Promise<T> {
  const { data } = await client.get<T>(path)
  return data
}

export { client }
