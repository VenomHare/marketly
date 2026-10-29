import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ErrorState } from '../components/ui/ErrorState'
import { ProductGrid } from '../components/shared/ProductGrid'
import { useSeller, useSellerProducts } from '../features/catalog/hooks'
import { useDocumentTitle } from '../utils/use-document-title'

export function SellerPage() {
  const { vendorId = '' } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const page = Math.max(1, Number(searchParams.get('page') || '1'))
  const seller = useSeller(vendorId)
  const products = useSellerProducts(vendorId, page)
  const totalPages = products.data?.pagination?.pages || products.data?.pagination?.total_pages || 0
  useDocumentTitle(seller.data?.display_name || 'Seller')

  if (seller.isPending) return <div className="seller-header skeleton seller-skeleton" />
  if (seller.isError) return <ErrorState message={seller.error.message} onRetry={() => void seller.refetch()} />

  return <>
    <section className="seller-header">
      <h1>{seller.data.display_name}</h1>
      {seller.data.created_at && <p className="muted">On Marketly since {new Date(seller.data.created_at).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}</p>}
      <Link to="/search" className="text-link">Explore the marketplace</Link>
    </section>
    <section className="content-section">
      <h2>Products from this seller</h2>
      <ProductGrid query={products} />
      {totalPages > 1 && <nav className="pagination" aria-label="Seller product pages">
        <button className="button neutral small" disabled={page <= 1} onClick={() => setSearchParams({ page: String(page - 1) })}>Previous</button>
        <span>Page {page} of {totalPages}</span>
        <button className="button neutral small" disabled={page >= totalPages} onClick={() => setSearchParams({ page: String(page + 1) })}>Next</button>
      </nav>}
    </section>
  </>
}

export function Component() {
  return <SellerPage />
}
