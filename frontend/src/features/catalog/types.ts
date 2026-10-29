export type ProductImage = {
  object_key: string
  alt_text?: string
  position: number
}

export type Product = {
  id: string
  name: string
  description?: string
  price: number
  stock?: number
  average_rating?: number
  review_count?: number
  status?: string
  vendor_id?: string
  primary_image_key?: string
  images?: ProductImage[]
}

export type Category = {
  id: string
  name: string
  slug?: string
  parent_id?: string
}

export type Vendor = {
  id: string
  display_name: string
  created_at?: string
}

export type Review = {
  id: string
  rating: number
  title?: string
  comment: string
  created_at: string
}

export type SearchResponse = {
  products: Product[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export type ProductListResponse = {
  products: Product[]
  pagination?: { page: number; limit: number; total: number; pages?: number; total_pages?: number }
}

export type CategoryListResponse = {
  categories: Category[]
}

export type ReviewListResponse = {
  reviews: Review[]
  pagination?: { page: number; limit: number; total: number; pages: number }
}
