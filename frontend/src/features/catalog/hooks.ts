import { useQuery } from '@tanstack/react-query'
import { getCategories, getLatestProducts, getProduct, getProductReviews, getRelatedProducts, getSeller, getSellerProducts, getTrendingProducts, searchProducts } from './api'

export function useCategories() {
  return useQuery({ queryKey: ['categories'], queryFn: getCategories, staleTime: 10 * 60_000 })
}

export function useSearchProducts(search: string, enabled = true) {
  return useQuery({ queryKey: ['search', search], queryFn: () => searchProducts(search), enabled })
}

export function useTrendingProducts(enabled = true) {
  return useQuery({ queryKey: ['trending-products'], queryFn: getTrendingProducts, enabled })
}

export function useLatestProducts(enabled = true) {
  return useQuery({ queryKey: ['latest-products'], queryFn: getLatestProducts, enabled })
}

export function useProduct(productId: string) {
  return useQuery({ queryKey: ['product', productId], queryFn: () => getProduct(productId), enabled: Boolean(productId) })
}

export function useProductReviews(productId: string, enabled = true) {
  return useQuery({ queryKey: ['product-reviews', productId], queryFn: () => getProductReviews(productId), enabled: Boolean(productId) && enabled })
}

export function useRelatedProducts(productId: string, enabled = true) {
  return useQuery({ queryKey: ['related-products', productId], queryFn: () => getRelatedProducts(productId), enabled: Boolean(productId) && enabled })
}

export function useSeller(vendorId: string) {
  return useQuery({ queryKey: ['seller', vendorId], queryFn: () => getSeller(vendorId), enabled: Boolean(vendorId) })
}

export function useSellerProducts(vendorId: string, page = 1) {
  return useQuery({ queryKey: ['seller-products', vendorId, page], queryFn: () => getSellerProducts(vendorId, page), enabled: Boolean(vendorId) })
}
