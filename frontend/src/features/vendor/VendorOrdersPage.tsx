import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ChevronLeft, ChevronRight, ExternalLink, PackageCheck, RefreshCw, Truck, X } from 'lucide-react'
import { Link, Navigate } from 'react-router-dom'
import { client } from '../../api/client'
import type { AuthUser } from '../../api/auth-storage'
import { formatMoney } from '../../utils/format-money'
import { useDocumentTitle } from '../../utils/use-document-title'

type OrderStatus = 'placed' | 'packed' | 'shipped' | 'in_transit' | 'delivered' | 'cancelled'
type OrderItem = { product_id: string; product_name: string; sku: string; unit_price_paise: number; quantity: number; discount_paise: number; line_total_paise: number }
type Shipment = { id: string; carrier?: string; tracking_number: string; tracking_url?: string; shipped_at?: string; delivered_at?: string } | null
type VendorOrder = { id: string; order_id: string; status: OrderStatus; items: OrderItem[]; created_at: string; updated_at: string }
type OrderDetail = VendorOrder & { shipment: Shipment }
type PageData = { orders: VendorOrder[]; pagination: { page: number; limit: number; total: number; pages: number } }
type HistoryEvent = { id: string; previous_status: OrderStatus | null; new_status: OrderStatus; created_at: string }
const statusLabel = (status: OrderStatus) => status.replace('_', ' ')
const dateLabel = (date: string) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(date))
const nextStatuses: Partial<Record<OrderStatus, OrderStatus[]>> = { placed: ['packed', 'cancelled'], packed: ['shipped', 'cancelled'], shipped: ['in_transit'], in_transit: ['delivered'] }

export function VendorOrdersPage() {
  useDocumentTitle('Orders')
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const me = useQuery({ queryKey: ['auth', 'me'], queryFn: async () => (await client.get<AuthUser>('/me')).data, staleTime: 30_000, retry: false })
  const isVendor = me.data?.role === 'vendor' && me.data.status === 'active' && Boolean(me.data.vendor)
  const orders = useQuery({ queryKey: ['vendor-orders', me.data?.id, page], queryFn: async () => (await client.get<PageData>(`/vendor-orders?page=${page}&limit=20`)).data, enabled: isVendor, retry: false })
  const detail = useQuery({ queryKey: ['vendor-order', me.data?.id, selectedId], queryFn: async () => (await client.get<OrderDetail>(`/vendor-orders/${selectedId}`)).data, enabled: Boolean(isVendor && selectedId), retry: false })
  const history = useQuery({ queryKey: ['vendor-order-history', selectedId], queryFn: async () => (await client.get<{ history: HistoryEvent[] }>(`/vendor-orders/${selectedId}/history`)).data.history, enabled: Boolean(selectedId), retry: false })
  const refresh = async () => { await queryClient.invalidateQueries({ queryKey: ['vendor-orders', me.data?.id] }); await queryClient.invalidateQueries({ queryKey: ['vendor-order', me.data?.id, selectedId] }); await queryClient.invalidateQueries({ queryKey: ['vendor-order-history', selectedId] }) }
  const statusMutation = useMutation({ mutationFn: async (status: OrderStatus) => (await client.patch(`/vendor-orders/${selectedId}/status`, { status })).data, onSuccess: refresh, onError: () => setError('We couldn’t update this order. Please try again.') })
  const shipmentMutation = useMutation({ mutationFn: async (form: FormData) => {
    const payload = Object.fromEntries([...form.entries()].filter(([, value]) => String(value).trim()))
    const method = detail.data?.shipment ? 'patch' : 'post'
    return (await client[method](`/vendor-orders/${selectedId}/shipment`, payload)).data
  }, onSuccess: refresh, onError: () => setError('We couldn’t save the tracking details. Check the tracking link and try again.') })

  if (me.isPending) return <section className="vendor-products-page"><div className="vendor-products-loading skeleton" /></section>
  if (me.isError || !isVendor) return <Navigate to="/" replace />

  return <section className="vendor-products-page vendor-orders-page">
    <div className="vendor-products-top"><Link className="vendor-products-back" to="/vendor/dashboard"><ArrowLeft size={16} /> Seller dashboard</Link><span className="vendor-eyebrow">SELLER SPACE</span></div>
    <div className="vendor-products-heading"><div><h1>Orders</h1><p>Keep every order moving, from packing to delivery.</p></div><button className="button neutral" onClick={() => void orders.refetch()}><RefreshCw size={15} /> Refresh</button></div>
    {error && <div className="vendor-products-error" role="alert"><span>{error}</span><button aria-label="Dismiss error" onClick={() => setError('')}><X size={16} /></button></div>}
    {orders.isPending && <div className="vendor-products-loading skeleton" />}
    {orders.isError && <div className="vendor-products-empty" role="alert"><p>We couldn’t load your orders.</p><button className="button neutral" onClick={() => void orders.refetch()}><RefreshCw size={15} /> Try again</button></div>}
    {orders.data && <>
      <div className="vendor-orders-summary"><span><strong>{orders.data.pagination.total.toLocaleString('en-IN')}</strong> orders</span><span>Newest orders first</span></div>
      {orders.data.orders.length === 0 ? <div className="vendor-products-empty"><PackageCheck size={30} /><h2>Your orders will show up here</h2><p>When a customer orders from your store, you can manage it from this page.</p></div> : <div className="vendor-products-table-wrap"><table className="vendor-products-table vendor-orders-table"><thead><tr><th>Order</th><th>Items</th><th>Order total</th><th>Placed</th><th>Status</th><th><span className="visually-hidden">Details</span></th></tr></thead><tbody>{orders.data.orders.map(order => <tr key={order.id} onClick={() => { setError(''); setSelectedId(order.id) }}><td><strong>#{order.order_id}</strong></td><td>{order.items.reduce((count, item) => count + item.quantity, 0)} items<small>{order.items.slice(0, 2).map(item => item.product_name).join(', ')}{order.items.length > 2 ? ` +${order.items.length - 2} more` : ''}</small></td><td>{formatMoney(order.items.reduce((sum, item) => sum + item.line_total_paise, 0))}</td><td>{dateLabel(order.created_at)}</td><td><span className={`vendor-order-status ${order.status}`}>{statusLabel(order.status)}</span></td><td><button className="vendor-order-open" onClick={event => { event.stopPropagation(); setError(''); setSelectedId(order.id) }}>View details <ChevronRight size={15} /></button></td></tr>)}</tbody></table></div>}
      {orders.data.pagination.pages > 1 && <nav className="vendor-products-pagination" aria-label="Order pages"><button className="button neutral small" onClick={() => setPage(current => Math.max(1, current - 1))} disabled={page <= 1}><ChevronLeft size={15} /> Previous</button><span>Page {orders.data.pagination.page} of {orders.data.pagination.pages}</span><button className="button neutral small" onClick={() => setPage(current => Math.min(orders.data!.pagination.pages, current + 1))} disabled={page >= orders.data.pagination.pages}>Next <ChevronRight size={15} /></button></nav>}
    </>}
    {selectedId && <div className="vendor-order-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !statusMutation.isPending && !shipmentMutation.isPending) setSelectedId(null) }}><section className="vendor-order-drawer" role="dialog" aria-modal="true" aria-labelledby="vendor-order-title"><header className="vendor-order-drawer-head"><div><span className="vendor-eyebrow">ORDER DETAILS</span><h2 id="vendor-order-title">{detail.data ? `#${detail.data.order_id}` : 'Order'}</h2></div><button className="vendor-product-modal-close" aria-label="Close order details" onClick={() => setSelectedId(null)}><X size={19} /></button></header>
      {detail.isPending && <div className="vendor-order-content"><div className="vendor-products-loading skeleton" /></div>}
      {detail.isError && <div className="vendor-order-content vendor-products-empty"><p>We couldn’t load this order.</p><button className="button neutral" onClick={() => void detail.refetch()}><RefreshCw size={15} /> Try again</button></div>}
      {detail.data && <div className="vendor-order-content">
        <div className="vendor-order-detail-meta"><span className={`vendor-order-status ${detail.data.status}`}>{statusLabel(detail.data.status)}</span><span>Placed {dateLabel(detail.data.created_at)}</span></div>
        <section className="vendor-order-section"><h3>Items</h3>{detail.data.items.length === 0 ? <p className="vendor-order-muted">No item details were included with this order.</p> : <div className="vendor-order-items">{detail.data.items.map((item, index) => <div className="vendor-order-item" key={`${item.sku}-${index}`}><div><strong>{item.product_name}</strong><small>SKU {item.sku} · Qty {item.quantity} × {formatMoney(item.unit_price_paise)}</small></div><strong>{formatMoney(item.line_total_paise)}</strong></div>)}</div>}<div className="vendor-order-total"><span>Items total</span><strong>{formatMoney(detail.data.items.reduce((sum, item) => sum + item.line_total_paise, 0))}</strong></div></section>
        <section className="vendor-order-section"><h3>Order progress</h3><ol className="vendor-order-timeline">{history.data?.length ? history.data.map(event => <li key={event.id}><span className="vendor-order-timeline-dot" /><strong>{statusLabel(event.new_status)}</strong><time>{dateLabel(event.created_at)}</time></li>) : <li><span className="vendor-order-timeline-dot" /><strong>Order placed</strong><time>{dateLabel(detail.data.created_at)}</time></li>}</ol>
          {(nextStatuses[detail.data.status]?.length ?? 0) > 0 && <div className="vendor-order-status-actions">{nextStatuses[detail.data.status]!.map(status => <button className={status === 'cancelled' ? 'button neutral' : 'button primary'} key={status} disabled={statusMutation.isPending} onClick={() => { setError(''); statusMutation.mutate(status) }}>{statusMutation.isPending ? 'Updating…' : status === 'packed' ? 'Mark as packed' : status === 'shipped' ? 'Mark as shipped' : status === 'in_transit' ? 'Mark in transit' : status === 'delivered' ? 'Mark delivered' : 'Cancel order'}</button>)}</div>}</section>
        <section className="vendor-order-section"><h3><Truck size={17} /> {detail.data.shipment ? 'Tracking details' : 'Add tracking'}</h3>{detail.data.shipment && <div className="vendor-order-tracking"><div><span>Carrier</span><strong>{detail.data.shipment.carrier || 'Not specified'}</strong></div><div><span>Tracking number</span><strong>{detail.data.shipment.tracking_number}</strong></div>{detail.data.shipment.tracking_url && <a href={detail.data.shipment.tracking_url} target="_blank" rel="noreferrer">Open tracking page <ExternalLink size={14} /></a>}</div>}<form className="vendor-order-shipment-form" onSubmit={event => { event.preventDefault(); setError(''); shipmentMutation.mutate(new FormData(event.currentTarget)) }}><label className="vendor-field">Carrier<input name="carrier" maxLength={100} defaultValue={detail.data.shipment?.carrier ?? ''} placeholder="e.g. Blue Dart" /></label><label className="vendor-field">Tracking number<input name="tracking_number" maxLength={200} required defaultValue={detail.data.shipment?.tracking_number ?? ''} placeholder="Enter tracking number" /></label><label className="vendor-field">Tracking link<input name="tracking_url" type="url" defaultValue={detail.data.shipment?.tracking_url ?? ''} placeholder="https://…" /></label><button className="button primary" disabled={shipmentMutation.isPending}>{shipmentMutation.isPending ? 'Saving…' : detail.data.shipment ? 'Update tracking' : 'Save tracking'}</button></form></section>
      </div>}</section></div>}
  </section>
}

export function Component() { return <VendorOrdersPage /> }
