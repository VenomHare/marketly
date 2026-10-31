import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { ArrowRight, ChevronLeft, ChevronRight, CircleHelp, Clock3, PackageCheck, RotateCcw, ShoppingBag, Truck, UserRound } from 'lucide-react'
import { client } from '../../api/client'
import { useAuthLifecycle } from '../auth/hooks/useAuthLifecycle'
import { formatMoney } from '../../utils/format-money'
import { getImageUrl } from '../../utils/image-url'
import { useDocumentTitle } from '../../utils/use-document-title'

type Order = { id: string; status: string; fulfillment_status?: string; payment_status: string; subtotal_paise: number; discount_paise: number; shipping_paise: number; total_paise: number; created_at: string }
type OrdersResponse = { orders: Order[]; pagination: { page: number; limit: number; total: number; total_pages: number } }
type OrderDetail = { order: Order & { address_snapshot: { addressee_name?: string; first_line?: string; second_line?: string; city?: string; state?: string; postal_code?: string; country?: string } }; items: Array<{ id: string; product_id: string; product_name: string; image_key?: string | null; image_alt?: string; can_review?: boolean; sku: string; unit_price_paise: number; quantity: number; discount_paise: number; line_total_paise: number }>; payment: { provider: string; status: string; amount_paise: number; currency: string } | null }
type Tracking = { order_id: string; order_status: string; vendor_orders: Array<{ id: string; status: string; shipments: Array<{ carrier: string; tracking_number: string; tracking_url: string }>; status_history: Array<{ new_status: string; previous_status: string | null; created_at?: string }> }> }

const statusLabel = (status: string) => status.replaceAll('_', ' ')
const dateLabel = (value: string) => new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value))

export function AccountPage() {
  useDocumentTitle('Your account')
  const { isLoading, isAuthenticated, user } = useAuthLifecycle()
  const location = useLocation()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [openOrder, setOpenOrder] = useState<string | null>(null)
  const [returnReason, setReturnReason] = useState('')
  const [actionMessage, setActionMessage] = useState('')
  const orders = useQuery({ queryKey: ['orders', page], queryFn: async () => (await client.get<OrdersResponse>(`/orders?page=${page}&limit=10`)).data, enabled: isAuthenticated && user?.role === 'customer' })
  const detail = useQuery({ queryKey: ['order', openOrder], queryFn: async () => (await client.get<OrderDetail>(`/orders/${openOrder}`)).data, enabled: Boolean(openOrder) && isAuthenticated })
  const tracking = useQuery({ queryKey: ['order-tracking', openOrder], queryFn: async () => (await client.get<Tracking>(`/orders/${openOrder}/tracking`)).data, enabled: Boolean(openOrder) && isAuthenticated })
  const cancel = useMutation({ mutationFn: async (id: string) => (await client.post<{ refund_requested?: boolean }>(`/orders/${id}/cancel`, {})).data, onSuccess: async result => { setActionMessage(result.refund_requested ? 'Order cancelled. Your refund request is awaiting review.' : 'Order cancelled.'); await queryClient.invalidateQueries({ queryKey: ['orders'] }); await queryClient.invalidateQueries({ queryKey: ['order', openOrder] }) }, onError: error => setActionMessage(error instanceof Error ? error.message : 'Could not cancel this order.') })
  const requestRefund = useMutation({ mutationFn: async ({ id, reason }: { id: string; reason: string }) => (await client.post(`/orders/${id}/refund`, { reason })).data, onSuccess: async () => { setActionMessage('Refund request sent. Our team will review it.'); setReturnReason(''); await queryClient.invalidateQueries({ queryKey: ['orders'] }) }, onError: error => setActionMessage(error instanceof Error ? error.message : 'Could not request a refund.') })

  if (isLoading) return <div className="account-page"><div className="account-loading">Loading your account…</div></div>
  if (!isAuthenticated) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />
  if (user?.role !== 'customer') return <Navigate to={user?.role === 'vendor' ? '/vendor/dashboard' : '/'} replace />

  const orderList = orders.data?.orders ?? []
  const activeTab = location.pathname.endsWith('/orders') ? 'orders' : 'overview'

  return <div className="account-page">
    <div className="account-breadcrumb"><Link to="/">Home</Link><span>/</span><span>Your account</span></div>
    <header className="account-heading"><div className="account-avatar"><UserRound size={24} /></div><div><h1>Hello, {user.name.split(' ')[0]}</h1><p>Keep track of your orders and the little details.</p></div></header>
    <div className="account-layout">
      <aside className="account-rail"><div className="account-person"><span className="account-person-icon"><UserRound size={18} /></span><div><strong>{user.name}</strong><small>{user.email}</small></div></div><span className="account-rail-label">YOUR ACCOUNT</span><Link className={activeTab === 'overview' ? 'active' : ''} to="/account"><UserRound size={16} /> Overview</Link><Link className={activeTab === 'orders' ? 'active' : ''} to="/account/orders"><PackageCheck size={16} /> Orders <span>{orders.data?.pagination.total ?? ''}</span></Link><div className="account-help"><CircleHelp size={18} /><strong>Need a hand?</strong><span>We’re here if you need help with an order.</span><a href="mailto:support@marketly.com">Contact support <ArrowRight size={13} /></a></div></aside>
      <section className="account-content">
        <div className={`account-section-heading ${activeTab === 'overview' ? 'overview' : ''}`}><div><span className="account-eyebrow">{activeTab === 'orders' ? 'YOUR PURCHASES' : 'RECENT ACTIVITY'}</span><h2>{activeTab === 'orders' ? 'Order history' : 'Recent orders'}</h2></div>{activeTab === 'overview' && <Link to="/account/orders">All orders <ArrowRight size={15} /></Link>}</div>
        {orders.isPending ? <div className="account-empty"><span className="account-spinner" />Loading your orders…</div> : orders.isError ? <div className="account-empty account-error"><strong>Your orders didn’t load.</strong><span>{orders.error instanceof Error ? orders.error.message : 'Please try again.'}</span><button className="button neutral" onClick={() => void orders.refetch()}>Try again</button></div> : orderList.length === 0 ? <div className="account-empty"><span className="account-empty-icon"><ShoppingBag size={24} /></span><h3>Your next good find starts here.</h3><p>When you place an order, its updates will show up here.</p><Link className="button primary" to="/search">Explore the shop <ArrowRight size={15} /></Link></div> : <div className="account-orders">{orderList.map(order => <article className={`account-order ${openOrder === order.id ? 'expanded' : ''}`} key={order.id}>
          <button className="account-order-top" onClick={() => { const closing = openOrder === order.id; setOpenOrder(closing ? null : order.id); setActionMessage(''); if (!closing) void orders.refetch() }} aria-expanded={openOrder === order.id}><span className="account-order-mark"><PackageCheck size={19} /></span><span className="account-order-meta"><small>ORDER PLACED <b>{dateLabel(order.created_at)}</b></small><small>ORDER <b className="account-order-id">{order.id.slice(-8).toUpperCase()}</b></small></span><span className={`account-status status-${order.fulfillment_status ?? order.status}`}>{statusLabel(order.fulfillment_status ?? order.status)}</span><span className="account-order-total">{formatMoney(order.total_paise)}<small>{order.payment_status === 'paid' ? 'Paid' : statusLabel(order.payment_status)}</small></span><ChevronRight className="account-order-chevron" size={17} /></button>
          {openOrder === order.id && <div className="account-order-detail">
            {detail.isPending ? <p className="account-detail-loading">Loading order details…</p> : detail.isError ? <p className="account-error">Could not load order details. <button onClick={() => void detail.refetch()}>Try again</button></p> : detail.data && <>
              <div className="account-detail-grid"><div><h3><ShoppingBag size={15} /> Items</h3>{detail.data.items.length ? detail.data.items.map(item => <div className="account-line-item" key={item.id}><span className="account-order-product-cell"><Link className="account-order-product-link" to={`/product/${item.product_id}`}><span className="account-order-product-thumb">{item.image_key && getImageUrl(item.image_key) ? <img src={getImageUrl(item.image_key)} alt={item.image_alt || item.product_name} /> : <ShoppingBag size={17} />}</span><span>{item.product_name}<small>Qty {item.quantity} · {formatMoney(item.unit_price_paise)} each</small></span></Link>{item.can_review && <Link className="account-write-review" to={`/product/${item.product_id}#reviews`}>Write a review</Link>}</span><strong>{formatMoney(item.line_total_paise)}</strong></div>) : <p className="account-muted">No item details available.</p>}</div><div><h3><Truck size={15} /> Delivery</h3>{detail.data.order.address_snapshot ? <p>{detail.data.order.address_snapshot.addressee_name}<br />{detail.data.order.address_snapshot.first_line}{detail.data.order.address_snapshot.second_line ? `, ${detail.data.order.address_snapshot.second_line}` : ''}<br />{[detail.data.order.address_snapshot.city, detail.data.order.address_snapshot.state, detail.data.order.address_snapshot.postal_code, detail.data.order.address_snapshot.country].filter(Boolean).join(', ')}</p> : <p className="account-muted">Delivery address unavailable.</p>}
                {tracking.data?.vendor_orders.map(vendorOrder => <div className="account-tracking" key={vendorOrder.id}><strong><Clock3 size={13} /> {statusLabel(vendorOrder.status)}</strong>{vendorOrder.shipments.map(shipment => <a key={shipment.tracking_number} href={shipment.tracking_url} target="_blank" rel="noreferrer">{shipment.carrier} · {shipment.tracking_number} <ArrowRight size={12} /></a>)}</div>)}{tracking.isError && <button className="account-inline-button" onClick={() => void tracking.refetch()}>Retry tracking details</button>}</div></div>
              <div className="account-order-footer"><div className="account-totals"><span>Subtotal <b>{formatMoney(detail.data.order.subtotal_paise)}</b></span><span>Discount <b>−{formatMoney(detail.data.order.discount_paise)}</b></span><strong>Total <b>{formatMoney(detail.data.order.total_paise)}</b></strong></div><div className="account-order-actions">{((order.status === 'pending' && order.payment_status !== 'paid') || (order.status === 'placed' && order.payment_status === 'paid' && ['placed', 'packed'].includes(order.fulfillment_status ?? 'placed'))) && <button className="button neutral" disabled={cancel.isPending} onClick={() => { setActionMessage(''); cancel.mutate(order.id) }}>Cancel order</button>}{order.payment_status === 'paid' && (order.status === 'completed' || order.fulfillment_status === 'delivered') && <form onSubmit={event => { event.preventDefault(); setActionMessage(''); requestRefund.mutate({ id: order.id, reason: returnReason }) }}><input aria-label="Refund reason" required maxLength={1000} placeholder="Why are you requesting a refund?" value={returnReason} onChange={event => setReturnReason(event.target.value)} /><button className="button neutral" disabled={requestRefund.isPending}><RotateCcw size={14} /> Request refund</button></form>}</div></div>
              {actionMessage && <p className={`account-action-message ${cancel.isError || requestRefund.isError ? 'error' : ''}`} role="status">{actionMessage}</p>}
            </>}
          </div>}
        </article>)}</div>}
        {orders.data && orders.data.pagination.total_pages > 1 && <nav className="account-pagination" aria-label="Order pages"><button disabled={page <= 1} onClick={() => setPage(value => Math.max(1, value - 1))}><ChevronLeft size={16} /> Previous</button><span>Page {page} of {orders.data.pagination.total_pages}</span><button disabled={page >= orders.data.pagination.total_pages} onClick={() => setPage(value => Math.min(orders.data!.pagination.total_pages, value + 1))}>Next <ChevronRight size={16} /></button></nav>}
        <div className="account-shopping-nudge"><span><RotateCcw size={17} /></span><div><strong>Looking for something new?</strong><small>Discover thoughtful finds from independent sellers.</small></div><Link to="/search">Browse Marketly <ArrowRight size={14} /></Link></div>
      </section>
    </div>
  </div>
}

export function Component() { return <AccountPage /> }
