import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, BadgeCheck, Box, ChevronLeft, ChevronRight, ClipboardList, LayoutDashboard, LogOut, Plus, RefreshCw, ShieldCheck, Store, Users, X } from 'lucide-react'
import { Link, Navigate, NavLink, useParams } from 'react-router-dom'
import { client } from '../../api/client'
import type { AuthUser } from '../../api/auth-storage'
import { useDocumentTitle } from '../../utils/use-document-title'
import { formatMoney } from '../../utils/format-money'
import { useSignOut } from '../auth/hooks/useAuthLifecycle'

type Overview = { users: number; vendors: number; products: number; orders: number; paid_revenue_paise: number }
type Pagination = { page: number; limit: number; total: number; total_pages: number }
type Vendor = { id: string; user_id: string; display_name: string; name: string; kyc_status: string; created_at: string }
type Order = { id: string; user_id: string; total_paise: number; payment_status: string; status: string; created_at: string }
type Product = { id: string; vendor_id: string; name: string; sku: string; price: number; stock: number; status: string; created_at: string }
type Kyc = { vendor_id: string; status: string; address_proof_key: string; identity_proof_key: string; submitted_at: string; rejection_reason?: string }
type PageResponse<T> = { pagination: Pagination } & Record<string, T[]>
type Section = 'overview' | 'orders' | 'products' | 'vendors' | 'admins'

const sections: { id: Section; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'orders', label: 'Orders', icon: ClipboardList },
  { id: 'products', label: 'Products', icon: Box },
  { id: 'vendors', label: 'Vendors & KYC', icon: Store },
  { id: 'admins', label: 'Administrators', icon: Users },
]
const date = (value: string) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(value))
function errorMessage(error: unknown) {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const data = (error as { response?: { data?: { message?: string } } }).response?.data
    if (data?.message) return data.message
  }
  return 'We could not complete that request. Please try again.'
}

export function AdminDashboardPage() {
  const { section: rawSection } = useParams()
  const section: Section = sections.some(item => item.id === rawSection) ? rawSection as Section : 'overview'
  const queryClient = useQueryClient()
  const signOut = useSignOut()
  const [page, setPage] = useState(1)
  const [activeKyc, setActiveKyc] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [adminError, setAdminError] = useState('')
  const me = useQuery({ queryKey: ['auth', 'me'], queryFn: async () => (await client.get<AuthUser>('/me')).data, retry: false })
  const isAdmin = me.data?.role === 'admin' && me.data.status === 'active'
  useDocumentTitle(`${sections.find(item => item.id === section)?.label ?? 'Overview'} · Admin`)
  const overview = useQuery({ queryKey: ['admin', 'overview'], queryFn: async () => (await client.get<Overview>('/admin/analytics/overview')).data, enabled: isAdmin, staleTime: 30_000 })
  const rows = useQuery({
    queryKey: ['admin', section, page],
    enabled: isAdmin && ['orders', 'products', 'vendors', 'admins'].includes(section),
    queryFn: async () => {
      if (section === 'orders') return (await client.get<PageResponse<Order>>(`/admin/orders?page=${page}&limit=20`)).data
      if (section === 'products') return (await client.get<PageResponse<Product>>(`/admin/products?page=${page}&limit=20`)).data
      if (section === 'vendors') return (await client.get<PageResponse<Vendor>>(`/admin/vendors?page=${page}&limit=20`)).data
      const admins = (await client.get<AuthUser[]>('/admin/users?role=admin')).data
      return { users: admins, pagination: { page: 1, limit: admins.length || 1, total: admins.length, total_pages: 1 } }
    },
  })
  const kyc = useQuery({ queryKey: ['admin', 'kyc', activeKyc], queryFn: async () => (await client.get<Kyc>(`/admin/vendors/${activeKyc}/kyc`)).data, enabled: isAdmin && Boolean(activeKyc) })
  const review = useMutation({
    mutationFn: async ({ vendorId, status, rejection_reason }: { vendorId: string; status: 'verified' | 'rejected'; rejection_reason?: string }) => (await client.patch(`/admin/vendors/${vendorId}/verify`, { status, ...(rejection_reason ? { rejection_reason } : {}) })).data,
    onSuccess: async () => { setActiveKyc(null); setRejectReason(''); await Promise.all([queryClient.invalidateQueries({ queryKey: ['admin', 'vendors'] }), queryClient.invalidateQueries({ queryKey: ['admin', 'overview'] })]) },
  })
  const createAdmin = useMutation({
    mutationFn: async (body: { name: string; email: string; password: string }) => (await client.post('/admin/users/admin', body)).data,
    onSuccess: async () => { setAdminError(''); await queryClient.invalidateQueries({ queryKey: ['admin', 'admins'] }) },
    onError: error => setAdminError(errorMessage(error)),
  })

  if (me.isPending) return <div className="admin-loading"><span className="account-spinner" /> Checking administrator access…</div>
  if (!isAdmin) return <Navigate to="/" replace />

  const adminUser = me.data!
  const pendingVendors = ((((rows.data as Record<string, unknown> | undefined)?.vendors as Vendor[] | undefined) ?? [])).filter(vendor => vendor.kyc_status === 'pending')
  const tableRows = rows.data

  return <main className="admin-shell">
    <aside className="admin-sidebar">
      <Link to="/" className="admin-brand"><span className="wordmark">Marketly<span>.</span></span><small>ADMIN STUDIO</small></Link>
      <div className="admin-profile"><span><ShieldCheck size={17} /></span><div><strong>{adminUser.name}</strong><small>Administrator</small></div></div>
      <span className="admin-nav-label">WORKSPACE</span>
      <nav aria-label="Admin sections">{sections.map(item => <NavLink key={item.id} to={item.id === 'overview' ? '/admin' : `/admin/${item.id}`} end={item.id === 'overview'} className={({ isActive }) => `admin-nav-link ${isActive ? 'active' : ''}`}><item.icon size={17} />{item.label}{item.id === 'vendors' && pendingVendors.length > 0 && <span className="admin-nav-count">{pendingVendors.length}</span>}</NavLink>)}</nav>
      <div className="admin-sidebar-bottom"><Link to="/" className="admin-store-link"><ArrowRight size={15} /> View storefront</Link><button onClick={() => void signOut()}><LogOut size={15} /> Sign out</button></div>
    </aside>
    <section className="admin-main">
      <header className="admin-topbar"><div><span>Marketly / Administration</span><strong>{sections.find(item => item.id === section)?.label}</strong></div><span className="admin-secure"><BadgeCheck size={15} /> Secure admin session</span></header>
      <div className="admin-content">
        <div className="admin-page-heading"><div><span className="vendor-eyebrow">ADMINISTRATION</span><h1>{section === 'overview' ? 'Good to see you, ' + adminUser.name.split(' ')[0] : sections.find(item => item.id === section)?.label}</h1><p>{section === 'overview' ? 'Here’s what’s happening across your marketplace.' : section === 'vendors' ? 'Review seller applications and keep verification moving.' : section === 'admins' ? 'Manage trusted people with access to Marketly operations.' : `Review and manage marketplace ${section}.`}</p></div>{section === 'admins' && <a href="#add-admin" className="button primary"><Plus size={16} /> Add administrator</a>}</div>
        {section === 'overview' && <OverviewSection data={overview.data} isLoading={overview.isPending} error={overview.error} onRetry={() => void overview.refetch()} />}
        {section === 'orders' && <OrdersSection data={tableRows as PageResponse<Order> | undefined} loading={rows.isPending} error={rows.error} page={page} setPage={setPage} />}
        {section === 'products' && <ProductsSection data={tableRows as PageResponse<Product> | undefined} loading={rows.isPending} error={rows.error} page={page} setPage={setPage} />}
        {section === 'vendors' && <VendorsSection data={tableRows as PageResponse<Vendor> | undefined} loading={rows.isPending} error={rows.error} page={page} setPage={setPage} onReview={setActiveKyc} />}
        {section === 'admins' && <AdminsSection data={tableRows as PageResponse<AuthUser> | undefined} loading={rows.isPending} onCreate={data => createAdmin.mutate(data)} submitting={createAdmin.isPending} error={adminError} />}
      </div>
    </section>
    {activeKyc && <div className="admin-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !review.isPending) setActiveKyc(null) }}><section className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="kyc-title"><header><div><span className="vendor-eyebrow">SELLER VERIFICATION</span><h2 id="kyc-title">Review KYC submission</h2></div><button aria-label="Close dialog" onClick={() => setActiveKyc(null)}><X size={18} /></button></header>{kyc.isPending ? <p className="admin-muted">Loading submission…</p> : kyc.isError ? <p className="admin-error" role="alert">Could not load this KYC submission. {errorMessage(kyc.error)}</p> : kyc.data && <><p className="admin-modal-intro">Submitted {date(kyc.data.submitted_at)}. Open both documents and confirm they meet your verification requirements before approving.</p><div className="admin-document-list"><Document label="Address proof" objectKey={kyc.data.address_proof_key} vendorId={activeKyc} document="address" /><Document label="Identity proof" objectKey={kyc.data.identity_proof_key} vendorId={activeKyc} document="identity" /></div><label className="admin-field">Reason if you reject<textarea maxLength={500} rows={3} value={rejectReason} onChange={event => setRejectReason(event.target.value)} placeholder="Tell the seller what needs to be corrected" /></label>{review.error && <p className="admin-error" role="alert">{errorMessage(review.error)}</p>}<div className="admin-modal-actions"><button className="button neutral" onClick={() => { if (rejectReason.trim().length >= 3) review.mutate({ vendorId: activeKyc, status: 'rejected', rejection_reason: rejectReason.trim() }) }} disabled={review.isPending || rejectReason.trim().length < 3}>Reject</button><button className="button primary" onClick={() => review.mutate({ vendorId: activeKyc, status: 'verified' })} disabled={review.isPending}>Approve seller</button></div></>}</section></div>}
  </main>
}

function OverviewSection({ data, isLoading, error, onRetry }: { data?: Overview; isLoading: boolean; error: Error | null; onRetry: () => void }) {
  if (isLoading) return <div className="admin-stat-grid">{[0, 1, 2, 3].map(i => <div className="admin-stat skeleton" key={i} />)}</div>
  if (error || !data) return <div className="admin-panel admin-empty" role="alert"><p>We couldn’t load the marketplace overview.</p><button className="button neutral" onClick={onRetry}><RefreshCw size={15} /> Try again</button></div>
  const stats = [{ label: 'Total orders', value: data.orders.toLocaleString('en-IN'), icon: ClipboardList, note: 'Across the marketplace' }, { label: 'Active vendors', value: data.vendors.toLocaleString('en-IN'), icon: Store, note: 'Seller accounts' }, { label: 'Products', value: data.products.toLocaleString('en-IN'), icon: Box, note: 'In the catalog' }, { label: 'Paid revenue', value: formatMoney(data.paid_revenue_paise), icon: BadgeCheck, note: `${data.users.toLocaleString('en-IN')} registered accounts` }]
  return <><div className="admin-stat-grid">{stats.map(item => <article className="admin-stat" key={item.label}><span className="admin-stat-icon"><item.icon size={18} /></span><small>{item.label}</small><strong>{item.value}</strong><span>{item.note}</span></article>)}</div><section className="admin-panel admin-shortcuts"><div className="admin-panel-heading"><div><h2>Quick access</h2><p>Jump into the parts of your marketplace that need attention.</p></div></div><div className="admin-shortcut-grid"><Link to="/admin/orders"><ClipboardList /><span><strong>Review orders</strong><small>Check payment and fulfillment status</small></span><ChevronRight /></Link><Link to="/admin/products"><Box /><span><strong>Browse products</strong><small>Review catalog health and stock</small></span><ChevronRight /></Link><Link to="/admin/vendors"><Store /><span><strong>Verify sellers</strong><small>Review pending KYC applications</small></span><ChevronRight /></Link></div></section></>
}

function OrdersSection({ data, loading, error, page, setPage }: { data: PageResponse<Order> | undefined; loading: boolean; error: Error | null; page: number; setPage: (page: number) => void }) {
  return <DataPanel title="Recent orders" description="Order totals and payment state. Status changes remain available through the secured admin API." loading={loading} error={error} empty={!data?.orders.length} pagination={data?.pagination} page={page} setPage={setPage}><table><thead><tr><th>Order</th><th>Customer ID</th><th>Date</th><th>Payment</th><th>Status</th><th>Total</th></tr></thead><tbody>{data?.orders?.map(order => <tr key={order.id}><td className="admin-mono">#{order.id.slice(-8).toUpperCase()}</td><td className="admin-mono">{order.user_id.slice(-8)}</td><td>{date(order.created_at)}</td><td><Status value={order.payment_status} /></td><td><Status value={order.status} /></td><td>{formatMoney(order.total_paise)}</td></tr>)}</tbody></table></DataPanel>
}
function ProductsSection({ data, loading, error, page, setPage }: { data: PageResponse<Product> | undefined; loading: boolean; error: Error | null; page: number; setPage: (page: number) => void }) {
  return <DataPanel title="Marketplace catalog" description="Products from all sellers, including stock and publication state." loading={loading} error={error} empty={!data?.products.length} pagination={data?.pagination} page={page} setPage={setPage}><table><thead><tr><th>Product</th><th>SKU</th><th>Seller ID</th><th>Price</th><th>Stock</th><th>Status</th></tr></thead><tbody>{data?.products?.map(product => <tr key={product.id}><td><strong>{product.name}</strong><small className="admin-subline">Added {date(product.created_at)}</small></td><td className="admin-mono">{product.sku}</td><td className="admin-mono">{product.vendor_id.slice(-8)}</td><td>{formatMoney(product.price)}</td><td>{product.stock}</td><td><Status value={product.status} /></td></tr>)}</tbody></table></DataPanel>
}
function VendorsSection({ data, loading, error, page, setPage, onReview }: { data: PageResponse<Vendor> | undefined; loading: boolean; error: Error | null; page: number; setPage: (page: number) => void; onReview: (id: string) => void }) {
  return <DataPanel title="Seller applications" description="Review submitted business details and approve or reject pending identity checks." loading={loading} error={error} empty={!data?.vendors.length} pagination={data?.pagination} page={page} setPage={setPage}><table><thead><tr><th>Seller</th><th>Account ID</th><th>Submitted</th><th>Verification</th><th>Action</th></tr></thead><tbody>{data?.vendors?.map(vendor => <tr key={vendor.id}><td><strong>{vendor.display_name || vendor.name}</strong><small className="admin-subline">{vendor.name}</small></td><td className="admin-mono">{vendor.id.slice(-8)}</td><td>{date(vendor.created_at)}</td><td><Status value={vendor.kyc_status} /></td><td>{vendor.kyc_status === 'pending' ? <button className="admin-row-action" onClick={() => onReview(vendor.id)}>Review KYC <ChevronRight size={14} /></button> : <span className="admin-muted">—</span>}</td></tr>)}</tbody></table></DataPanel>
}
function AdminsSection({ data, loading, onCreate, submitting, error }: { data: (PageResponse<AuthUser> | undefined); loading: boolean; onCreate: (data: { name: string; email: string; password: string }) => void; submitting: boolean; error: string }) {
  return <><DataPanel title="Administrator access" description="Only active administrators can enter this workspace or provision new admin accounts." loading={loading} error={null} empty={!data?.users.length}><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Account state</th></tr></thead><tbody>{data?.users?.map(admin => <tr key={admin.id}><td><strong>{admin.name}</strong></td><td>{admin.email}</td><td><Status value="admin" /></td><td><Status value={admin.status} /></td></tr>)}</tbody></table></DataPanel><section id="add-admin" className="admin-panel admin-create-panel"><div className="admin-panel-heading"><div><h2>Add an administrator</h2><p>Create a separate account with full marketplace access.</p></div><span className="admin-create-icon"><ShieldCheck size={18} /></span></div><form onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); onCreate({ name: String(form.get('name')).trim(), email: String(form.get('email')).trim(), password: String(form.get('password')) }); event.currentTarget.reset() }}><label className="admin-field">Full name<input name="name" minLength={2} maxLength={100} autoComplete="name" required /></label><label className="admin-field">Email<input name="email" type="email" maxLength={254} autoComplete="email" required /></label><label className="admin-field">Password<input name="password" type="password" minLength={12} maxLength={128} autoComplete="new-password" required /><small>Use at least 12 characters and share it through a secure channel.</small></label>{error && <p className="admin-error" role="alert">{error}</p>}<button className="button primary" type="submit" disabled={submitting}>{submitting ? 'Creating account…' : <><Plus size={15} /> Create administrator</>}</button></form></section></>
}
function DataPanel({ title, description, loading, error, empty, pagination, page, setPage, children }: { title: string; description: string; loading: boolean; error: Error | null; empty: boolean; pagination?: Pagination; page?: number; setPage?: (page: number) => void; children: React.ReactNode }) {
  return <section className="admin-panel"><div className="admin-panel-heading"><div><h2>{title}</h2><p>{description}</p></div>{pagination && <span className="admin-total">{pagination.total.toLocaleString('en-IN')} records</span>}</div>{loading ? <div className="admin-table-loading skeleton" /> : error ? <div className="admin-empty" role="alert"><p>We couldn’t load this list.</p><span>{errorMessage(error)}</span></div> : empty ? <div className="admin-empty"><Store size={24} /><strong>Nothing here yet</strong><span>There are no records to show.</span></div> : <><div className="admin-table-wrap">{children}</div>{pagination && page && setPage && pagination.total_pages > 1 && <div className="admin-pagination"><span>Page {page} of {pagination.total_pages}</span><div><button aria-label="Previous page" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft size={16} /></button><button aria-label="Next page" disabled={page >= pagination.total_pages} onClick={() => setPage(page + 1)}><ChevronRight size={16} /></button></div></div>}</>}</section>
}
function Status({ value }: { value: string }) { return <span className={`admin-status ${value.toLowerCase().replaceAll('_', '-')}`}>{value.replaceAll('_', ' ')}</span> }
function Document({ label, objectKey, vendorId, document }: { label: string; objectKey: string; vendorId: string; document: 'address' | 'identity' }) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  async function openDocument() {
    setLoading(true); setError('')
    try { const { data } = await client.get<{ url: string }>(`/admin/vendors/${vendorId}/kyc/documents/${document}/access`); setUrl(data.url) }
    catch (cause) { setError(errorMessage(cause)) }
    finally { setLoading(false) }
  }
  return <div className="admin-document"><span><BadgeCheck size={17} /></span><div><strong>{label}</strong><small>{objectKey.split('/').pop()}</small>{url ? <a href={url} target="_blank" rel="noopener noreferrer">Open document</a> : <button type="button" onClick={() => void openDocument()} disabled={loading}>{loading ? 'Preparing…' : 'Get secure preview'}</button>}{error && <small className="admin-error">{error}</small>}</div></div>
}

export function Component() { return <AdminDashboardPage /> }
