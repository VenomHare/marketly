import { useMemo } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { ProductGrid } from '../components/shared/ProductGrid'
import { useCategories, useSearchProducts } from '../features/catalog/hooks'
import { useDocumentTitle } from '../utils/use-document-title'

const sortOptions = [
  { value: ':', label: 'Featured' },
  { value: 'price:asc', label: 'Price: Low to High' },
  { value: 'price:desc', label: 'Price: High to Low' },
  { value: 'created_at:desc', label: 'Newest Arrivals' },
]

export function SearchPage() {
  const { slug } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const categories = useCategories()
  const requestParams = useMemo(() => {
    const params = new URLSearchParams(searchParams)
    if (slug) {
      const categoryId = categories.data?.categories.find(category => category.slug === slug)?.id || slug
      params.set('category', categoryId)
    }
    if (!params.has('limit')) params.set('limit', '20')
    return params
  }, [categories.data, searchParams, slug])
  const results = useSearchProducts(requestParams.toString())
  const q = searchParams.get('q')
  const pageTitle = q || categories.data?.categories.find(category => category.slug === slug)?.name || 'Shop'
  useDocumentTitle(pageTitle)

  function changeFilter(name: string, value: string) {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(name, value)
    else next.delete(name)
    next.delete('page')
    setSearchParams(next)
  }

  function changeSort(value: string) {
    const [sortBy, order] = value.split(':')
    const next = new URLSearchParams(searchParams)
    if (sortBy) next.set('sortBy', sortBy)
    else next.delete('sortBy')
    if (order) next.set('order', order)
    else next.delete('order')
    next.delete('page')
    setSearchParams(next)
  }

  const selectedSort = `${searchParams.get('sortBy') || ''}:${searchParams.get('order') || ''}`

  return <div className="listing-layout">
    <aside className="filters">
      <h2>Filters</h2>
      {!slug && <>
        <h3>Category</h3>
        {categories.data?.categories.filter(category => !category.parent_id).map(category => <label className="filter-option" key={category.id}>
          <input type="radio" name="category-filter" checked={searchParams.get('category') === category.id} onChange={() => changeFilter('category', category.id)} />
          {category.name}
        </label>)}
      </>}
      <h3>Price</h3>
      <form onSubmit={event => {
        event.preventDefault()
        const form = new FormData(event.currentTarget)
        const next = new URLSearchParams(searchParams)
        const min = String(form.get('min') || '')
        const max = String(form.get('max') || '')
        if (min) next.set('minPrice', min)
        else next.delete('minPrice')
        if (max) next.set('maxPrice', max)
        else next.delete('maxPrice')
        next.delete('page')
        setSearchParams(next)
      }}>
        <label>Minimum (₹)<input name="min" inputMode="numeric" defaultValue={searchParams.get('minPrice') || ''} /></label>
        <label>Maximum (₹)<input name="max" inputMode="numeric" defaultValue={searchParams.get('maxPrice') || ''} /></label>
        <button className="button neutral small">Apply</button>
      </form>
      {(searchParams.has('category') || searchParams.has('minPrice') || searchParams.has('maxPrice')) && <button className="text-link filter-clear" onClick={() => setSearchParams(q ? { q } : {})}>Clear filters</button>}
    </aside>

    <section className="results">
      <div className="results-heading">
        <h1>{q ? `Results for “${q}”` : 'Shop products'}</h1>
        <label>Sort by <select value={selectedSort} onChange={event => changeSort(event.target.value)}>
          {sortOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select></label>
      </div>
      {results.data && <p className="muted result-count">{results.data.total.toLocaleString('en-IN')} results</p>}
      <ProductGrid query={results} emptyMessage={q ? `No results for “${q}”` : 'No products found.'} />
      {results.data && results.data.totalPages > 1 && <Pagination page={Number(searchParams.get('page') || '1')} totalPages={results.data.totalPages} onChange={page => {
        const next = new URLSearchParams(searchParams)
        next.set('page', String(page))
        setSearchParams(next)
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }} />}
    </section>
  </div>
}

export function Component() {
  return <SearchPage />
}

function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (page: number) => void }) {
  return <nav className="pagination" aria-label="Product pages">
    <button className="button neutral small" disabled={page <= 1} onClick={() => onChange(page - 1)}>Previous</button>
    <span>Page {page} of {totalPages}</span>
    <button className="button neutral small" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>Next</button>
  </nav>
}
