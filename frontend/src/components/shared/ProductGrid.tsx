import { ErrorState } from '../ui/ErrorState'
import { ProductCard } from './ProductCard'
import type { Product } from '../../features/catalog/types'

type ProductGridQuery = {
  data?: { products: Product[] }
  isPending: boolean
  isError: boolean
  error?: Error | null
  refetch: () => Promise<unknown>
}

type Props = {
  query: ProductGridQuery
  emptyMessage?: string
}

export function ProductGrid({ query, emptyMessage = 'No products found.' }: Props) {
  if (query.isPending) return <div className="product-grid">{Array.from({ length: 8 }, (_, index) => <ProductSkeleton key={index} />)}</div>
  if (query.isError) return <ErrorState message={query.error?.message} onRetry={() => void query.refetch()} />

  const products = query.data?.products || []
  if (!products.length) return <div className="state-box"><h3>{emptyMessage}</h3><p>Try another search or browse a category.</p></div>

  return <div className="product-grid">{products.map(product => <ProductCard key={product.id} product={product} />)}</div>
}

function ProductSkeleton() {
  return <div className="product-card skeleton" aria-hidden="true"><div /><span /><span /></div>
}
