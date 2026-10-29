import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, BadgeCheck, Clock3, FileCheck2, ShieldCheck } from 'lucide-react'
import { Link, Navigate } from 'react-router-dom'
import { client } from '../../api/client'
import type { AuthUser } from '../../api/auth-storage'
import { ImageUploadField } from '../../components/shared/ImageUploadField'
import { useDocumentTitle } from '../../utils/use-document-title'

type KycStatus = 'not_submitted' | 'pending' | 'rejected' | 'verified'
type VendorKyc = {
  vendor_id: string
  status: KycStatus
  rejection_reason?: string
  submitted_at?: string
  reviewed_at?: string
  documents: { address_proof: boolean; identity_proof: boolean }
}

function requestError(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = error.response
    if (typeof response === 'object' && response !== null && 'data' in response) {
      const data = response.data
      if (typeof data === 'object' && data !== null && 'message' in data && typeof data.message === 'string') {
        if (data.message.includes('already pending')) return 'Your documents are already under review.'
        return data.message
      }
    }
  }
  return 'We could not submit your documents. Please try again.'
}

export function VendorKycPage() {
  useDocumentTitle('Seller verification')
  const queryClient = useQueryClient()
  const [addressKey, setAddressKey] = useState<string>()
  const [identityKey, setIdentityKey] = useState<string>()
  const [formError, setFormError] = useState('')

  const me = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => (await client.get<AuthUser>('/me')).data,
    staleTime: 30_000,
    gcTime: 120_000,
    retry: false,
  })
  const isVendor = me.data?.role === 'vendor' && me.data.status === 'active' && Boolean(me.data.vendor)
  const kyc = useQuery({
    queryKey: ['vendor', 'kyc', me.data?.id],
    queryFn: async () => (await client.get<VendorKyc>('/vendors/me/kyc')).data,
    enabled: isVendor,
    staleTime: 15_000,
    retry: false,
  })
  const submit = useMutation({
    mutationFn: async () => (await client.post<VendorKyc>('/vendors/me/kyc', { address_proof_key: addressKey, identity_proof_key: identityKey })).data,
    onSuccess: result => {
      queryClient.setQueryData(['vendor', 'kyc', me.data?.id], result)
      queryClient.setQueryData(['auth', 'me'], (current: AuthUser | undefined) => current?.vendor ? { ...current, vendor: { ...current.vendor, kyc_status: 'pending' } } : current)
      setAddressKey(undefined)
      setIdentityKey(undefined)
    },
  })

  if (me.isPending) return <div className="vendor-page-loading"><div className="skeleton vendor-skeleton-title" /><div className="skeleton vendor-skeleton-line" /></div>
  if (me.isError || !isVendor) return <Navigate to="/" replace />

  const status = kyc.data?.status
  const canSubmit = status === 'not_submitted' || status === 'rejected'
  const submitDocuments = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError('')
    if (!addressKey || !identityKey) {
      setFormError('Upload both proof of address and proof of identity before submitting.')
      return
    }
    submit.mutate()
  }

  return <section className="vendor-kyc-page">
    <Link className="vendor-products-back" to="/vendor/dashboard"><ArrowLeft size={16} /> Seller dashboard</Link>
    <header className="vendor-kyc-page-hero"><span className="vendor-kyc-page-mark"><ShieldCheck size={24} /></span><span className="vendor-eyebrow">SELLER VERIFICATION</span><h1>{status === 'verified' ? 'You’re verified' : status === 'pending' ? 'Your documents are in review' : 'Verify your seller account'}</h1><p>{status === 'verified' ? 'Your store can now publish products and upload product images.' : status === 'pending' ? 'Your submission is with our review team. You can check back here for the latest status.' : 'A couple of clear documents help us keep Marketly trusted for every seller and shopper.'}</p></header>

    {kyc.isPending && <div className="vendor-kyc-status-card"><div className="skeleton vendor-skeleton-line" /></div>}
    {kyc.isError && <div className="vendor-products-error" role="alert">We could not load your verification status. <button className="button neutral small" onClick={() => void kyc.refetch()}>Try again</button></div>}

    {kyc.data?.status === 'verified' && <div className="vendor-kyc-status-card verified"><BadgeCheck size={22} /><div><strong>Seller verification complete</strong><p>Your account has full seller access.</p></div></div>}
    {kyc.data?.status === 'pending' && <div className="vendor-kyc-status-card pending"><Clock3 size={22} /><div><strong>Under review</strong><p>We received both documents{kyc.data.submitted_at ? ` on ${new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(kyc.data.submitted_at))}` : ''}. Reviews usually take a little time.</p></div></div>}
    {kyc.data?.status === 'rejected' && <div className="vendor-kyc-status-card rejected"><FileCheck2 size={22} /><div><strong>We need updated documents</strong><p>{kyc.data.rejection_reason || 'Please submit clear, valid documents so we can review your account again.'}</p></div></div>}

    {canSubmit && <form className="vendor-kyc-form" onSubmit={submitDocuments}>
      <div className="vendor-kyc-form-heading"><div><span className="form-step">TWO DOCUMENTS REQUIRED</span><h2>{status === 'rejected' ? 'Update your documents' : 'Your documents'}</h2></div><span className="form-icon"><ShieldCheck size={20} /></span></div>
      <p className="vendor-kyc-form-intro">Use clear images where all text and details are easy to read. We accept JPG, PNG, and WebP images up to 10 MB each.</p>
      <div className="vendor-kyc-upload-grid">
        <ImageUploadField label="Proof of address" purpose="kyc" value={addressKey} onChange={setAddressKey} helperText="For example: a recent utility bill or bank statement." />
        <ImageUploadField label="Proof of identity" purpose="kyc" value={identityKey} onChange={setIdentityKey} helperText="For example: a government-issued photo ID." />
      </div>
      {formError && <p className="vendor-form-error" role="alert">{formError}</p>}
      {submit.error && <p className="vendor-form-error" role="alert">{requestError(submit.error)}</p>}
      <div className="vendor-kyc-submit-row"><span>Your documents are uploaded securely and are only used for seller verification.</span><button type="submit" className="button primary" disabled={submit.isPending || !addressKey || !identityKey}>{submit.isPending ? 'Submitting…' : status === 'rejected' ? 'Resubmit for review' : 'Submit for review'}</button></div>
    </form>}
  </section>
}

export function Component() { return <VendorKycPage /> }
