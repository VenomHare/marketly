import { useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowRight, LoaderCircle, Store } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { client } from '../../api/client'
import { useAuth } from '../auth/hooks/useAuthLifecycle'
import { refreshAuthSession } from '../auth/hooks/useAuthLifecycle'
import { vendorApplicationSchema, type VendorApplicationFields } from './schemas'
import { useDocumentTitle } from '../../utils/use-document-title'

function responseMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = error.response
    if (typeof response === 'object' && response !== null && 'data' in response) {
      const data = response.data
      if (typeof data === 'object' && data !== null && 'message' in data && typeof data.message === 'string') return data.message
    }
  }
  return 'We could not submit your application. Please try again.'
}

export function ApplyVendorPage() {
  useDocumentTitle('Become a seller')
  const navigate = useNavigate()
  const { isAuthenticated, isLoading, user } = useAuth()
  const queryClient = useQueryClient()
  const [serverError, setServerError] = useState('')
  const form = useForm<VendorApplicationFields>({ resolver: zodResolver(vendorApplicationSchema), mode: 'onBlur', shouldFocusError: true })

  if (isLoading) return <VendorApplyLoading />
  if (!isAuthenticated) return <Navigate to={`/login?next=${encodeURIComponent('/vendor/apply')}`} replace />
  if (user?.role === 'vendor') return <Navigate to="/vendor/dashboard" replace />
  if (user?.role !== 'customer') return <Navigate to="/" replace />

  const submit = form.handleSubmit(async fields => {
    setServerError('')
    try {
      await client.post('/vendors', fields)
      const vendorUser = await refreshAuthSession()
      queryClient.setQueryData(['auth', 'me'], vendorUser)
      toast.success('Your seller application has been created.')
      navigate('/vendor/dashboard')
    } catch (error) {
      setServerError(responseMessage(error))
    }
  })

  return <section className="vendor-apply-wrap">
    <div className="vendor-apply-intro">
      <span className="vendor-eyebrow"><Store size={15} /> MARKETLY SELLER</span>
      <h1>Bring your store to Marketly</h1>
      <p>Tell us a little about your business. You can complete seller verification and start listing products from your dashboard.</p>
      <div className="vendor-steps"><span className="step-current">1 <b>Business details</b></span><span>2 <b>Verification</b></span><span>3 <b>Start selling</b></span></div>
    </div>
    <form className="vendor-form" onSubmit={submit} noValidate>
      <div className="vendor-form-heading"><div><span className="form-step">STEP 1 OF 3</span><h2>Business details</h2></div><span className="form-icon"><Store size={20} /></span></div>
      {serverError && <p className="vendor-form-error" role="alert">{serverError}</p>}
      <VendorInput id="vendor-name" label="Registered business name" hint="Your legal name or registered business name." error={form.formState.errors.name?.message} {...form.register('name')} />
      <VendorInput id="vendor-display-name" label="Store name" hint="This is how your store will appear to customers." error={form.formState.errors.display_name?.message} {...form.register('display_name')} />
      <div className="vendor-field"><label htmlFor="vendor-address">Business address</label><textarea id="vendor-address" rows={3} aria-invalid={Boolean(form.formState.errors.address)} {...form.register('address')} />{form.formState.errors.address?.message ? <span className="field-error">{form.formState.errors.address.message}</span> : <span className="field-hint">Your primary business or pickup address.</span>}</div>
      <VendorInput id="vendor-postal-code" label="Postal code" autoComplete="postal-code" error={form.formState.errors.postal_code?.message} {...form.register('postal_code')} />
      <button className="button primary vendor-submit" type="submit" disabled={form.formState.isSubmitting}>{form.formState.isSubmitting ? <LoaderCircle className="vendor-spinner" size={17} /> : <>Continue to verification <ArrowRight size={17} /></>}</button>
      <p className="vendor-form-note">Your details are used to set up your seller profile.</p>
      <Link to="/" className="vendor-back-link">Back to shopping</Link>
    </form>
  </section>
}

export function Component() {
  return <ApplyVendorPage />
}

type VendorInputProps = React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string }
function VendorInput({ id, label, hint, error, ...props }: VendorInputProps) {
  return <div className="vendor-field"><label htmlFor={id}>{label}</label><input id={id} aria-invalid={Boolean(error)} {...props} />{error ? <span className="field-error">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}</div>
}

function VendorApplyLoading() {
  return <section className="vendor-apply-wrap"><div className="vendor-apply-intro"><div className="skeleton vendor-skeleton-line" /><div className="skeleton vendor-skeleton-title" /><div className="skeleton vendor-skeleton-line" /></div><div className="vendor-form"><div className="skeleton vendor-skeleton-title" /><div className="skeleton vendor-skeleton-input" /><div className="skeleton vendor-skeleton-input" /></div></section>
}
