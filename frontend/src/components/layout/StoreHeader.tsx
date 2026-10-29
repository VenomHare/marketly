import { useState, type FormEvent } from 'react'
import { Menu, Search, ShoppingCart } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../features/auth/hooks/useAuthLifecycle'
import { useCategories } from '../../features/catalog/hooks'

export function StoreHeader() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const categories = useCategories()
  const [searchText, setSearchText] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const topCategories = (categories.data?.categories || []).filter(category => !category.parent_id).slice(0, 8)

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const params = new URLSearchParams()
    const trimmedSearch = searchText.trim()
    if (trimmedSearch) params.set('q', trimmedSearch)
    if (selectedCategory) params.set('category', selectedCategory)
    navigate(`/search${params.size ? `?${params}` : ''}`)
  }

  const accountPath = user?.role === 'admin'
    ? '/admin'
    : user?.role === 'vendor'
      ? '/vendor/dashboard'
      : user
        ? '/account'
        : '/login'
  const sellerPath = user?.role === 'vendor' ? '/vendor/dashboard' : '/vendor/apply'

  return <header className="site-header">
    <div className="header-main">
      <button className="icon-button mobile-menu" aria-label="Open categories" onClick={() => document.getElementById('category-nav')?.scrollIntoView({ behavior: 'smooth' })}>
        <Menu />
      </button>
      <Link className="wordmark" to="/">Marketly<span>.</span></Link>
      <form className="search-form" onSubmit={submitSearch} role="search">
        <label className="sr-only" htmlFor="category">Product category</label>
        <select id="category" value={selectedCategory} onChange={event => setSelectedCategory(event.target.value)}>
          <option value="">All</option>
          {topCategories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
        </select>
        <label className="sr-only" htmlFor="site-search">Search Marketly</label>
        <input id="site-search" value={searchText} onChange={event => setSearchText(event.target.value)} placeholder="Search Marketly" />
        <button type="submit" aria-label="Search"><Search size={20} /></button>
      </form>
      <nav className="header-links" aria-label="Account and cart">
        <Link to={accountPath}>
          <small>{user ? `Hello, ${user.name.split(' ')[0]}` : 'Hello, sign in'}</small>
          <strong>Account &amp; Orders</strong>
        </Link>
        <Link to="/account/orders" className="orders-link"><strong>Orders</strong></Link>
        <Link className="cart-link" to="/cart"><ShoppingCart size={25} /><strong>Cart</strong></Link>
      </nav>
    </div>
    <nav className="subnav" id="category-nav" aria-label="Shop categories">
      <Link to="/search">Explore</Link>
      {topCategories.map(category => <Link key={category.id} to={`/category/${category.slug || category.id}`}>{category.name}</Link>)}
      <Link className="sell-link" to={sellerPath}>{user?.role === 'vendor' ? 'Seller dashboard' : 'Become a seller'}</Link>
    </nav>
  </header>
}
