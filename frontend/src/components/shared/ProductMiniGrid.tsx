import { Link } from 'react-router-dom'
import type { Product } from '../../features/catalog/types'
import { ProductImage } from './ProductImage'
import { ErrorState } from '../ui/ErrorState'

type Props = {
  products?: Product[]
  isLoading: boolean
  error?: Error | null
  onRetry?: () => void
}

export function ProductMiniGrid({ products = [], isLoading, error, onRetry }: Props) {
  if (isLoading) return <div className="mini-grid">{Array.from({ length: 4 }, (_, index) => <div className="mini-skeleton" key={index} />)}</div>
  if (error) return <ErrorState message={error.message} onRetry={onRetry} />
  if (!products.length) return <p className="muted">No products to show yet.</p>

  return <div className="mini-grid">{products.slice(0, 4).map(product => <Link key={product.id} to={`/product/${product.id}`}>
    <ProductImage product={product} />
    <span>{product.name}</span>
  </Link>)}</div>
}
