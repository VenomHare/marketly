import { Star } from 'lucide-react'
import { Link } from 'react-router-dom'
import { formatMoney } from '../../utils/format-money'
import type { Product } from '../../features/catalog/types'
import { ProductImage } from './ProductImage'

export function ProductCard({ product }: { product: Product }) {
  return <article className="product-card">
    <Link to={`/product/${product.id}`} className="product-link">
      <ProductImage product={product} className="product-image" />
      <h3>{product.name}</h3>
    </Link>
    <p className="rating">
      <Star size={14} fill="currentColor" aria-hidden="true" />
      {Number(product.average_rating || 0).toFixed(1)}
      <span>({product.review_count || 0})</span>
    </p>
    <p className="price">{formatMoney(product.price)}</p>
    {product.stock === 0 && <p className="unavailable">Currently unavailable</p>}
    <Link className="button primary small" to={`/product/${product.id}`}>View item</Link>
  </article>
}
