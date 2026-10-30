import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ArrowLeft, LockKeyhole, Minus, Plus, ShieldCheck, ShoppingBag, Trash2 } from 'lucide-react'
import { client } from '../../api/client'
import { ErrorState } from '../../components/ui/ErrorState'
import { ProductImage } from '../../components/shared/ProductImage'
import { formatMoney } from '../../utils/format-money'
import { getGuestSessionId } from '../../utils/guest-session'
import { useDocumentTitle } from '../../utils/use-document-title'
import { getProduct } from '../catalog/api'
import type { Product } from '../catalog/types'
import { useAuth } from '../auth/hooks/useAuthLifecycle'

type CartItem = { id: string; product_id: string; quantity: number }
type CartResponse = { cart: { id: string } | null; items: CartItem[] }

export function CartPage() {
  useDocumentTitle('Shopping Cart')
  const queryClient = useQueryClient()
  const { isAuthenticated, user } = useAuth()
  const isCustomer = isAuthenticated && user?.role === 'customer'
  const cartUrl = isCustomer ? '/cart/mine' : '/cart'
  const cartParams = isCustomer ? undefined : { session_id: getGuestSessionId() }
  const cart = useQuery({
    queryKey: ['cart', isCustomer ? 'mine' : 'guest'],
    queryFn: async () => (await client.get<CartResponse>(cartUrl, { params: cartParams })).data,
  })
  const updateItem = useMutation({ mutationFn: async ({ id, quantity }: { id: string; quantity: number }) => client.patch(isCustomer ? `/cart/mine/items/${id}` : `/cart/items/${id}`, { quantity, ...(!isCustomer ? { session_id: getGuestSessionId() } : {}) }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cart'] }) })
  const removeItem = useMutation({ mutationFn: async (id: string) => client.delete(isCustomer ? `/cart/mine/items/${id}` : `/cart/items/${id}`, { ...(!isCustomer ? { params: { session_id: getGuestSessionId() } } : {}) }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cart'] }) })
  const productQueries = useQueries({
    queries: (cart.data?.items || []).map(item => ({
      queryKey: ['product', item.product_id],
      queryFn: () => getProduct(item.product_id),
      staleTime: 5 * 60_000,
    })),
  })

  if (cart.isPending) return <section className="cart-page"><h1>Shopping Cart</h1><div className="state-box">Loading your cart…</div></section>
  if (cart.isError) return <section className="cart-page"><h1>Shopping Cart</h1><ErrorState message={cart.error.message} onRetry={() => void cart.refetch()} /></section>
  if (!cart.data.items.length) return <section className="cart-page cart-page-empty"><div className="cart-empty-icon"><ShoppingBag size={30} /></div><span className="cart-eyebrow">YOUR MARKETLY CART</span><h1>Your cart is waiting</h1><p>Find something you love and it’ll be right here.</p><Link className="button primary" to="/search">Explore products</Link></section>

  const subtotal = cart.data.items.reduce((sum, item, index) => sum + (productQueries[index]?.data?.price ?? 0) * item.quantity, 0)
  const unresolved = productQueries.some(query => query.isPending || query.isError)

  return <section className="cart-page cart-page-polished">
    <div className="cart-page-heading"><div><span className="cart-eyebrow">YOUR MARKETLY CART</span><h1>Shopping cart</h1><p>{cart.data.items.length} {cart.data.items.length === 1 ? 'item' : 'items'} saved for later</p></div><Link className="cart-back-link" to="/search"><ArrowLeft size={15} /> Continue shopping</Link></div>
    <div className="cart-layout"><div className="cart-items">{cart.data.items.map((item, index) => {
      const product = productQueries[index]?.data
      if (productQueries[index]?.isError) return <CartItemFailure key={item.id} productId={item.product_id} onRemove={() => removeItem.mutate(item.id)} disabled={removeItem.isPending} />
      if (!product) return <CartItemSkeleton key={item.id} />
      return <CartItemRow key={item.id} item={item} product={product} busy={updateItem.isPending || removeItem.isPending} onQuantity={quantity => updateItem.mutate({ id: item.id, quantity })} onRemove={() => removeItem.mutate(item.id)} />
    })}</div><aside className="cart-summary"><h2>Order summary</h2><div><span>Subtotal</span><strong>{unresolved ? '—' : formatMoney(subtotal)}</strong></div><div><span>Shipping</span><strong className="cart-free">Free</strong></div><hr /><div className="cart-total"><span>Estimated total</span><strong>{unresolved ? '—' : formatMoney(subtotal)}</strong></div><Link className="button primary cart-checkout-button" to={isCustomer ? '/checkout' : '/login?next=%2Fcheckout'}>Proceed to checkout</Link><p className="cart-secure"><LockKeyhole size={14} /> Secure checkout</p><small>Taxes and discounts are calculated at checkout.</small></aside></div>
    <p className="cart-trust"><ShieldCheck size={16} /> Your items are reserved after checkout is complete.</p>
  </section>
}

export function Component() {
  return <CartPage />
}

function CartItemRow({ item, product, busy, onQuantity, onRemove }: { item: CartItem; product: Product; busy: boolean; onQuantity: (quantity: number) => void; onRemove: () => void }) {
  return <article>
    <Link className="cart-product-image" to={`/product/${product.id}`}><ProductImage product={product} /></Link>
    <div className="cart-item-details"><Link className="cart-item-title" to={`/product/${product.id}`}>{product.name}</Link><p className="cart-item-unit-price">{formatMoney(product.price)} <span>each</span></p><div className="cart-item-actions"><div className="cart-quantity-control"><button aria-label="Decrease quantity" disabled={busy || item.quantity <= 1} onClick={() => onQuantity(item.quantity - 1)}><Minus size={13} /></button><span>{item.quantity}</span><button aria-label="Increase quantity" disabled={busy || item.quantity >= (product.stock ?? item.quantity)} onClick={() => onQuantity(item.quantity + 1)}><Plus size={13} /></button></div><button className="cart-remove" disabled={busy} onClick={onRemove}><Trash2 size={14} /> Remove</button></div></div>
    <strong className="cart-item-total">{formatMoney(product.price * item.quantity)}</strong>
  </article>
}

function CartItemSkeleton() {
  return <article><div className="skeleton cart-item-image-skeleton" /><div className="skeleton cart-item-text-skeleton" /><div className="skeleton cart-item-price-skeleton" /></article>
}

function CartItemFailure({ productId, onRemove, disabled }: { productId: string; onRemove: () => void; disabled: boolean }) {
  return <article><div className="mini-skeleton" /><div><p>Product details are unavailable.</p><Link to={`/product/${productId}`}>View product</Link></div><button className="cart-remove" disabled={disabled} onClick={onRemove}><Trash2 size={14} /> Remove</button></article>
}
