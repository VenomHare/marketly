import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate } from 'react-router-dom'
import { client } from '../../../api/client'
import { refreshTokenKey, useAuthStorage, type AuthStatus, type AuthUser } from '../../../api/auth-storage'

type TokenResponse = { token: string; refreshToken: string }
export type AuthResponse = TokenResponse & { user: AuthUser }

let lifecyclePromise: Promise<void> | null = null

async function initializeSession(): Promise<void> {
  lifecyclePromise ??= (async () => {
    const store = useAuthStorage.getState()
    store.setChecking()
    const refreshToken = localStorage.getItem(refreshTokenKey)
    if (!refreshToken) {
      store.clear()
      return
    }

    try {
      await refreshAuthSession()
    } catch {
      store.clear()
      localStorage.removeItem(refreshTokenKey)
    }
  })().finally(() => { lifecyclePromise = null })
  return lifecyclePromise
}

export async function refreshAuthSession(): Promise<AuthUser> {
  const refreshToken = localStorage.getItem(refreshTokenKey)
  if (!refreshToken) throw new Error('No refresh token is available.')
  const { data: tokens } = await client.post<TokenResponse>('/auth/refresh', { refreshToken })
  useAuthStorage.getState().setAccessToken(tokens.token)
  localStorage.setItem(refreshTokenKey, tokens.refreshToken)
  const { data: user } = await client.get<AuthUser>('/me')
  useAuthStorage.getState().setUser(user)
  return user
}

export async function establishAuthSession(response: AuthResponse): Promise<AuthUser> {
  useAuthStorage.getState().setSession(response.token, response.user)
  localStorage.setItem(refreshTokenKey, response.refreshToken)

  const sessionId = localStorage.getItem('bz_session_id')
  if (sessionId) {
    try {
      await client.post('/cart/merge', { session_id: sessionId })
      localStorage.removeItem('bz_session_id')
    } catch (error) {
      const status = typeof error === 'object' && error !== null && 'response' in error && typeof error.response === 'object' && error.response !== null && 'status' in error.response ? error.response.status : undefined
      if (status === 404) localStorage.removeItem('bz_session_id')
    }
  }

  const { data: user } = await client.get<AuthUser>('/me')
  useAuthStorage.getState().setUser(user)
  return user
}

export async function clearAuthSession(): Promise<void> {
  try {
    await client.post('/auth/logout')
  } catch {
    // The backend logout route is stateless; clear the local session even offline.
  } finally {
    localStorage.removeItem(refreshTokenKey)
    useAuthStorage.getState().clear()
  }
}

export function useAuthLifecycle(): { status: AuthStatus; isLoading: boolean; isAuthenticated: boolean; user: AuthUser | null } {
  const queryClient = useQueryClient()
  const status = useAuthStorage(state => state.status)
  const user = useAuthStorage(state => state.user)

  useEffect(() => { void initializeSession() }, [])
  useEffect(() => {
    if (status === 'authenticated' && user) queryClient.setQueryData(['auth', 'me'], user)
  }, [queryClient, status, user])

  return { status, isLoading: status === 'checking', isAuthenticated: status === 'authenticated' && user !== null, user }
}

export function useAuth(): { status: AuthStatus; isLoading: boolean; isAuthenticated: boolean; user: AuthUser | null } {
  const status = useAuthStorage(state => state.status)
  const user = useAuthStorage(state => state.user)
  return { status, isLoading: status === 'checking', isAuthenticated: status === 'authenticated' && user !== null, user }
}

export function useIsAuthenticated(): boolean {
  return useAuthStorage(state => state.status === 'authenticated' && state.user !== null)
}

export function useSignOut(): () => Promise<void> {
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  return async () => {
    await clearAuthSession()
    queryClient.removeQueries({ queryKey: ['auth', 'me'] })
    queryClient.removeQueries({ queryKey: ['vendor'] })
    const next = `${location.pathname}${location.search}`
    navigate(`/login?next=${encodeURIComponent(next)}`, { replace: true })
  }
}
