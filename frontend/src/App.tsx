import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BrowserRouter, useLocation, useNavigate } from 'react-router-dom'
import { Check, ImageOff, Menu, Search, ShoppingCart, Star } from 'lucide-react'
import { getData } from './api/client'
import './App.css'

type Product = { id: string; name: string; description?: string; price: number; stock?: number; average_rating?: number; review_count?: number; status?: string; vendor_id?: string; primary_image_key?: string; images?: { object_key: string; alt_text?: string; position: number }[] }
type Category = { id: string; name: string; slug?: string; parent_id?: string }
type Vendor = { id: string; display_name: string; created_at?: string }
type ApiState<T> = { status: 'loading' } | { status: 'success'; data: T } | { status: 'error'; message: string }

const apiBase = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
const imageBase = (import.meta.env.VITE_R2_PUBLIC_BASE_URL || '').replace(/\/$/, '')
const api = async <T,>(path: string): Promise<T> => {
  if (!apiBase) throw new Error('Marketplace API is not configured.')
  return getData<T>(path)
}
const money = (paise: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(paise / 100)
const imageUrl = (key?: string) => key && imageBase ? `${imageBase}/${key}` : undefined
const useResource = <T,>(key: string, load: () => Promise<T>): ApiState<T> => {
  const query = useQuery({ queryKey: [key], queryFn: load, enabled: key !== 'none' })
  if (query.isPending) return { status: 'loading' }
  if (query.isError) return { status: 'error', message: query.error instanceof Error ? query.error.message : 'Something went wrong.' }
  return { status: 'success', data: query.data }
}

function Image({ product, className = '' }: { product: Product; className?: string }) {
  const key = product.primary_image_key || [...(product.images || [])].sort((a, b) => a.position - b.position)[0]?.object_key
  const src = imageUrl(key)
  return src ? <img className={className} src={src} alt={product.images?.[0]?.alt_text || product.name} loading="lazy" decoding="async" /> : <div className={`missing-image ${className}`} aria-label={`No image available for ${product.name}`}><ImageOff size={22} /></div>
}

function ProductCard({ product }: { product: Product }) {
  return <article className="product-card">
    <a href={`/product/${product.id}`} className="product-link"><Image product={product} className="product-image" /><h3>{product.name}</h3></a>
    <p className="rating"><Star size={14} fill="currentColor" /> {Number(product.average_rating || 0).toFixed(1)} <span>({product.review_count || 0})</span></p>
    <p className="price">{money(product.price)}</p>
    {product.stock === 0 && <p className="unavailable">Currently unavailable</p>}
    <a className="button primary small" href={`/product/${product.id}`}>View item</a>
  </article>
}

function Products({ state, heading, empty = 'No products found.' }: { state: ApiState<Product[]>; heading?: string; empty?: string }) {
  return <section className="content-section">
    {heading && <h2>{heading}</h2>}
    {state.status === 'loading' && <div className="product-grid">{Array.from({ length: 8 }, (_, i) => <div className="product-card skeleton" key={i}><div /><span /><span /></div>)}</div>}
    {state.status === 'error' && <div className="state-box" role="alert"><p>{state.message}</p><button className="button neutral" onClick={() => window.location.reload()}>Retry</button></div>}
    {state.status === 'success' && state.data.length === 0 && <div className="state-box"><h3>{empty}</h3><p>Try another search or browse a category.</p><a className="text-link" href="/search">Browse products</a></div>}
    {state.status === 'success' && state.data.length > 0 && <div className="product-grid">{state.data.map(product => <ProductCard key={product.id} product={product} />)}</div>}
  </section>
}

function AppContent() {
  const location = useLocation()
  const routerNavigate = useNavigate()
  const locationKey = `${location.pathname}${location.search}`
  const [query, setQuery] = useState(new URLSearchParams(location.search).get('q') || '')
  const route = useMemo(() => {
    const url = new URL(locationKey, window.location.origin)
    return { path: url.pathname, params: url.searchParams }
  }, [locationKey])
  const categoriesState = useResource<ApiCategoryResponse>('/categories', () => api('/categories?page=1&limit=100'))
  const categories = categoriesState.status === 'success' ? categoriesState.data.categories || categoriesState.data.data || [] : []
  const [selectedCategory, setSelectedCategory] = useState('')
  const topCategories = categories.filter(category => !category.parent_id).slice(0, 8)
  const searchParams = new URLSearchParams(route.params)
  if (route.path.startsWith('/category/')) searchParams.set('category', route.path.split('/')[2])
  if (route.path === '/search') searchParams.set('q', route.params.get('q') || '')
  const searchQuery = searchParams.toString()
  const searchState = useResource<ApiSearchResponse>(`search:${searchQuery}`, () => api(`/search/products?${searchQuery || 'limit=20'}`))
  const trendingState = useResource<ApiProductList>('/search/trending', () => api('/search/trending?limit=12'))
  const latestState = useResource<ApiSearchResponse>('latest', () => api('/search/products?sortBy=created_at&order=desc&limit=8'))
  const productMatch = route.path.match(/^\/product\/([^/]+)$/)
  const productState = useResource<Product>(productMatch ? `product:${productMatch[1]}` : 'none', () => productMatch ? api(`/products/${productMatch[1]}`) : Promise.reject(new Error('')))
  const sellerMatch = route.path.match(/^\/seller\/([^/]+)$/)
  const sellerState = useResource<Vendor>(sellerMatch ? `seller:${sellerMatch[1]}` : 'none', () => sellerMatch ? api(`/vendors/${sellerMatch[1]}`) : Promise.reject(new Error('')))
  const sellerProducts = useResource<ApiProductList>(sellerMatch ? `seller-products:${sellerMatch[1]}` : 'none', () => sellerMatch ? api(`/vendors/${sellerMatch[1]}/products?page=1&limit=20`) : Promise.reject(new Error('')))
  useEffect(() => { setQuery(new URLSearchParams(location.search).get('q') || '') }, [location.search])
  const navigate = (path: string) => { routerNavigate(path); window.scrollTo(0, 0) }
  const goSearch = (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); navigate(`/search?q=${encodeURIComponent(query.trim())}`) }
  const getProducts = (state: ApiState<ApiSearchResponse | ApiProductList>): ApiState<Product[]> => state.status === 'success' ? { status: 'success', data: state.data.products || [] } : state
  const isHome = route.path === '/'
  const isSearch = route.path === '/search' || route.path.startsWith('/category/')
  const isProduct = Boolean(productMatch)
  const cartPage = route.path === '/cart'
  const notFound = !isHome && !isSearch && !isProduct && !sellerMatch && !cartPage
  useEffect(() => { document.title = route.path === '/' ? 'Bazaar' : `${isSearch ? (route.params.get('q') || 'Shop') : isProduct && productState.status === 'success' ? productState.data.name : 'Marketplace'} | Bazaar` }, [route.path, route.params, isProduct, productState])

  return <div className="app-shell">
    <header className="site-header">
      <div className="header-main">
        <button className="icon-button mobile-menu" aria-label="Open categories" onClick={() => document.getElementById('category-nav')?.scrollIntoView({ behavior: 'smooth' })}><Menu /></button>
        <a className="wordmark" href="/" onClick={e => { e.preventDefault(); navigate('/') }}>Bazaar<span>.</span></a>
        <form className="search-form" onSubmit={goSearch} role="search">
          <label className="sr-only" htmlFor="category">Product category</label>
          <select id="category" value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)}><option value="">All</option>{topCategories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
          <label className="sr-only" htmlFor="site-search">Search Bazaar</label>
          <input id="site-search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search Bazaar" />
          <button type="submit" aria-label="Search"><Search size={20} /></button>
        </form>
        <nav className="header-links" aria-label="Account and cart">
          <a href="/login" onClick={e => { e.preventDefault(); navigate('/login') }}><small>Hello, sign in</small><strong>Account &amp; Orders</strong></a>
          <a href="/account/orders" onClick={e => { e.preventDefault(); navigate('/account/orders') }} className="orders-link"><strong>Orders</strong></a>
          <a className="cart-link" href="/cart" onClick={e => { e.preventDefault(); navigate('/cart') }}><ShoppingCart size={25} /><strong>Cart</strong></a>
        </nav>
      </div>
      <nav className="subnav" id="category-nav" aria-label="Shop categories"><a href="/search" onClick={e => { e.preventDefault(); navigate('/search') }}>☰ &nbsp; All</a>{topCategories.map(category => <a key={category.id} href={`/category/${category.slug || category.id}`} onClick={e => { e.preventDefault(); navigate(`/category/${category.slug || category.id}`) }}>{category.name}</a>)}<a className="sell-link" href="/vendor/apply" onClick={e => { e.preventDefault(); navigate('/vendor/apply') }}>Sell on Bazaar</a></nav>
    </header>

    <main>
      {isHome && <>
        <section className="hero"><h1>Shop from trusted sellers across India</h1><p>Millions of products, delivered to your door.</p><a href="/search" className="button primary" onClick={e => { e.preventDefault(); navigate('/search') }}>Start shopping</a></section>
        <div className="home-cards">
          <section className="home-card"><h2>Shop by category</h2>{categoriesState.status === 'loading' && <p className="muted">Loading categories…</p>}{categoriesState.status === 'error' && <RetryState message={categoriesState.message} onRetry={() => window.location.reload()} />}{categoriesState.status === 'success' && <ul className="category-list">{topCategories.map(category => <li key={category.id}><a href={`/category/${category.slug || category.id}`} onClick={e => { e.preventDefault(); navigate(`/category/${category.slug || category.id}`) }}>{category.name}</a></li>)}</ul>}</section>
          <section className="home-card"><h2>Trending now</h2><ProductMiniGrid state={getProducts(trendingState)} navigate={navigate} /></section>
          <section className="home-card"><h2>New arrivals</h2><ProductMiniGrid state={getProducts(latestState)} navigate={navigate} /></section>
          <section className="home-card sign-in-card"><h2>Sign in for the best experience</h2><p>Track your orders and save your addresses.</p><a href="/login" className="button primary" onClick={e => { e.preventDefault(); navigate('/login') }}>Sign in securely</a><p>New customer? <a href="/register" onClick={e => { e.preventDefault(); navigate('/register') }}>Start here.</a></p></section>
        </div>
        <Products state={getProducts(trendingState)} heading="Trending products" />
        <Products state={getProducts(latestState)} heading="New arrivals" />
      </>}
      {isSearch && <div className="listing-layout"><aside className="filters"><h2>Filters</h2><h3>Category</h3>{categoriesState.status === 'success' && topCategories.map(category => <label className="filter-option" key={category.id}><input type="radio" name="category-filter" checked={route.params.get('category') === category.id} onChange={() => navigate(`/search?category=${encodeURIComponent(category.id)}`)} />{category.name}</label>)}<h3>Price</h3><form onSubmit={e => { e.preventDefault(); const form = new FormData(e.currentTarget); const params = new URLSearchParams(route.params); params.set('minPrice', String(form.get('min') || '')); params.set('maxPrice', String(form.get('max') || '')); params.delete('page'); navigate(`/search?${params}`) }}><label>Minimum (₹)<input name="min" inputMode="numeric" /></label><label>Maximum (₹)<input name="max" inputMode="numeric" /></label><button className="button neutral small">Apply</button></form></aside><div className="results"><div className="results-heading"><h1>{route.params.get('q') ? `Results for “${route.params.get('q')}”` : 'Shop products'}</h1><label>Sort by <select value={`${route.params.get('sortBy') || ''}:${route.params.get('order') || ''}`} onChange={e => { const [sortBy, order] = e.target.value.split(':'); const params = new URLSearchParams(route.params); if (sortBy) params.set('sortBy', sortBy); else params.delete('sortBy'); if (order) params.set('order', order); else params.delete('order'); params.delete('page'); navigate(`/search?${params}`) }}><option value=":">Featured</option><option value="price:asc">Price: Low to High</option><option value="price:desc">Price: High to Low</option><option value="created_at:desc">Newest Arrivals</option></select></label></div><Products state={getProducts(searchState)} /></div></div>}
      {isProduct && <ProductDetail state={productState} navigate={navigate} />}
      {sellerMatch && <><section className="seller-header">{sellerState.status === 'loading' ? <div className="skeleton seller-skeleton" /> : sellerState.status === 'error' ? <RetryState message={sellerState.message} onRetry={() => window.location.reload()} /> : <><h1>{sellerState.data.display_name}</h1>{sellerState.data.created_at && <p className="muted">On Bazaar since {new Date(sellerState.data.created_at).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}</p>}</>}</section><Products state={getProducts(sellerProducts)} heading="Products from this seller" /></>}
      {cartPage && <CartPage />}
      {notFound && <section className="not-found"><div className="display-number">404</div><h1>Page not found</h1><p>We couldn't find the page you're looking for.</p><a className="button primary" href="/" onClick={e => { e.preventDefault(); navigate('/') }}>Go to Bazaar home</a></section>}
    </main>
    <footer><button className="back-top" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>Back to top</button><div className="footer-links"><div><h2>Get to know us</h2><span>Shop from sellers across India</span></div><div><h2>Sell with us</h2><a href="/vendor/apply">Sell on Bazaar</a></div><div><h2>Let us help you</h2><a href="/account">Your Account</a><a href="/account/orders">Your Orders</a><a href="/account/addresses">Your Addresses</a></div><div><h2>Payments</h2><span>UPI, cards and net banking via Razorpay</span></div></div><div className="footer-bottom"><a href="/" className="wordmark">Bazaar<span>.</span></a><span>© {new Date().getFullYear()} Bazaar</span></div></footer>
  </div>
}

export default function App() {
  return <BrowserRouter><AppContent /></BrowserRouter>
}

type ApiCategoryResponse = { categories?: Category[]; data?: Category[] }
type ApiProductList = { products?: Product[]; data?: Product[] }
type ApiSearchResponse = ApiProductList & { total?: number; totalPages?: number; page?: number; limit?: number }

function RetryState({ message, onRetry }: { message: string; onRetry: () => void }) { return <div className="state-box" role="alert"><p>{message}</p><button className="button neutral" onClick={onRetry}>Retry</button></div> }
function ProductMiniGrid({ state, navigate }: { state: ApiState<Product[]>; navigate: (path: string) => void }) {
  if (state.status === 'loading') return <div className="mini-grid">{Array.from({ length: 4 }, (_, i) => <div className="mini-skeleton" key={i} />)}</div>
  if (state.status === 'error') return <RetryState message={state.message} onRetry={() => location.reload()} />
  if (!state.data.length) return <p className="muted">No products to show yet.</p>
  return <div className="mini-grid">{state.data.slice(0, 4).map(product => <a key={product.id} href={`/product/${product.id}`} onClick={e => { e.preventDefault(); navigate(`/product/${product.id}`) }}><Image product={product} /><span>{product.name}</span></a>)}</div>
}
function ProductDetail({ state, navigate }: { state: ApiState<Product>; navigate: (path: string) => void }) {
  const [quantity, setQuantity] = useState(1)
  const [added, setAdded] = useState(false)
  const [error, setError] = useState('')
  const product = state.status === 'success' ? state.data : undefined
  if (state.status === 'loading') return <div className="product-detail loading-detail"><div className="skeleton" /><div className="skeleton" /><div className="skeleton" /></div>
  if (state.status === 'error') return <section className="not-found"><h1>Product unavailable</h1><RetryState message={state.message} onRetry={() => location.reload()} /></section>
  if (!product) return null
  const unavailable = product.stock === 0
  const addToCart = async (buyNow = false) => {
    setError('')
    try {
      const headers = new Headers({ 'Content-Type': 'application/json' })
      let session = localStorage.getItem('bz_session_id')
      if (!session) { session = crypto.randomUUID(); localStorage.setItem('bz_session_id', session) }
      headers.set('X-Session-Id', session)
      const response = await fetch(`${apiBase}/cart/items`, { method: 'POST', headers, body: JSON.stringify({ product_id: product.id, quantity }) })
      if (!response.ok) { const result = await response.json() as { message?: string }; throw new Error(result.message || 'Unable to add this item to your cart.') }
      setAdded(true)
      if (buyNow) navigate('/login?next=%2Fcheckout')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to add this item to your cart.') }
  }
  return <><div className="breadcrumbs"><a href="/">Home</a><span>›</span><span>{product.name}</span></div><div className="product-detail"><div className="gallery"><Image product={product} className="detail-image" /></div><section className="product-info"><h1>{product.name}</h1><a className="text-link" href={`/seller/${product.vendor_id}`}>Visit the seller store</a><a className="rating detail-rating" href="#reviews"><Star fill="currentColor" size={16} />{Number(product.average_rating || 0).toFixed(1)} ({product.review_count || 0} ratings)</a><hr /><p className="price large">{money(product.price)}</p><p className={unavailable ? 'unavailable' : 'in-stock'}>{unavailable ? 'Currently unavailable' : product.stock !== undefined && product.stock <= 5 ? `Only ${product.stock} left in stock` : 'In stock'}</p><hr /><h2>About this item</h2><p className="description">{product.description}</p></section><aside className="buy-box"><p className="price large">{unavailable ? 'Currently unavailable' : money(product.price)}</p><p className={unavailable ? 'unavailable' : 'in-stock'}>{unavailable ? 'Currently unavailable' : 'In stock'}</p><label className="quantity-label">Quantity<select disabled={unavailable} value={quantity} onChange={e => setQuantity(Number(e.target.value))}>{Array.from({ length: Math.min(product.stock || 10, 10) }, (_, i) => <option key={i + 1}>{i + 1}</option>)}</select></label>{added ? <div className="added-box"><p><Check size={16} /> Added to cart</p><button className="button neutral" onClick={() => navigate('/cart')}>Go to cart</button><button className="button primary" onClick={() => navigate('/login?next=%2Fcheckout')}>Proceed to checkout</button></div> : <><button className="button primary full" disabled={unavailable} onClick={() => void addToCart()}>Add to cart</button><button className="button buy full" disabled={unavailable} onClick={() => void addToCart(true)}>Buy now</button></>}{error && <p className="error-text" role="alert">{error}</p>}<p className="muted secure">🔒 Secure transaction</p></aside></div><section className="reviews" id="reviews"><h2>Customer reviews</h2><p className="muted">{product.review_count || 0} global ratings</p><a className="button neutral" href={`/login?next=${encodeURIComponent(location.pathname + '#reviews')}`}>Write a customer review</a><Reviews productId={product.id} /></section></>
}
function Reviews({ productId }: { productId: string }) {
  const state = useResource<{ reviews?: { id: string; rating: number; title?: string; comment: string; created_at: string }[] }>(`reviews:${productId}`, () => api(`/products/${productId}/reviews?page=1&limit=10`))
  if (state.status === 'loading') return <div className="review-loading">Loading reviews…</div>
  if (state.status === 'error') return <RetryState message={state.message} onRetry={() => location.reload()} />
  if (!state.data.reviews?.length) return <p className="muted">No customer reviews yet.</p>
  return <div className="review-list">{state.data.reviews.map(review => <article key={review.id}><p className="rating"><Star fill="currentColor" size={14} /> {review.rating} · Verified purchase</p><h3>{review.title}</h3><p>{review.comment}</p><small>Reviewed on {new Date(review.created_at).toLocaleDateString('en-IN')}</small></article>)}</div>
}
function CartPage() {
  const [state, setState] = useState<ApiState<{ items?: { id: string; quantity: number; product?: Product }[]; total?: number }>>({ status: 'loading' })
  useEffect(() => { let live = true; const headers = new Headers(); const session = localStorage.getItem('bz_session_id'); if (session) headers.set('X-Session-Id', session); if (!apiBase) { setState({ status: 'error', message: 'Marketplace API is not configured.' }); return } fetch(`${apiBase}/cart`, { headers }).then(async response => { if (!response.ok) throw new Error('Unable to load your cart.'); return response.json() }).then(data => { if (live) setState({ status: 'success', data }) }).catch(error => { if (live) setState({ status: 'error', message: error instanceof Error ? error.message : 'Unable to load your cart.' }) }); return () => { live = false } }, [])
  return <section className="cart-page"><h1>Shopping Cart</h1>{state.status === 'loading' && <div className="state-box">Loading your cart…</div>}{state.status === 'error' && <RetryState message={state.message} onRetry={() => location.reload()} />}{state.status === 'success' && (!state.data.items?.length ? <div className="state-box"><div className="display-number">Your cart is empty</div><p>Discover something you'll love.</p><a className="button primary" href="/search">Continue shopping</a></div> : <div className="cart-items">{state.data.items.map(item => <article key={item.id}><div className="mini-skeleton"><Image product={item.product || { id: '', name: 'Product', price: 0 }} /></div><div><a href={`/product/${item.product?.id}`}>{item.product?.name}</a><p>Quantity: {item.quantity}</p></div><strong>{item.product ? money(item.product.price * item.quantity) : ''}</strong></article>)}</div>)}</section>
}

