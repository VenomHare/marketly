import { useQueries, useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { client } from '../../api/client'
import { ErrorState } from '../../components/ui/ErrorState'
import { ProductImage } from '../../components/shared/ProductImage'
import { formatMoney } from '../../utils/format-money'
import { getGuestSessionId } from '../../utils/guest-session'
import { useDocumentTitle } from '../../utils/use-document-title'
import { getProduct } from '../catalog/api'
import type { Product } from '../catalog/types'

type CartItem = { id: string; product_id: string; quantity: number }
type CartResponse = { cart: { id: string } | null; items: CartItem[] }

export function CartPage() {
  useDocumentTitle('Shopping Cart')
  const cart = useQuery({
    queryKey: ['cart'],
    queryFn: async () => (await client.get<CartResponse>('/cart', { params: { session_id: getGuestSessionId() } })).data,
  })
  const productQueries = useQueries({
    queries: (cart.data?.items || []).map(item => ({
      queryKey: ['product', item.product_id],
      queryFn: () => getProduct(item.product_id),
      staleTime: 5 * 60_000,
    })),
  })

  if (cart.isPending) return <section className="cart-page"><h1>Shopping Cart</h1><div className="state-box">Loading your cart…</div></section>
  if (cart.isError) return <section className="cart-page"><h1>Shopping Cart</h1><ErrorState message={cart.error.message} onRetry={() => void cart.refetch()} /></section>
  if (!cart.data.items.length) return <section className="cart-page"><h1>Shopping Cart</h1><div className="state-box"><div className="display-number">Your cart is empty</div><p>Discover something you'll love.</p><Link className="button primary" to="/search">Continue shopping</Link></div></section>

  return <section className="cart-page">
    <h1>Shopping Cart</h1>
    <div className="cart-items">{cart.data.items.map((item, index) => {
      const product = productQueries[index]?.data
      if (productQueries[index]?.isError) return <CartItemFailure key={item.id} productId={item.product_id} />
      if (!product) return <CartItemSkeleton key={item.id} />
      return <CartItemRow key={item.id} item={item} product={product} />
    })}</div>
    <p className="cart-continue"><Link to="/search">Continue shopping</Link></p>
  </section>
}

export function Component() {
  return <CartPage />
}

function CartItemRow({ item, product }: { item: CartItem; product: Product }) {
  return <article>
    <Link className="cart-product-image" to={`/product/${product.id}`}><ProductImage product={product} /></Link>
    <div><Link to={`/product/${product.id}`}>{product.name}</Link><p>Quantity: {item.quantity}</p></div>
    <strong>{formatMoney(product.price * item.quantity)}</strong>
  </article>
}

function CartItemSkeleton() {
  return <article><div className="skeleton cart-item-image-skeleton" /><div className="skeleton cart-item-text-skeleton" /><div className="skeleton cart-item-price-skeleton" /></article>
}

function CartItemFailure({ productId }: { productId: string }) {
  return <article><div className="mini-skeleton" /><p>Product details are unavailable.</p><Link to={`/product/${productId}`}>View product</Link></article>
}
