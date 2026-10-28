import { create } from 'zustand'

type AuthState = {
  accessToken: string | null
  setAccessToken: (token: string | null) => void
  clear: () => void
}

export const useAuthStorage = create<AuthState>((set) => ({
  accessToken: null,
  setAccessToken: (accessToken) => set({ accessToken }),
  clear: () => set({ accessToken: null }),
}))

export const refreshTokenKey = 'bz_refresh'
