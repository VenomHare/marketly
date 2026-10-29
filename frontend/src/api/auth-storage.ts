import { create } from 'zustand'

type AuthState = {
  accessToken: string | null
  user: AuthUser | null
  status: AuthStatus
  setAccessToken: (token: string | null) => void
  setUser: (user: AuthUser | null) => void
  setSession: (token: string, user: AuthUser | null) => void
  setChecking: () => void
  clear: () => void
}

export type AuthStatus = 'checking' | 'authenticated' | 'unauthenticated'

export type AuthUser = {
  id: string
  name: string
  email: string
  role: 'customer' | 'vendor' | 'admin'
  status: string
  vendor?: { id: string; display_name: string; kyc_status: string }
}

export const useAuthStorage = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  status: 'checking',
  setAccessToken: (accessToken) => set(state => ({ accessToken, status: state.user ? 'authenticated' : state.status })),
  setUser: (user) => set({ user, status: user ? 'authenticated' : 'unauthenticated' }),
  setSession: (accessToken, user) => set({ accessToken, user, status: 'authenticated' }),
  setChecking: () => set({ status: 'checking' }),
  clear: () => set({ accessToken: null, user: null, status: 'unauthenticated' }),
}))

export const refreshTokenKey = 'bz_refresh'
