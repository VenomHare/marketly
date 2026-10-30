import { useEffect, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { LoaderCircle } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AuthLayout } from './AuthLayout'
import { PasswordField } from './PasswordField'
import { getAuthErrorMessage, getPostAuthDestination, submitAuthRequest } from './helpers'
import { loginSchema, type LoginFields } from './schemas'
import { useDocumentTitle } from '../../utils/use-document-title'
import { useAuth } from './hooks/useAuthLifecycle'

export function LoginPage() {
  useDocumentTitle('Sign in')
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { isAuthenticated, isLoading, user } = useAuth()
  const next = searchParams.get('next')
  const [serverError, setServerError] = useState('')
  const form = useForm<LoginFields>({ resolver: zodResolver(loginSchema), mode: 'onBlur', shouldFocusError: true })

  useEffect(() => {
    if (!isLoading && isAuthenticated && user) navigate(getPostAuthDestination(next, user), { replace: true })
  }, [isAuthenticated, isLoading, navigate, next, user])

  const submit = form.handleSubmit(async fields => {
    setServerError('')
    try {
      const user = await submitAuthRequest('/auth/login', fields)
      navigate(getPostAuthDestination(next, user))
    } catch (error) {
      setServerError(getAuthErrorMessage(error))
    }
  })

  return <AuthLayout title="Sign in">
    <form className="auth-form" onSubmit={submit} noValidate>
      {serverError && <p className="auth-alert" role="alert">{serverError}</p>}
      <div className="auth-field">
        <label htmlFor="login-email">Email</label>
        <input id="login-email" type="email" autoComplete="email" autoCapitalize="none" autoFocus aria-invalid={Boolean(form.formState.errors.email)} aria-describedby={form.formState.errors.email ? 'login-email-error' : undefined} {...form.register('email')} />
        {form.formState.errors.email && <span className="auth-error" id="login-email-error">{form.formState.errors.email.message}</span>}
      </div>
      <PasswordField id="login-password" register={form.register} error={form.formState.errors.password?.message} />
      <button className="button primary auth-submit" type="submit" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting && <LoaderCircle className="auth-spinner" size={16} />}Continue
      </button>
      <p className="auth-legal">By continuing, you agree to Marketly’s Terms of Service and Privacy Notice.</p>
    </form>
    <div className="auth-divider"><span>New to Marketly?</span></div>
    <Link className="button neutral auth-secondary" to={`/register${next ? `?next=${encodeURIComponent(next)}` : ''}`}>Create your Marketly account</Link>
  </AuthLayout>
}

export function Component() {
  return <LoginPage />
}
