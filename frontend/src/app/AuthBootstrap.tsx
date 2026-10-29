import { useAuthLifecycle } from '../features/auth/hooks/useAuthLifecycle'

export function AuthBootstrap({ children }: { children: React.ReactNode }) {
  const { isLoading } = useAuthLifecycle()
  if (isLoading) return <main className="auth-splash"><span className="wordmark">Marketly<span>.</span></span></main>
  return children
}
