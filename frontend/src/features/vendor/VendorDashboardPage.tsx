import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Box, CircleDollarSign, ClipboardList, CreditCard, FileCheck2, PackageCheck, RefreshCw } from 'lucide-react'
import { Link, Navigate } from 'react-router-dom'
import { client } from '../../api/client'
import type { AuthUser } from '../../api/auth-storage'
import { useDocumentTitle } from '../../utils/use-document-title'

type VendorDashboard = {
  active_products: number
  total_orders: number
  open_orders: number
  gross_sales_paise: number
  refund_paise: number
  net_earnings_paise: number
  pending_payout_paise: number
}

type VendorKycStatus = { status: 'not_submitted' | 'pending' | 'rejected' | 'verified'; rejection_reason?: string }

const money = (paise: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(paise / 100)

export function VendorDashboardPage() {
  useDocumentTitle('Seller dashboard')
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
    queryFn: async () => (await client.get<VendorKycStatus>('/vendors/me/kyc')).data,
    enabled: isVendor,
    staleTime: 30_000,
    retry: false,
  })
  const dashboard = useQuery({
    queryKey: ['vendor', 'dashboard', me.data?.id],
    queryFn: async () => (await client.get<VendorDashboard>('/vendors/me/dashboard')).data,
    enabled: isVendor,
    staleTime: 30_000,
    retry: 1,
  })

  if (me.isPending) return <DashboardLoading />
  if (me.isError || !isVendor) return <Navigate to="/" replace />

  return <section className="vendor-dashboard">
    <div className="vendor-dashboard-head">
      <div><span className="vendor-eyebrow">SELLER SPACE</span><h1>Welcome, {me.data.vendor?.display_name || me.data.name}</h1><p>Your store overview and performance at a glance.</p></div>
      <div className="vendor-dashboard-actions"><Link className="button neutral" to="/vendor/products">Manage products <ArrowRight size={15} /></Link><a className="button primary" href="/vendor/orders">View orders</a></div>
    </div>
    {kyc.data && kyc.data.status !== 'verified' && <KycNotice status={kyc.data.status} rejectionReason={kyc.data.rejection_reason} />}
    {kyc.isError && me.data.vendor?.kyc_status !== 'verified' && <KycNotice status={me.data.vendor?.kyc_status === 'rejected' ? 'rejected' : 'not_submitted'} />}
    {dashboard.isPending && <DashboardMetricSkeleton />}
    {dashboard.isError && <div className="vendor-dashboard-error" role="alert"><p>We couldn’t load your dashboard right now.</p><button className="button neutral" onClick={() => void dashboard.refetch()}><RefreshCw size={15} /> Retry</button></div>}
    {dashboard.data && <>
      <div className="vendor-metric-grid">
        <Metric icon={<Box size={19} />} label="Active products" value={dashboard.data.active_products.toLocaleString('en-IN')} />
        <Metric icon={<ClipboardList size={19} />} label="Total orders" value={dashboard.data.total_orders.toLocaleString('en-IN')} />
        <Metric icon={<PackageCheck size={19} />} label="Open orders" value={dashboard.data.open_orders.toLocaleString('en-IN')} />
        <Metric icon={<CircleDollarSign size={19} />} label="Gross sales" value={money(dashboard.data.gross_sales_paise)} />
      </div>
      <div className="vendor-finance-panel">
        <div className="finance-heading"><div><span className="vendor-eyebrow">PAYOUT SUMMARY</span><h2>Your earnings</h2></div><CreditCard size={21} /></div>
        <div className="finance-grid">
          <FinanceMetric label="Net earnings" value={money(dashboard.data.net_earnings_paise)} />
          <FinanceMetric label="Pending payout" value={money(dashboard.data.pending_payout_paise)} />
          <FinanceMetric label="Refunds" value={money(dashboard.data.refund_paise)} />
        </div>
      </div>
      <div className="vendor-dashboard-footnote">Sales and payout totals are shown in Indian rupees.</div>
    </>}
  </section>
}

export function Component() {
  return <VendorDashboardPage />
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <article className="vendor-metric"><span className="metric-icon">{icon}</span><span className="metric-label">{label}</span><strong>{value}</strong></article>
}

function FinanceMetric({ label, value }: { label: string; value: string }) {
  return <div className="finance-metric"><span>{label}</span><strong>{value}</strong></div>
}

function KycNotice({ status, rejectionReason }: { status: Exclude<VendorKycStatus['status'], 'verified'>; rejectionReason?: string }) {
  const isPending = status === 'pending'
  const isRejected = status === 'rejected'
  return <section className={`vendor-kyc-hero ${isPending ? 'pending' : ''}`}>
    <span className="vendor-kyc-hero-icon"><FileCheck2 size={22} /></span>
    <div className="vendor-kyc-hero-copy">
      <span className="vendor-eyebrow">SELLER VERIFICATION</span>
      <h2>{isPending ? 'Your documents are under review' : isRejected ? 'A quick update is needed' : 'Finish setting up your seller account'}</h2>
      <p>{isPending ? 'We have your documents and our team is reviewing them. We’ll update your account as soon as the review is complete.' : isRejected ? rejectionReason || 'Please submit clear address and identity documents so we can review your store.' : 'Submit proof of your business address and identity to unlock product publishing and image uploads.'}</p>
    </div>
    {isPending ? <span className="vendor-kyc-review-pill">Under review</span> : <Link className="button primary" to="/vendor/kyc">{isRejected ? 'Update documents' : 'Submit KYC'} <ArrowRight size={15} /></Link>}
  </section>
}

function DashboardLoading() {
  return <section className="vendor-dashboard" aria-label="Verifying your seller account"><div className="vendor-dashboard-head"><div><div className="skeleton vendor-skeleton-title" /><div className="skeleton vendor-skeleton-line" /></div></div><DashboardMetricSkeleton /></section>
}

function DashboardMetricSkeleton() {
  return <div className="vendor-metric-grid">{Array.from({ length: 4 }, (_, index) => <div className="vendor-metric-skeleton" key={index}><div className="skeleton" /><div className="skeleton" /><div className="skeleton" /></div>)}</div>
}
