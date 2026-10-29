import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Archive, ArrowLeft, Check, ChevronLeft, ChevronRight, CirclePlus, Edit3, Package, RefreshCw, Search, X } from 'lucide-react'
import { Link, Navigate } from 'react-router-dom'
import { client } from '../../api/client'
import type { AuthUser } from '../../api/auth-storage'
import { ImageUploadField, type UploadedProductImage } from '../../components/shared/ImageUploadField'
import { useCategories } from '../catalog/hooks'
import { formatMoney } from '../../utils/format-money'
import { getImageUrl } from '../../utils/image-url'
import { useDocumentTitle } from '../../utils/use-document-title'
import { archiveVendorProduct, createVendorProduct, getVendorProducts, removeVendorProductImage, updateVendorProduct, updateVendorProductStatus, type ManagedProduct, type ProductFields } from './products-api'

type ProductStatus = 'all' | 'active' | 'draft' | 'archived'
function messageFrom(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = error.response
    if (typeof response === 'object' && response !== null && 'data' in response) {
      const data = response.data
      if (typeof data === 'object' && data !== null && 'message' in data && typeof data.message === 'string') {
        if (data.message === 'SKU already exists') return 'That SKU is already in use. Choose a unique SKU.'
        if (data.message === 'Invalid category') return 'Choose a category that is still available.'
        if (data.message.includes('verified')) return 'Your seller account must pass verification before you can make changes.'
        return data.message
      }
    }
  }
  return 'We could not complete that request. Please try again.'
}

export function VendorProductsPage() {
  useDocumentTitle('Manage products')
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState<ProductStatus>('all')
  const [search, setSearch] = useState('')
  const [editor, setEditor] = useState<'create' | ManagedProduct | null>(null)
  const [formError, setFormError] = useState('')

  const me = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => (await client.get<AuthUser>('/me')).data,
    staleTime: 30_000,
    gcTime: 120_000,
    retry: false,
  })
  const isVendor = me.data?.role === 'vendor' && me.data.status === 'active' && Boolean(me.data.vendor)
  const canManage = isVendor && me.data?.vendor?.kyc_status === 'verified'
  const products = useQuery({
    queryKey: ['vendor-products', me.data?.id, page],
    queryFn: () => getVendorProducts(page),
    enabled: isVendor,
    staleTime: 15_000,
    retry: false,
  })
  const categories = useCategories()

  const refreshProducts = async () => {
    await queryClient.invalidateQueries({ queryKey: ['vendor-products', me.data?.id] })
    await queryClient.invalidateQueries({ queryKey: ['vendor', 'dashboard', me.data?.id] })
  }
  const createMutation = useMutation({ mutationFn: createVendorProduct, onSuccess: async created => { await refreshProducts(); setEditor({ ...created, images: [] }) } })
  const updateMutation = useMutation({ mutationFn: ({ id, fields }: { id: string; fields: ProductFields }) => updateVendorProduct(id, fields), onSuccess: async updated => { await refreshProducts(); setEditor(current => current && current !== 'create' ? { ...updated, images: current.images ?? [] } : current) } })
  const statusMutation = useMutation({ mutationFn: ({ id, status: nextStatus }: { id: string; status: 'draft' | 'active' }) => updateVendorProductStatus(id, nextStatus), onSuccess: refreshProducts })
  const archiveMutation = useMutation({ mutationFn: archiveVendorProduct, onSuccess: refreshProducts })
  const removeImageMutation = useMutation({ mutationFn: ({ productId, imageId }: { productId: string; imageId: string }) => removeVendorProductImage(productId, imageId), onSuccess: async (_, variables) => { await refreshProducts(); setEditor(current => current && current !== 'create' ? { ...current, images: (current.images ?? []).filter(image => image.id !== variables.imageId) } : current) } })
  const mutationError = createMutation.error || updateMutation.error || statusMutation.error || archiveMutation.error || removeImageMutation.error
  const busy = createMutation.isPending || updateMutation.isPending || statusMutation.isPending || archiveMutation.isPending || removeImageMutation.isPending

  const visibleProducts = useMemo(() => (products.data?.products ?? []).filter(product => {
    const matchesStatus = status === 'all' || product.status === status
    const query = search.trim().toLowerCase()
    return matchesStatus && (!query || `${product.name} ${product.sku}`.toLowerCase().includes(query))
  }), [products.data?.products, search, status])

  if (me.isPending) return <section className="vendor-products-page"><div className="vendor-products-loading skeleton" /></section>
  if (me.isError || !isVendor) return <Navigate to="/" replace />

  function submitProduct(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError('')
    const form = new FormData(event.currentTarget)
    const priceInRupees = Number(form.get('price'))
    const fields: ProductFields = {
      category_id: String(form.get('category_id') ?? ''),
      name: String(form.get('name') ?? '').trim(),
      description: String(form.get('description') ?? '').trim(),
      sku: String(form.get('sku') ?? '').trim(),
      price: Math.round(priceInRupees * 100),
      stock: Number(form.get('stock')),
    }
    if (!fields.category_id || !fields.name || !fields.description || !fields.sku || !Number.isFinite(priceInRupees) || priceInRupees <= 0 || !Number.isSafeInteger(fields.price) || !Number.isInteger(fields.stock) || fields.stock < 0) {
      setFormError('Complete every field. Price must be greater than zero and stock must be a whole number of zero or more.')
      return
    }
    if (editor !== 'create' && editor) updateMutation.mutate({ id: editor.id, fields })
    else createMutation.mutate(fields)
  }

  const counts = products.data?.pagination.total ?? 0

  return <section className="vendor-products-page">
    <div className="vendor-products-top"><Link className="vendor-products-back" to="/vendor/dashboard"><ArrowLeft size={16} /> Seller dashboard</Link><span className="vendor-eyebrow">SELLER SPACE</span></div>
    <div className="vendor-products-heading"><div><h1>Manage products</h1><p>Keep your catalog accurate and ready for customers.</p></div><button className="button primary" onClick={() => { setFormError(''); setEditor('create') }} disabled={!canManage}><CirclePlus size={17} /> Add product</button></div>
    {!canManage && <div className="vendor-products-notice" role="status"><Package size={18} /><div><strong>Product changes are locked until verification.</strong><p>You can review your catalog while your seller verification is pending.</p></div></div>}
    {mutationError && <div className="vendor-products-error" role="alert"><span>{messageFrom(mutationError)}</span><button aria-label="Dismiss error" onClick={() => { createMutation.reset(); updateMutation.reset(); statusMutation.reset(); archiveMutation.reset(); removeImageMutation.reset() }}><X size={16} /></button></div>}
    <div className="vendor-products-toolbar"><label className="vendor-products-search"><Search size={17} /><input aria-label="Search your products" placeholder="Search name or SKU" value={search} onChange={event => setSearch(event.target.value)} /></label><div className="vendor-products-filters" role="group" aria-label="Filter by product status">{(['all', 'active', 'draft', 'archived'] as const).map(filter => <button key={filter} className={status === filter ? 'selected' : ''} onClick={() => setStatus(filter)}>{filter === 'all' ? 'All products' : filter[0]?.toUpperCase() + filter.slice(1)}</button>)}</div></div>
    {products.isPending && <div className="vendor-products-loading skeleton" />}
    {products.isError && <div className="vendor-products-empty" role="alert"><p>We couldn’t load your products.</p><button className="button neutral" onClick={() => void products.refetch()}><RefreshCw size={15} /> Try again</button></div>}
    {products.data && <>
      <div className="vendor-products-count">{counts.toLocaleString('en-IN')} products in your catalog</div>
      {visibleProducts.length === 0 ? <div className="vendor-products-empty"><Package size={28} /><h2>{search || status !== 'all' ? 'No matching products' : 'Your catalog is ready for its first product'}</h2><p>{search || status !== 'all' ? 'Try a different search or status filter.' : 'Add a product to start building your store.'}</p>{!search && status === 'all' && <button className="button primary" onClick={() => { setFormError(''); setEditor('create') }} disabled={!canManage}><CirclePlus size={16} /> Add your first product</button>}</div> : <div className="vendor-products-table-wrap"><table className="vendor-products-table"><thead><tr><th>Product</th><th>SKU</th><th>Price</th><th>Stock</th><th>Images</th><th>Status</th><th><span className="visually-hidden">Actions</span></th></tr></thead><tbody>{visibleProducts.map(product => {
        const imageCount = product.images?.length ?? 0
        return <tr key={product.id}>
        <td><strong>{product.name}</strong><small>{categories.data?.categories.find(category => category.id === product.category_id)?.name ?? 'Category'}</small></td><td className="vendor-product-sku">{product.sku}</td><td>{formatMoney(product.price)}</td><td>{product.stock.toLocaleString('en-IN')}{product.stock < 5 && product.status === 'active' && <small className="low-stock">Low stock</small>}</td><td><span className={`product-image-count ${imageCount >= 3 ? 'complete' : ''}`}>{imageCount} / 3</span></td><td><span className={`product-status ${product.status}`}>{product.status}</span></td>
        <td><div className="vendor-product-actions"><button title="Edit product" aria-label={`Edit ${product.name}`} onClick={() => { setFormError(''); setEditor({ ...product, images: product.images ?? [] }) }} disabled={!canManage || product.status === 'archived'}><Edit3 size={16} /></button>{product.status === 'draft' ? <button title={imageCount < 3 ? 'Add at least 3 images before publishing' : 'Publish product'} aria-label={`Publish ${product.name}`} onClick={() => statusMutation.mutate({ id: product.id, status: 'active' })} disabled={!canManage || busy || imageCount < 3}><Check size={17} /></button> : product.status === 'active' ? <button title="Move to drafts" aria-label={`Move ${product.name} to drafts`} onClick={() => statusMutation.mutate({ id: product.id, status: 'draft' })} disabled={!canManage || busy}><X size={17} /></button> : null}{product.status !== 'archived' && <button title="Archive product" aria-label={`Archive ${product.name}`} onClick={() => { if (window.confirm(`Archive “${product.name}”? It will no longer appear in your catalog.`)) archiveMutation.mutate(product.id) }} disabled={!canManage || busy}><Archive size={16} /></button>}</div></td>
      </tr>})}</tbody></table></div>}
      {products.data.pagination.pages > 1 && <nav className="vendor-products-pagination" aria-label="Product pages"><button className="button neutral small" onClick={() => setPage(current => Math.max(1, current - 1))} disabled={page <= 1}><ChevronLeft size={15} /> Previous</button><span>Page {products.data.pagination.page} of {products.data.pagination.pages}</span><button className="button neutral small" onClick={() => setPage(current => Math.min(products.data!.pagination.pages, current + 1))} disabled={page >= products.data.pagination.pages}>Next <ChevronRight size={15} /></button></nav>}
    </>}

    {editor && <div className="vendor-product-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busy) setEditor(null) }}><section className="vendor-product-modal" role="dialog" aria-modal="true" aria-labelledby="product-editor-title"><div className="vendor-product-modal-head"><div><span className="vendor-eyebrow">PRODUCT DETAILS</span><h2 id="product-editor-title">{editor === 'create' ? 'Add a product' : 'Edit product'}</h2></div><button className="vendor-product-modal-close" aria-label="Close" onClick={() => setEditor(null)} disabled={busy}><X size={19} /></button></div><form onSubmit={submitProduct} className="vendor-product-form">
      <label className="vendor-field">Product name<input name="name" maxLength={200} required defaultValue={editor === 'create' ? '' : editor.name} /></label>
      <label className="vendor-field">Category<select name="category_id" required defaultValue={editor === 'create' ? '' : editor.category_id}><option value="" disabled>Select category</option>{categories.data?.categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
      <label className="vendor-field">Description<textarea name="description" maxLength={10000} rows={4} required defaultValue={editor === 'create' ? '' : editor.description} /></label>
      <div className="vendor-product-form-row"><label className="vendor-field">SKU<input name="sku" maxLength={100} required defaultValue={editor === 'create' ? '' : editor.sku} /></label><label className="vendor-field">Price (₹)<input name="price" type="number" min="0.01" step="0.01" required defaultValue={editor === 'create' ? '' : (editor.price / 100).toFixed(2)} /></label></div>
      <label className="vendor-field">Stock quantity<input name="stock" type="number" min="0" step="1" required defaultValue={editor === 'create' ? '0' : editor.stock} /></label>
      {editor !== 'create' && <section className="vendor-product-image-manager"><div className="vendor-product-image-heading"><div><strong>Product images</strong><p>Add at least 3 clear images before publishing.</p></div><span className={(editor.images?.length ?? 0) >= 3 ? 'complete' : ''}>{editor.images?.length ?? 0} / 3</span></div><div className="vendor-product-image-list">{editor.images?.map(image => <div className="vendor-product-image-item" key={image.id}><img src={getImageUrl(image.object_key)} alt={image.alt_text || `${editor.name} product`} /><button type="button" aria-label="Remove product image" title={editor.status === 'active' && (editor.images?.length ?? 0) <= 3 ? 'Active products must keep at least 3 images' : 'Remove image'} disabled={busy || (editor.status === 'active' && (editor.images?.length ?? 0) <= 3)} onClick={() => removeImageMutation.mutate({ productId: editor.id, imageId: image.id })}><X size={14} /></button></div>)}</div><ImageUploadField label="Add product images" purpose="product" productId={editor.id} multiple onChange={() => undefined} onUploaded={(image: UploadedProductImage) => { setEditor(current => current && current !== 'create' ? { ...current, images: [...(current.images ?? []), image] } : current); void refreshProducts() }} helperText="Choose several images at once. They’ll upload one by one." disabled={!canManage || busy} /></section>}
      {formError && <p className="vendor-form-error" role="alert">{formError}</p>}
      {(createMutation.error || updateMutation.error) && <p className="vendor-form-error" role="alert">{messageFrom(createMutation.error || updateMutation.error)}</p>}
      <div className="vendor-product-form-actions"><button type="button" className="button neutral" onClick={() => setEditor(null)} disabled={busy}>Cancel</button><button type="submit" className="button primary" disabled={busy || categories.isPending || !canManage}>{busy ? 'Saving…' : editor === 'create' ? 'Save as draft' : 'Save changes'}</button></div>
      <p className="vendor-product-form-note">New products start as drafts. Publish them from the catalog when they’re ready.</p>
    </form></section></div>}
  </section>
}

export function Component() { return <VendorProductsPage /> }
