import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, LockKeyhole, Star } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ProductImage } from '../components/shared/ProductImage'
import { ErrorState } from '../components/ui/ErrorState'
import { useAuth } from '../features/auth/hooks/useAuthLifecycle'
import { client } from '../api/client'
import { getGuestSessionId } from '../utils/guest-session'
import { formatMoney } from '../utils/format-money'
import { useProduct, useProductReviews, useRelatedProducts, useSeller } from '../features/catalog/hooks'
import type { Product } from '../features/catalog/types'
import { useDocumentTitle } from '../utils/use-document-title'

export function ProductPage() {
  const { productId = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { isAuthenticated } = useAuth()
  const product = useProduct(productId)
  const [quantity, setQuantity] = useState(1)
  const [added, setAdded] = useState(false)
  const seller = useSeller(product.data?.vendor_id || '')
  const reviews = useProductReviews(productId, product.isSuccess)
  const related = useRelatedProducts(productId, product.isSuccess)
  useDocumentTitle(product.data?.name || 'Product')

  const addToCart = useMutation({
    mutationFn: async () => client.post('/cart/items', {
      product_id: productId,
      quantity,
      session_id: getGuestSessionId(),
    }),
    onSuccess: () => {
      setAdded(true)
      void queryClient.invalidateQueries({ queryKey: ['cart'] })
      toast.success('Added to your cart.')
    },
    onError: error => toast.error(error instanceof Error ? error.message : 'Unable to add this item to your cart.'),
  })

  if (product.isPending) return <ProductPageLoading />
  if (product.isError) return <ErrorState message={product.error.message} onRetry={() => void product.refetch()} />
  const item = product.data
  const unavailable = item.stock === 0
  const sellerName = seller.data?.display_name

  function buyNow() {
    addToCart.mutate(undefined, {
      onSuccess: () => navigate(isAuthenticated ? '/checkout' : '/login?next=%2Fcheckout'),
    })
  }

  return <>
    <div className="breadcrumbs"><Link to="/">Home</Link><span>›</span><span>{item.name}</span></div>
    <div className="product-detail">
      <div className="gallery"><ProductImage product={item} className="detail-image" /></div>
      <section className="product-info">
        <h1>{item.name}</h1>
        {item.vendor_id && <Link className="text-link" to={`/seller/${item.vendor_id}`}>Visit the {sellerName || 'seller'} store</Link>}
        <a className="rating detail-rating" href="#reviews"><Star fill="currentColor" size={16} /> {Number(item.average_rating || 0).toFixed(1)} ({item.review_count || 0} ratings)</a>
        <hr />
        {unavailable ? <p className="unavailable">Currently unavailable</p> : <p className="price large">{formatMoney(item.price)}</p>}
        <StockLabel stock={item.stock} />
        <hr />
        <h2>About this item</h2>
        <p className="description">{item.description}</p>
      </section>
      <aside className="buy-box">
        {unavailable ? <p className="unavailable">Currently unavailable</p> : <p className="price large">{formatMoney(item.price)}</p>}
        <StockLabel stock={item.stock} />
        <label className="quantity-label">Quantity
          <select disabled={unavailable} value={quantity} onChange={event => setQuantity(Number(event.target.value))}>
            {Array.from({ length: Math.min(item.stock || 10, 10) }, (_, index) => <option key={index + 1}>{index + 1}</option>)}
          </select>
        </label>
        {added ? <div className="added-box">
          <p><Check size={16} /> Added to cart</p>
          <Link className="button neutral" to="/cart">Go to cart</Link>
          <button className="button primary" onClick={() => navigate(isAuthenticated ? '/checkout' : '/login?next=%2Fcheckout')}>Proceed to checkout</button>
        </div> : <>
          <button className="button primary full" disabled={unavailable || addToCart.isPending} onClick={() => addToCart.mutate()}>Add to cart</button>
          <button className="button buy full" disabled={unavailable || addToCart.isPending} onClick={buyNow}>Buy now</button>
        </>}
        <p className="muted secure"><LockKeyhole size={14} /> Secure transaction</p>
      </aside>
    </div>

    {related.data?.products.length ? <section className="content-section"><h2>Products related to this item</h2><div className="product-grid">{related.data.products.map(product => <RelatedCard key={product.id} product={product} />)}</div></section> : null}

    <section className="reviews" id="reviews">
      <h2>Customer reviews</h2>
      <p className="muted">{item.review_count || 0} global ratings</p>
      {reviews.isPending && <p className="muted">Loading reviews…</p>}
      {reviews.isError && <ErrorState message={reviews.error.message} onRetry={() => void reviews.refetch()} />}
      {reviews.data && (reviews.data.reviews.length ? <div className="review-list">{reviews.data.reviews.map(review => <article key={review.id}>
        <p className="rating"><Star fill="currentColor" size={14} /> {review.rating} · Verified purchase</p>
        {review.title && <h3>{review.title}</h3>}
        <p>{review.comment}</p>
        <small>Reviewed on {new Date(review.created_at).toLocaleDateString('en-IN')}</small>
      </article>)}</div> : <p className="muted">No customer reviews yet.</p>)}
      <Link className="button neutral" to={`/login?next=${encodeURIComponent(`${location.pathname}#reviews`)}`}>Write a customer review</Link>
    </section>
  </>
}

export function Component() {
  return <ProductPage />
}

function StockLabel({ stock }: { stock?: number }) {
  if (stock === undefined) return null
  if (stock === 0) return <p className="unavailable">Currently unavailable</p>
  if (stock <= 5) return <p className="unavailable">Only {stock} left in stock</p>
  return <p className="in-stock">In stock</p>
}

function RelatedCard({ product }: { product: Product }) {
  return <article className="product-card"><Link className="product-link" to={`/product/${product.id}`}><ProductImage product={product} className="product-image" /><h3>{product.name}</h3></Link><p className="price">{formatMoney(product.price)}</p></article>
}

function ProductPageLoading() {
  return <div className="product-detail loading-detail"><div className="skeleton" /><div className="skeleton" /><div className="skeleton" /></div>
}
