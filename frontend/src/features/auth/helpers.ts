import { toast } from 'sonner'
import { client } from '../../api/client'
import { establishAuthSession, type AuthResponse } from './hooks/useAuthLifecycle'
import type { AuthUser } from '../../api/auth-storage'

export function getAuthErrorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = error.response
    if (typeof response === 'object' && response !== null && 'data' in response) {
      const data = response.data
      if (typeof data === 'object' && data !== null && 'message' in data && typeof data.message === 'string') return data.message
    }
  }
  return 'We could not complete your request. Please try again.'
}

export function getPostAuthDestination(next: string | null, user: AuthUser): string {
  if (user.role === 'admin') return '/admin'
  if (user.role === 'vendor') return '/vendor/dashboard'
  if (next?.startsWith('/') && !next.startsWith('//') && !next.startsWith('/login') && !next.startsWith('/register')) return next
  return '/'
}

export async function submitAuthRequest(path: '/auth/login' | '/auth/register', fields: object): Promise<AuthUser> {
  const { data } = await client.post<AuthResponse>(path, fields)
  const user = await establishAuthSession(data)
  toast.success(path.endsWith('register') ? 'Your Marketly account is ready.' : `Welcome back, ${user.name.split(' ')[0]}.`)
  return user
}
