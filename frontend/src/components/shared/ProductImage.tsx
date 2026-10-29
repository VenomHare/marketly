import { ImageOff } from 'lucide-react'
import { getImageUrl } from '../../utils/image-url'
import type { Product } from '../../features/catalog/types'

type Props = {
  product: Product
  className?: string
}

export function ProductImage({ product, className = '' }: Props) {
  const primaryImage = product.primary_image_key
    ? { object_key: product.primary_image_key, alt_text: product.name }
    : [...(product.images || [])].sort((first, second) => first.position - second.position)[0]
  const imageUrl = getImageUrl(primaryImage?.object_key)

  if (!imageUrl) {
    return <div className={`missing-image ${className}`} aria-label={`No image available for ${product.name}`}>
      <ImageOff size={22} aria-hidden="true" />
    </div>
  }

  return <img
    className={className}
    src={imageUrl}
    alt={primaryImage?.alt_text || product.name}
    loading="lazy"
    decoding="async"
  />
}
