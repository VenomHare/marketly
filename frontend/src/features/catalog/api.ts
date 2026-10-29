import { getData } from '../../api/client'
import type { CategoryListResponse, Product, ProductListResponse, ReviewListResponse, SearchResponse, Vendor } from './types'

export function getCategories(): Promise<CategoryListResponse> {
  return getData('/categories')
}

export function searchProducts(search: string): Promise<SearchResponse> {
  const query = search || 'limit=20'
  return getData(`/search/products?${query}`)
}

export function getTrendingProducts(): Promise<ProductListResponse> {
  return getData('/search/trending?limit=12')
}

export function getLatestProducts(): Promise<SearchResponse> {
  return getData('/search/products?sortBy=created_at&order=desc&limit=8')
}

export function getProduct(productId: string): Promise<Product> {
  return getData(`/products/${productId}`)
}

export function getRelatedProducts(productId: string): Promise<ProductListResponse> {
  return getData(`/products/${productId}/related?limit=8`)
}

export function getProductReviews(productId: string): Promise<ReviewListResponse> {
  return getData(`/products/${productId}/reviews?page=1&limit=10`)
}

export function getSeller(vendorId: string): Promise<Vendor> {
  return getData(`/vendors/${vendorId}`)
}

export function getSellerProducts(vendorId: string, page: number): Promise<ProductListResponse> {
  return getData(`/vendors/${vendorId}/products?page=${page}&limit=20`)
}
