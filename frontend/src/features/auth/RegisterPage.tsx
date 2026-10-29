import { useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { LoaderCircle, LockKeyhole } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AuthLayout } from './AuthLayout'
import { PasswordField } from './PasswordField'
import { getAuthErrorMessage, getPostAuthDestination, submitAuthRequest } from './helpers'
import { registerSchema, type RegisterFields } from './schemas'
import { useDocumentTitle } from '../../utils/use-document-title'

export function RegisterPage() {
  useDocumentTitle('Create account')
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const next = searchParams.get('next')
  const [serverError, setServerError] = useState('')
  const form = useForm<RegisterFields>({ resolver: zodResolver(registerSchema), mode: 'onBlur', shouldFocusError: true })

  const submit = form.handleSubmit(async fields => {
    setServerError('')
    try {
      const user = await submitAuthRequest('/auth/register', fields)
      navigate(getPostAuthDestination(next, user))
    } catch (error) {
      setServerError(getAuthErrorMessage(error))
    }
  })

  return <AuthLayout title="Create account">
    <form className="auth-form" onSubmit={submit} noValidate>
      {serverError && <p className="auth-alert" role="alert">{serverError}</p>}
      <div className="auth-field">
        <label htmlFor="register-name">Your name</label>
        <input id="register-name" autoComplete="name" autoFocus aria-invalid={Boolean(form.formState.errors.name)} aria-describedby={form.formState.errors.name ? 'register-name-error' : undefined} {...form.register('name')} />
        {form.formState.errors.name && <span className="auth-error" id="register-name-error">{form.formState.errors.name.message}</span>}
      </div>
      <div className="auth-field">
        <label htmlFor="register-email">Email</label>
        <input id="register-email" type="email" autoComplete="email" autoCapitalize="none" aria-invalid={Boolean(form.formState.errors.email)} aria-describedby={form.formState.errors.email ? 'register-email-error' : undefined} {...form.register('email')} />
        {form.formState.errors.email && <span className="auth-error" id="register-email-error">{form.formState.errors.email.message}</span>}
      </div>
      <PasswordField id="register-password" register={form.register} error={form.formState.errors.password?.message} />
      <p className="password-hint"><LockKeyhole size={14} /> Use a password you don’t use elsewhere.</p>
      <button className="button primary auth-submit" type="submit" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting && <LoaderCircle className="auth-spinner" size={16} />}Create your Marketly account
      </button>
      <p className="auth-legal">By creating an account, you agree to Marketly’s Terms of Service and Privacy Notice.</p>
    </form>
    <div className="auth-existing">Already have an account? <Link to={`/login${next ? `?next=${encodeURIComponent(next)}` : ''}`}>Sign in</Link></div>
  </AuthLayout>
}

export function Component() {
  return <RegisterPage />
}
