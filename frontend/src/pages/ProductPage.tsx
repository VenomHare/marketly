import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, LockKeyhole, Star } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ProductImage } from '../components/shared/ProductImage'
import { ErrorState } from '../components/ui/ErrorState'
import { useAuth } from '../features/auth/hooks/useAuthLifecycle'
import { client } from '../api/client'
import { getGuestSessionId } from '../utils/guest-session'
import { formatMoney } from '../utils/format-money'
import { getImageUrl } from '../utils/image-url'
import { useProduct, useProductReviews, useRelatedProducts, useSeller } from '../features/catalog/hooks'
import type { Product } from '../features/catalog/types'
import { useDocumentTitle } from '../utils/use-document-title'

export function ProductPage() {
  const { productId = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { isAuthenticated, user } = useAuth()
  const isVendor = user?.role === 'vendor'
  const product = useProduct(productId)
  const [quantity, setQuantity] = useState(1)
  const [added, setAdded] = useState(false)
  const [selectedImage, setSelectedImage] = useState(0)
  const [descriptionExpanded, setDescriptionExpanded] = useState(false)
  const [reviewRating, setReviewRating] = useState(0)
  const [reviewTitle, setReviewTitle] = useState('')
  const [reviewComment, setReviewComment] = useState('')
  useEffect(() => setSelectedImage(0), [productId])
  const seller = useSeller(product.data?.vendor_id || '')
  const reviews = useProductReviews(productId, product.isSuccess)
  const reviewEligibility = useQuery({
    queryKey: ['product-review-eligibility', productId, user?.id],
    queryFn: async () => (await client.get<{ eligible: boolean; order_item_id: string | null }>(`/products/${productId}/review-eligibility`)).data,
    enabled: isAuthenticated && user?.role === 'customer' && product.isSuccess,
    retry: false,
  })
  const submitReview = useMutation({
    mutationFn: async () => {
      if (!reviewEligibility.data?.order_item_id) throw new Error('A delivered purchase is required to review this product.')
      return (await client.post(`/products/${productId}/reviews`, {
        order_item_id: reviewEligibility.data.order_item_id,
        rating: reviewRating,
        ...(reviewTitle.trim() ? { title: reviewTitle.trim() } : {}),
        comment: reviewComment.trim(),
      })).data
    },
    onSuccess: async () => {
      setReviewTitle('')
      setReviewComment('')
      setReviewRating(0)
      toast.success('Thanks for sharing your review.')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['product-reviews', productId] }),
        queryClient.invalidateQueries({ queryKey: ['product-review-eligibility', productId, user?.id] }),
        queryClient.invalidateQueries({ queryKey: ['product', productId] }),
      ])
    },
    onError: () => toast.error('We couldn’t submit your review. Please try again.'),
  })
  const related = useRelatedProducts(productId, product.isSuccess)
  useDocumentTitle(product.data?.name || 'Product')

  const addToCart = useMutation({
    mutationFn: async () => {
      if (isVendor) throw new Error('Seller accounts cannot place orders.')
      return user?.role === 'customer'
        ? client.post('/cart/mine/items', { product_id: productId, quantity })
        : client.post('/cart/items', { product_id: productId, quantity, session_id: getGuestSessionId() })
    },
    onSuccess: () => {
      setAdded(true)
      void queryClient.invalidateQueries({ queryKey: ['cart'] })
      toast.success('Added to your cart.')
    },
    onError: error => {
      const response = typeof error === 'object' && error !== null && 'response' in error ? error.response : undefined
      const data = typeof response === 'object' && response !== null && 'data' in response ? response.data : undefined
      const message = typeof data === 'object' && data !== null && 'message' in data && typeof data.message === 'string' ? data.message : ''
      const available = typeof data === 'object' && data !== null && 'available_quantity' in data && typeof data.available_quantity === 'number' ? data.available_quantity : undefined
      if (message === 'Requested quantity exceeds available stock') {
        toast.error(available === 0 ? 'Your cart already has the remaining stock for this product.' : `Only ${available ?? product.data?.stock ?? 0} more available at this time.`)
      } else if (message === 'Product is not available') toast.error('This product is no longer available.')
      else toast.error(message || 'Unable to add this item to your cart. Please try again.')
    },
  })

  if (product.isPending) return <ProductPageLoading />
  if (product.isError) return <ErrorState message={product.error.message} onRetry={() => void product.refetch()} />
  const item = product.data
  const unavailable = item.stock === 0
  const sellerName = seller.data?.display_name

  function buyNow() {
    if (isVendor) return
    addToCart.mutate(undefined, {
      onSuccess: () => navigate(isAuthenticated ? '/checkout' : '/login?next=%2Fcheckout'),
    })
  }

  return <>
    <div className="breadcrumbs"><Link to="/">Home</Link><span>›</span><span>{item.name}</span></div>
    <div className="product-detail">
      <div className="gallery">
        {item.images?.length ? <ProductGallery images={item.images} productName={item.name} selected={selectedImage} onSelect={setSelectedImage} /> : <ProductImage product={item} className="detail-image" />}
      </div>
      <section className="product-info">
        <h1>{item.name}</h1>
        {item.vendor_id && <Link className="text-link" to={`/seller/${item.vendor_id}`}>Visit the {sellerName || 'seller'} store</Link>}
        <a className="rating detail-rating" href="#reviews"><Star fill="currentColor" size={16} /> {Number(item.average_rating || 0).toFixed(1)} ({item.review_count || 0} ratings)</a>
        <hr />
        {unavailable ? <p className="unavailable">Currently unavailable</p> : <p className="price large">{formatMoney(item.price)}</p>}
        <StockLabel stock={item.stock} />
        <hr />
        <h2>About this item</h2>
        <p className={`description ${descriptionExpanded ? 'expanded' : ''}`}>{item.description}</p>
        <button className="description-toggle" type="button" aria-expanded={descriptionExpanded} onClick={() => setDescriptionExpanded(expanded => !expanded)}>{descriptionExpanded ? 'Read Less' : 'Read More'}</button>
      </section>
      <aside className="buy-box">
        {unavailable ? <p className="unavailable">Currently unavailable</p> : <p className="price large">{formatMoney(item.price)}</p>}
        <StockLabel stock={item.stock} />
        <label className="quantity-label">Quantity
          <select disabled={unavailable || isVendor} value={quantity} onChange={event => setQuantity(Number(event.target.value))}>
            {Array.from({ length: Math.min(item.stock || 10, 10) }, (_, index) => <option key={index + 1}>{index + 1}</option>)}
          </select>
        </label>
        {added && !isVendor ? <div className="added-box">
          <p><Check size={16} /> Added to cart</p>
          <Link className="button neutral" to="/cart">Go to cart</Link>
          <button className="button primary" onClick={() => navigate(isAuthenticated ? '/checkout' : '/login?next=%2Fcheckout')}>Proceed to checkout</button>
        </div> : <>
          <button className="button primary full" disabled={unavailable || isVendor || addToCart.isPending} onClick={() => addToCart.mutate()}>{isVendor ? 'Add to cart (customers only)' : 'Add to cart'}</button>
          <button className="button buy full" disabled={unavailable || isVendor || addToCart.isPending} onClick={buyNow}>Buy now</button>
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
      {!isAuthenticated ? <Link className="button neutral" to={`/login?next=${encodeURIComponent(`${location.pathname}#reviews`)}`}>Sign in to review</Link> : user?.role !== 'customer' ? <p className="muted">Product reviews are available to customers after purchase.</p> : reviewEligibility.isPending ? <p className="muted">Checking your purchase history…</p> : reviewEligibility.isError ? <div className="review-eligibility-error"><p>We couldn’t check your purchase history.</p><button className="button neutral" onClick={() => void reviewEligibility.refetch()}>Try again</button></div> : reviewEligibility.data?.eligible ? <form className="product-review-form" onSubmit={event => { event.preventDefault(); submitReview.mutate() }}>
        <h3>Share your experience</h3>
        <div className="product-review-rating"><span id="review-rating-label">Your rating</span><div role="group" aria-labelledby="review-rating-label" className="product-review-stars">{[1, 2, 3, 4, 5].map(rating => <button key={rating} type="button" aria-label={`${rating} ${rating === 1 ? 'star' : 'stars'}`} aria-pressed={reviewRating === rating} onClick={() => setReviewRating(rating)}><Star size={25} strokeWidth={1.8} fill={rating <= reviewRating ? 'currentColor' : 'none'} /></button>)}</div><span className="product-review-rating-value" aria-live="polite">{reviewRating ? `${reviewRating} out of 5` : 'Select a rating'}</span></div>
        <label>Title <span>(optional)</span><input maxLength={200} value={reviewTitle} onChange={event => setReviewTitle(event.target.value)} placeholder="Sum up your experience" /></label>
        <label>Your review<textarea required minLength={1} maxLength={5000} rows={4} value={reviewComment} onChange={event => setReviewComment(event.target.value)} placeholder="What should other shoppers know?" /></label>
        <button className="button primary" disabled={submitReview.isPending || reviewRating < 1 || !reviewComment.trim()}>{submitReview.isPending ? 'Submitting…' : 'Submit review'}</button>
      </form> : <p className="review-purchase-note">Only customers with a delivered, paid purchase of this item can leave a review.</p>}
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

function ProductGallery({ images, productName, selected, onSelect }: { images: NonNullable<Product['images']>; productName: string; selected: number; onSelect: (index: number) => void }) {
  const current = images[selected] ?? images[0]
  if (!current) return null
  const step = (offset: number) => onSelect((selected + offset + images.length) % images.length)
  return <div className="product-gallery">
    <div className="product-gallery-main">
      <img className="detail-image" src={getImageUrl(current.object_key)} alt={current.alt_text || productName} />
      {images.length > 1 && <>
        <button className="product-gallery-arrow previous" aria-label="Previous image" onClick={() => step(-1)}>‹</button>
        <button className="product-gallery-arrow next" aria-label="Next image" onClick={() => step(1)}>›</button>
        <span className="product-gallery-count">{selected + 1} / {images.length}</span>
      </>}
    </div>
    {images.length > 1 && <div className="product-gallery-thumbnails" aria-label="Product images">{images.map((image, index) => <button type="button" key={`${image.object_key}-${index}`} aria-label={`Show image ${index + 1}`} aria-pressed={index === selected} className={index === selected ? 'selected' : ''} onClick={() => onSelect(index)}><img src={getImageUrl(image.object_key)} alt="" /></button>)}</div>}
  </div>
}

function ProductPageLoading() {
  return <div className="product-detail loading-detail"><div className="skeleton" /><div className="skeleton" /><div className="skeleton" /></div>
}
