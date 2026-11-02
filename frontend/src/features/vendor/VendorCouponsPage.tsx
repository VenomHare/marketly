import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CalendarDays, CirclePlus, RefreshCw, Tag, TicketPercent, Trash2 } from 'lucide-react'
import { Link, Navigate } from 'react-router-dom'
import { client } from '../../api/client'
import type { AuthUser } from '../../api/auth-storage'
import { ConfirmActionModal } from '../../components/ui/ConfirmActionModal'
import { formatMoney } from '../../utils/format-money'
import { useDocumentTitle } from '../../utils/use-document-title'
import { getVendorProducts } from './products-api'

type Coupon = { id: string; code: string; product_ids: string[]; discount_type: 'percentage' | 'fixed'; discount_value: number; min_order_paise?: number; max_discount_paise?: number; usage_limit?: number; usage_count: number; is_exhausted: boolean; starts_at: string; expires_at: string; is_active: boolean }
type Product = { id: string; name: string; sku: string; price: number; status: string }
const localDate = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
const money = (paise: number) => formatMoney(paise)

export function VendorCouponsPage() {
  useDocumentTitle('Manage coupons')
  const queryClient = useQueryClient()
  const [error, setError] = useState('')
  const [couponToRemove, setCouponToRemove] = useState<Coupon | null>(null)
  const [startsAtInput, setStartsAtInput] = useState(() => localDate(new Date()))
  const [expiresAtInput, setExpiresAtInput] = useState(() => localDate(new Date(Date.now() + 30 * 86_400_000)))
  const me = useQuery({ queryKey: ['auth', 'me'], queryFn: async () => (await client.get<AuthUser>('/me')).data, staleTime: 30_000, retry: false })
  const isVendor = me.data?.role === 'vendor' && me.data.status === 'active' && Boolean(me.data.vendor)
  const verified = isVendor && me.data?.vendor?.kyc_status === 'verified'
  const products = useQuery({
    queryKey: ['vendor-coupon-products', me.data?.id],
    enabled: isVendor,
    queryFn: async () => {
      const first = await getVendorProducts(1)
      const rest = await Promise.all(Array.from({ length: Math.max(0, first.pagination.pages - 1) }, (_, index) => getVendorProducts(index + 2)))
      return [...first.products, ...rest.flatMap(page => page.products)] as Product[]
    },
    retry: false,
  })
  const coupons = useQuery({
    queryKey: ['vendor-coupons', me.data?.id],
    enabled: isVendor,
    queryFn: async () => (await client.get<{ coupons: Coupon[] }>('/vendors/me/coupons')).data.coupons,
    retry: false,
  })
  const refresh = async () => { await queryClient.invalidateQueries({ queryKey: ['vendor-coupons', me.data?.id] }) }
  const create = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => (await client.post<Coupon>('/vendors/me/coupons', payload)).data,
    onSuccess: async () => { await refresh(); (document.querySelector('#vendor-coupon-form') as HTMLFormElement | null)?.reset(); setError('') },
    onError: (reason: any) => setError(reason?.response?.data?.message ?? 'Could not create this coupon. Please try again.'),
  })
  const remove = useMutation({
    mutationFn: async (id: string) => client.delete(`/vendors/me/coupons/${id}`),
    onSuccess: refresh,
    onError: (reason: any) => setError(reason?.response?.data?.message ?? 'Could not remove this coupon. Please try again.'),
  })
  const productById = useMemo(() => new Map((products.data ?? []).map(product => [product.id, product])), [products.data])

  if (me.isPending) return <section className="vendor-coupons-page"><div className="vendor-products-loading skeleton" /></section>
  if (me.isError || !isVendor) return <Navigate to="/" replace />

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    const form = new FormData(event.currentTarget)
    const selectedProducts = form.getAll('product_ids').map(String)
    const type = String(form.get('discount_type')) as Coupon['discount_type']
    const value = Number(form.get('discount_value'))
    const starts = new Date(startsAtInput)
    const expires = new Date(expiresAtInput)
    if (!selectedProducts.length || !Number.isFinite(value) || value <= 0 || (type === 'percentage' && value > 100) || !Number.isFinite(starts.getTime()) || !Number.isFinite(expires.getTime()) || expiresAtInput <= startsAtInput) {
      setError('Choose at least one product, enter a valid discount, and set the end date after the start date.')
      return
    }
    create.mutate({
      code: String(form.get('code')).trim(), product_ids: selectedProducts, discount_type: type, discount_value: type === 'fixed' ? Math.round(value * 100) : value,
      ...(form.get('minimum') ? { min_order_paise: Math.round(Number(form.get('minimum')) * 100) } : {}),
      ...(form.get('maximum') ? { max_discount_paise: Math.round(Number(form.get('maximum')) * 100) } : {}),
      ...(form.get('usage_limit') ? { usage_limit: Number(form.get('usage_limit')) } : {}), starts_at: starts.toISOString(), expires_at: expires.toISOString(),
    })
  }

  return <section className="vendor-coupons-page">
    <div className="vendor-products-top"><Link className="vendor-products-back" to="/vendor/dashboard"><ArrowLeft size={16} /> Seller dashboard</Link></div>
    <div className="vendor-products-heading"><div><span className="vendor-eyebrow">PROMOTIONS</span><h1>Product coupons</h1><p>Create a code that discounts selected products in your catalog.</p></div></div>
    {!verified && <div className="vendor-products-notice"><TicketPercent size={18} /><div><strong>Verification is required to publish coupons.</strong><p>You can review existing coupons while your seller verification is pending.</p></div></div>}
    {error && <div className="vendor-products-error" role="alert"><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss error">×</button></div>}
    <div className="vendor-coupons-layout">
      <form id="vendor-coupon-form" className="vendor-coupon-form" onSubmit={submit}>
        <div className="vendor-coupon-form-heading"><span className="vendor-coupon-icon"><CirclePlus size={18} /></span><div><h2>Create a coupon</h2><p>Discounts apply only to the selected items.</p></div></div>
        <label className="vendor-field">Coupon code<input name="code" required maxLength={100} pattern="[A-Za-z0-9_-]+" placeholder="SUMMER15" /></label>
        <label className="vendor-field">Eligible products<select name="product_ids" multiple required size={Math.min(7, Math.max(3, products.data?.length ?? 3))} disabled={products.isPending || !verified}>{(products.data ?? []).map(product => <option key={product.id} value={product.id} disabled={product.status !== 'active'}>{product.name} · {product.status === 'active' ? money(product.price) : product.status}</option>)}</select><small>Use Ctrl or Command to select multiple products. Only active products can be selected.</small></label>
        <div className="vendor-coupon-row"><label className="vendor-field">Discount type<select name="discount_type"><option value="percentage">Percentage (%)</option><option value="fixed">Fixed amount (₹)</option></select></label><label className="vendor-field">Discount value<input name="discount_value" type="number" required min="0.01" step="0.01" placeholder="10" /></label></div>
        <div className="vendor-coupon-row"><label className="vendor-field">Minimum eligible spend (₹)<input name="minimum" type="number" min="0" step="0.01" placeholder="No minimum" /></label><label className="vendor-field">Maximum discount (₹)<input name="maximum" type="number" min="0.01" step="0.01" placeholder="No cap" /></label></div>
        <label className="vendor-field">Total uses<input name="usage_limit" type="number" min="1" step="1" placeholder="Unlimited" /></label>
        <div className="vendor-coupon-row"><label className="vendor-field">Starts at<input name="starts_at" type="datetime-local" required value={startsAtInput} onChange={event => setStartsAtInput(event.target.value)} /></label><label className="vendor-field">Expires at<input name="expires_at" type="datetime-local" required min={startsAtInput} value={expiresAtInput} onChange={event => setExpiresAtInput(event.target.value)} /></label></div>
        <button className="button primary vendor-coupon-submit" type="submit" disabled={!verified || create.isPending || products.isPending || !products.data?.some(product => product.status === 'active')}>{create.isPending ? 'Creating…' : 'Create product coupon'}</button>
      </form>
      <section className="vendor-coupon-list">
        <div className="vendor-coupon-list-heading"><div><span className="vendor-eyebrow">YOUR PROMOTIONS</span><h2>Coupons</h2></div><span>{coupons.data?.length ?? 0}</span></div>
        {coupons.isPending && <div className="vendor-products-loading skeleton" />}
        {coupons.isError && <div className="vendor-coupon-empty"><p>We couldn’t load your coupons.</p><button className="button neutral" onClick={() => void coupons.refetch()}><RefreshCw size={15} /> Try again</button></div>}
        {coupons.data?.length === 0 && <div className="vendor-coupon-empty"><Tag size={24} /><strong>No coupons yet</strong><p>Your product offers will appear here.</p></div>}
        {coupons.data?.map(coupon => { const exhausted = coupon.is_exhausted; const expired = new Date(coupon.expires_at).getTime() <= Date.now(); const scheduled = new Date(coupon.starts_at).getTime() > Date.now(); const currentlyActive = coupon.is_active && !exhausted && !expired && !scheduled; return <article className={`vendor-coupon-card ${currentlyActive ? '' : 'inactive'}`} key={coupon.id}>
          <div className="vendor-coupon-card-top"><div><span className="vendor-coupon-code">{coupon.code}</span><span className={`vendor-coupon-status ${currentlyActive ? 'active' : ''}`}>{currentlyActive ? 'Active' : exhausted ? 'Limit reached' : expired ? 'Expired' : scheduled ? 'Scheduled' : 'Inactive'}</span></div><button title="Remove coupon" aria-label={`Remove ${coupon.code}`} disabled={remove.isPending || !coupon.is_active} onClick={() => setCouponToRemove(coupon)}><Trash2 size={15} /></button></div>
          <strong className="vendor-coupon-discount">{coupon.discount_type === 'percentage' ? `${coupon.discount_value}% off` : `${money(coupon.discount_value)} off`}</strong>
          <p>{coupon.product_ids.map(id => productById.get(id)?.name ?? 'Catalog item').join(', ')}</p>
          <div className="vendor-coupon-details"><span><CalendarDays size={13} /> Through {new Date(coupon.expires_at).toLocaleDateString('en-IN')}</span>{coupon.min_order_paise !== undefined && <span>Min. {money(coupon.min_order_paise)}</span>}{coupon.usage_limit !== undefined && <span>Used {coupon.usage_count} / {coupon.usage_limit}</span>}</div>
        </article>})}
      </section>
    </div>
    {couponToRemove && <ConfirmActionModal title={`Remove coupon ${couponToRemove.code}?`} description="If this coupon has already been used, it will be deactivated and past order records will remain. Otherwise, it will be deleted." confirmLabel="Remove coupon" busy={remove.isPending} onCancel={() => setCouponToRemove(null)} onConfirm={() => { remove.mutate(couponToRemove.id); setCouponToRemove(null) }} />}
  </section>
}

export function Component() { return <VendorCouponsPage /> }
