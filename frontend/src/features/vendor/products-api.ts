import { client } from '../../api/client'

export type ManagedProduct = {
  id: string
  category_id: string
  name: string
  description: string
  sku: string
  price: number
  stock: number
  average_rating: number
  review_count: number
  status: 'draft' | 'active' | 'archived'
  created_at: string
  updated_at: string
}

export type ProductFields = Omit<ManagedProduct, 'id' | 'average_rating' | 'review_count' | 'status' | 'created_at' | 'updated_at'>

type ProductList = {
  products: ManagedProduct[]
  pagination: { page: number; limit: number; total: number; pages: number }
}

export async function getVendorProducts(page: number): Promise<ProductList> {
  const { data } = await client.get<ProductList>(`/vendors/me/products?page=${page}&limit=20`)
  return data
}

export async function createVendorProduct(fields: ProductFields): Promise<ManagedProduct> {
  const { data } = await client.post<ManagedProduct>('/products', fields)
  return data
}

export async function updateVendorProduct(id: string, fields: ProductFields): Promise<ManagedProduct> {
  const { data } = await client.patch<ManagedProduct>(`/products/${id}`, fields)
  return data
}

export async function updateVendorProductStatus(id: string, status: 'draft' | 'active'): Promise<ManagedProduct> {
  const { data } = await client.patch<ManagedProduct>(`/products/${id}/status`, { status })
  return data
}

export async function archiveVendorProduct(id: string): Promise<void> {
  await client.delete(`/products/${id}`)
}
