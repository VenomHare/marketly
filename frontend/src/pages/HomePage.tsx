import { Link } from 'react-router-dom'
import { ErrorState } from '../components/ui/ErrorState'
import { ProductGrid } from '../components/shared/ProductGrid'
import { ProductMiniGrid } from '../components/shared/ProductMiniGrid'
import { useAuth } from '../features/auth/hooks/useAuthLifecycle'
import { useCategories, useLatestProducts, useTrendingProducts } from '../features/catalog/hooks'
import { useDocumentTitle } from '../utils/use-document-title'

export function HomePage() {
  useDocumentTitle('')
  const categories = useCategories()
  const trending = useTrendingProducts()
  const latest = useLatestProducts()
  const { user } = useAuth()
  const topCategories = (categories.data?.categories || []).filter(category => !category.parent_id).slice(0, 8)

  return <>
    <section className="hero">
      <h1>Shop from trusted sellers across India</h1>
      <p>Millions of products, delivered to your door.</p>
      <Link to="/search" className="button primary">Start shopping</Link>
    </section>

    <div className="home-cards">
      <section className="home-card">
        <h2>Shop by category</h2>
        {categories.isPending && <p className="muted">Loading categories…</p>}
        {categories.isError && <ErrorState message={categories.error.message} onRetry={() => void categories.refetch()} />}
        {categories.data && <ul className="category-list">{topCategories.map(category => <li key={category.id}>
          <Link to={`/category/${category.slug || category.id}`}>{category.name}</Link>
        </li>)}</ul>}
      </section>

      <section className="home-card"><h2>Trending now</h2>
        <ProductMiniGrid products={trending.data?.products} isLoading={trending.isPending} error={trending.error} onRetry={() => void trending.refetch()} />
      </section>

      <section className="home-card"><h2>New arrivals</h2>
        <ProductMiniGrid products={latest.data?.products} isLoading={latest.isPending} error={latest.error} onRetry={() => void latest.refetch()} />
      </section>

      <section className="home-card sign-in-card">
        {user ? <>
          <h2>Welcome, {user.name.split(' ')[0]}</h2>
          <p>Pick up where you left off.</p>
          <Link className="button primary" to={user.role === 'vendor' ? '/vendor/dashboard' : '/account/orders'}>{user.role === 'vendor' ? 'Open seller dashboard' : 'View your orders'}</Link>
        </> : <>
          <h2>Sign in for the best experience</h2>
          <p>Track your orders and save your addresses.</p>
          <Link to="/login" className="button primary">Sign in securely</Link>
          <p>New customer? <Link to="/register">Start here.</Link></p>
        </>}
      </section>
    </div>

    <section className="content-section"><h2>Trending products</h2><ProductGrid query={trending} /></section>
    <section className="content-section"><h2>New arrivals</h2><ProductGrid query={latest} /></section>
  </>
}

export function Component() {
  return <HomePage />
}
