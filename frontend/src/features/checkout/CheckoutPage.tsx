import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ChevronLeft, CreditCard, LockKeyhole, MapPin, Plus, ShieldCheck, Tag, Truck, X } from 'lucide-react'
import { Link, Navigate } from 'react-router-dom'
import { client } from '../../api/client'
import { ErrorState } from '../../components/ui/ErrorState'
import { useAuth } from '../auth/hooks/useAuthLifecycle'
import { formatMoney } from '../../utils/format-money'
import { useDocumentTitle } from '../../utils/use-document-title'

type Address = { id: string; label: string; first_line: string; second_line?: string; postal_code: string; city: string; state: string; country: string; addressee_name: string; contact_number: string }
type AddressList = { addresses: Address[] }
type Cart = { cart: { id: string } | null; items: Array<{ id: string; product_id: string; quantity: number }> }
type Preview = { valid: boolean; items: Array<{ product_id: string; name: string | null; quantity: number; available: boolean; reason: string | null; unit_price_paise: number | null; line_total_paise: number | null }>; subtotal_paise: number; discount_paise: number; shipping_paise: number; total_paise: number; coupon: { code: string; valid: boolean; message?: string } | null }
type OrderResult = { order: { id: string; status: string; total_paise: number }; payment: { id: string; status: string; amount_paise: number } }
type RazorpayOrder = { payment: { id: string }; razorpay: { key_id?: string; order_id: string; amount: number; currency: string } }
type RazorpaySuccess = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }
type RazorpayOptions = { key: string; order_id: string; amount: number; currency: string; name: string; description: string; handler: (response: RazorpaySuccess) => void; modal: { ondismiss: () => void }; prefill?: { name?: string; email?: string; contact?: string }; theme: { color: string } }
type RazorpayInstance = { open: () => void }
declare global { interface Window { Razorpay?: new (options: RazorpayOptions) => RazorpayInstance } }

const emptyAddress = { label: 'Home', first_line: '', second_line: '', postal_code: '', city: '', state: '', country: 'India', addressee_name: '', contact_number: '' }

export function CheckoutPage() {
  useDocumentTitle('Checkout')
  const { user, isAuthenticated, isLoading: authLoading } = useAuth()
  const queryClient = useQueryClient()
  const [selectedAddress, setSelectedAddress] = useState('')
  const [showAddressForm, setShowAddressForm] = useState(false)
  const [addressFields, setAddressFields] = useState(emptyAddress)
  const [addressError, setAddressError] = useState('')
  const [couponInput, setCouponInput] = useState('')
  const [couponCode, setCouponCode] = useState('')
  const [checkoutError, setCheckoutError] = useState('')
  const [order, setOrder] = useState<OrderResult | null>(null)
  const [paymentComplete, setPaymentComplete] = useState(false)
  const [paymentPending, setPaymentPending] = useState(false)
  const idempotencyKey = useRef(crypto.randomUUID())

  const addresses = useQuery({ queryKey: ['addresses'], queryFn: async () => (await client.get<AddressList>('/addresses')).data, enabled: isAuthenticated && user?.role === 'customer' })
  const cart = useQuery({ queryKey: ['cart', 'mine'], queryFn: async () => (await client.get<Cart>('/cart/mine')).data, enabled: isAuthenticated && user?.role === 'customer' })
  const preview = useQuery({
    queryKey: ['checkout-preview', cart.data?.cart?.id, couponCode],
    queryFn: async () => (await client.post<Preview>('/checkout/preview', { cart_id: cart.data!.cart!.id, ...(couponCode ? { coupon_code: couponCode } : {}) })).data,
    enabled: Boolean(cart.data?.cart?.id) && !order,
    retry: false,
  })
  const addAddress = useMutation({ mutationFn: async (fields: typeof emptyAddress) => (await client.post<{ address: Address }>('/addresses', { ...fields, ...(fields.second_line.trim() ? { second_line: fields.second_line.trim() } : {}) })).data.address, onSuccess: async address => { await queryClient.invalidateQueries({ queryKey: ['addresses'] }); setSelectedAddress(address.id); setShowAddressForm(false); setAddressFields(emptyAddress); setAddressError('') } })

  useEffect(() => { if (!selectedAddress && addresses.data?.addresses[0]) setSelectedAddress(addresses.data.addresses[0].id) }, [addresses.data, selectedAddress])

  async function startPayment(paymentId: string, prefillAddress?: Address) {
    setPaymentPending(true)
    setCheckoutError('')
    try {
      const { data } = await client.post<RazorpayOrder>('/payments/create', { payment_id: paymentId })
      if (!data.razorpay.key_id) throw new Error('Online payment is not configured yet. Please contact support.')
      if (!window.Razorpay) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script')
          script.src = 'https://checkout.razorpay.com/v1/checkout.js'
          script.onload = () => resolve()
          script.onerror = () => reject(new Error('Payment window could not be loaded. Please try again.'))
          document.body.appendChild(script)
        })
      }
      if (!window.Razorpay) throw new Error('Payment window is unavailable.')
      const paymentWindow = new window.Razorpay({
        key: data.razorpay.key_id,
        order_id: data.razorpay.order_id,
        amount: data.razorpay.amount,
        currency: data.razorpay.currency,
        name: 'Marketly',
        description: 'Secure order payment',
        prefill: prefillAddress ? { name: prefillAddress.addressee_name, contact: prefillAddress.contact_number } : undefined,
        theme: { color: '#2F6BFF' },
        modal: { ondismiss: () => { setPaymentPending(false); setCheckoutError('Payment was not completed. You can retry securely below.') } },
        handler: async response => {
          try {
            await client.post(`/payments/${paymentId}/verify`, response)
            setPaymentComplete(true)
            setPaymentPending(false)
            await queryClient.invalidateQueries({ queryKey: ['cart'] })
          } catch (error) {
            setCheckoutError(error instanceof Error ? error.message : 'Payment verification failed. Please contact support before retrying.')
            setPaymentPending(false)
          }
        },
      })
      paymentWindow.open()
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : 'Could not start payment. Please try again.')
      setPaymentPending(false)
    }
  }

  async function placeOrder() {
    if (!cart.data?.cart?.id || !selectedAddress) return
    setCheckoutError('')
    setPaymentPending(true)
    try {
      const { data } = await client.post<OrderResult>('/checkout', { cart_id: cart.data.cart.id, address_id: selectedAddress, idempotency_key: idempotencyKey.current, ...(couponCode ? { coupon_code: couponCode } : {}) })
      setOrder(data)
      await queryClient.invalidateQueries({ queryKey: ['cart'] })
      const address = addresses.data?.addresses.find(item => item.id === selectedAddress)
      await startPayment(data.payment.id, address)
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : 'We could not place the order. Please review your details and try again.')
      setPaymentPending(false)
    }
  }

  function submitAddress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAddressError('')
    addAddress.mutate(addressFields, { onError: error => setAddressError(error instanceof Error ? error.message : 'Could not save this address.') })
  }

  if (authLoading) return <div className="checkout-page"><div className="state-box">Preparing secure checkout…</div></div>
  if (!isAuthenticated) return <Navigate to="/login?next=%2Fcheckout" replace />
  if (user?.role !== 'customer') return <div className="checkout-page"><ErrorState message="Checkout is available to customer accounts." onRetry={() => window.location.assign('/')} /></div>
  if (cart.data && !cart.data.items.length) return <Navigate to="/cart" replace />
  if (paymentComplete && order) return <div className="checkout-page"><section className="checkout-success"><span className="checkout-success-icon"><Check size={28} /></span><span className="checkout-eyebrow">PAYMENT CONFIRMED</span><h1>Thank you for your order</h1><p>Your payment was received and your order is on its way to processing.</p><div><span>Order reference</span><strong>{order.order.id}</strong></div><Link className="button primary" to="/search">Continue shopping</Link><Link className="checkout-secondary-link" to="/">Return to home</Link></section></div>

  return <div className="checkout-page">
    <Link className="checkout-back" to="/cart"><ChevronLeft size={17} /> Back to cart</Link>
    <header className="checkout-heading"><div><span className="checkout-eyebrow">ALMOST YOURS</span><h1>Checkout</h1><p>Confirm delivery details and pay securely to place your order.</p></div><span className="checkout-security"><LockKeyhole size={15} /> Secure checkout</span></header>
    {(addresses.isError || cart.isError) && <ErrorState message={addresses.error?.message || cart.error?.message || 'Unable to load checkout.'} onRetry={() => { void addresses.refetch(); void cart.refetch() }} />}
    <div className="checkout-layout">
      <div className="checkout-main-column">
        <section className="checkout-card"><div className="checkout-section-title"><span>01</span><div><h2>Delivery address</h2><p>Choose where you’d like this order delivered.</p></div></div>
          {addresses.isPending ? <p className="muted">Loading your saved addresses…</p> : addresses.data?.addresses.length ? <div className="checkout-address-list">{addresses.data.addresses.map(address => <label className={`checkout-address-option ${selectedAddress === address.id ? 'selected' : ''}`} key={address.id}><input type="radio" name="address" checked={selectedAddress === address.id} onChange={() => setSelectedAddress(address.id)} /><span className="checkout-address-icon"><MapPin size={17} /></span><span><strong>{address.label}</strong><small>{address.addressee_name} · {address.contact_number}</small><small>{address.first_line}{address.second_line ? `, ${address.second_line}` : ''}, {address.city}, {address.state} {address.postal_code}</small></span></label>)}</div> : <p className="checkout-no-address">Add a delivery address to continue.</p>}
          {!showAddressForm ? <button className="checkout-add-address" type="button" onClick={() => setShowAddressForm(true)}><Plus size={16} /> Add a new address</button> : <form className="checkout-address-form" onSubmit={submitAddress}><div className="checkout-address-form-title"><strong>New delivery address</strong><button type="button" aria-label="Cancel adding address" onClick={() => { setShowAddressForm(false); setAddressError('') }}><X size={17} /></button></div><div className="checkout-address-fields"><label>Address label<input required maxLength={50} value={addressFields.label} onChange={event => setAddressFields({ ...addressFields, label: event.target.value })} /></label><label>Full name<input required maxLength={100} value={addressFields.addressee_name} onChange={event => setAddressFields({ ...addressFields, addressee_name: event.target.value })} /></label><label className="wide">Address line 1<input required maxLength={200} value={addressFields.first_line} onChange={event => setAddressFields({ ...addressFields, first_line: event.target.value })} /></label><label className="wide">Address line 2 <span>(optional)</span><input maxLength={200} value={addressFields.second_line} onChange={event => setAddressFields({ ...addressFields, second_line: event.target.value })} /></label><label>Postal code<input required maxLength={32} value={addressFields.postal_code} onChange={event => setAddressFields({ ...addressFields, postal_code: event.target.value })} /></label><label>City<input required maxLength={100} value={addressFields.city} onChange={event => setAddressFields({ ...addressFields, city: event.target.value })} /></label><label>State<input required maxLength={100} value={addressFields.state} onChange={event => setAddressFields({ ...addressFields, state: event.target.value })} /></label><label>Country<input required maxLength={100} value={addressFields.country} onChange={event => setAddressFields({ ...addressFields, country: event.target.value })} /></label><label className="wide">Phone number<input required maxLength={32} type="tel" value={addressFields.contact_number} onChange={event => setAddressFields({ ...addressFields, contact_number: event.target.value })} /></label></div>{addressError && <p className="checkout-error" role="alert">{addressError}</p>}<button className="button primary" type="submit" disabled={addAddress.isPending}>{addAddress.isPending ? 'Saving address…' : 'Save this address'}</button></form>}
        </section>
        <section className="checkout-card checkout-payment-note"><div className="checkout-section-title"><span>02</span><div><h2>Payment</h2><p>Pay online through Razorpay’s secure payment window.</p></div></div><div className="checkout-payment-method"><span><CreditCard size={19} /></span><div><strong>Credit / debit card, UPI, or netbanking</strong><small>Payment details are handled securely by Razorpay.</small></div><ShieldCheck size={19} /></div></section>
      </div>
      <aside className="checkout-summary"><h2>Order summary</h2>
        {preview.isPending && <p className="muted">Updating totals…</p>}
        {preview.data?.items.map(item => <div className="checkout-summary-item" key={item.product_id}><span>{item.name || 'Unavailable item'} <small>× {item.quantity}</small></span><strong>{item.line_total_paise === null ? 'Unavailable' : formatMoney(item.line_total_paise)}</strong></div>)}
        <form className="checkout-coupon" onSubmit={event => { event.preventDefault(); setCouponCode(couponInput.trim()) }}><label htmlFor="checkout-coupon"><Tag size={15} /> Promo code</label><div><input id="checkout-coupon" placeholder="Enter code" value={couponInput} onChange={event => setCouponInput(event.target.value)} /><button type="submit">Apply</button></div>{preview.data?.coupon && <small className={preview.data.coupon.valid ? 'coupon-success' : 'coupon-error'}>{preview.data.coupon.valid ? `Code ${preview.data.coupon.code} applied` : preview.data.coupon.message}</small>}</form>
        <div className="checkout-totals"><div><span>Subtotal</span><strong>{preview.data ? formatMoney(preview.data.subtotal_paise) : '—'}</strong></div><div><span>Discount</span><strong>{preview.data ? `−${formatMoney(preview.data.discount_paise)}` : '—'}</strong></div><div><span><Truck size={15} /> Shipping</span><strong>{preview.data ? preview.data.shipping_paise ? formatMoney(preview.data.shipping_paise) : 'Free' : '—'}</strong></div><div className="checkout-grand-total"><span>Total</span><strong>{preview.data ? formatMoney(preview.data.total_paise) : '—'}</strong></div></div>
        {checkoutError && <p className="checkout-error" role="alert">{checkoutError}</p>}
        {order ? <button className="button primary checkout-place-order" disabled={paymentPending} onClick={() => void startPayment(order.payment.id)}>{paymentPending ? 'Opening payment…' : 'Retry payment'}</button> : <button className="button primary checkout-place-order" disabled={!preview.data?.valid || !selectedAddress || addresses.data?.addresses.length === 0 || paymentPending || preview.isPending} onClick={() => void placeOrder()}>{paymentPending ? 'Preparing secure payment…' : 'Place order and pay'}</button>}
        <p className="checkout-terms"><LockKeyhole size={13} /> Your payment is encrypted and secure.</p>
      </aside>
    </div>
  </div>
}

export function Component() { return <CheckoutPage /> }
