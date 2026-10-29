import { useEffect, useState } from 'react'
import { AlertCircle, Check, ImagePlus, LoaderCircle, RefreshCw, UploadCloud, X } from 'lucide-react'
import { client } from '../../api/client'
import { getImageUrl } from '../../utils/image-url'

type UploadPurpose = 'kyc' | 'product'
type UploadTicket = { upload_id: string; upload_url: string; object_key: string; expires_in: number }
type Props = {
  label: string
  purpose: UploadPurpose
  value?: string
  productId?: string
  onChange: (objectKey: string | undefined) => void
  helperText?: string
  disabled?: boolean
}

const MAX_FILE_SIZE = 10 * 1024 * 1024
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export function ImageUploadField({ label, purpose, value, productId, onChange, helperText, disabled = false }: Props) {
  const [previewUrl, setPreviewUrl] = useState<string>()
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [success, setSuccess] = useState(false)

  useEffect(() => () => { if (previewUrl?.startsWith('blob:')) URL.revokeObjectURL(previewUrl) }, [previewUrl])

  async function upload(file?: File) {
    if (!file) return
    setError('')
    setSuccess(false)
    onChange(undefined)
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('Choose a JPEG, PNG, or WebP image.')
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      setError('Choose an image smaller than 10 MB.')
      return
    }
    if (purpose === 'product' && !productId) {
      setError('Save the product before adding images.')
      return
    }

    setPreviewUrl(URL.createObjectURL(file))
    setUploading(true)
    try {
      const request = purpose === 'kyc'
        ? { purpose, content_type: file.type }
        : { purpose, product_id: productId, content_type: file.type }
      const { data: ticket } = await client.post<UploadTicket>('/uploads/presigned-url', request)

      const uploadResponse = await fetch(ticket.upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      })
      if (!uploadResponse.ok) throw new Error('The image could not be uploaded. Please choose it again and retry.')

      const { data: confirmed } = await client.post<{ object_key: string }>('/uploads/confirm', { upload_id: ticket.upload_id })
      onChange(confirmed.object_key)
      setSuccess(true)
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Image upload failed. Please try again.')
      setPreviewUrl(undefined)
    } finally {
      setUploading(false)
    }
  }

  const imageUrl = previewUrl ?? getImageUrl(value)

  return <div className={`image-upload-field ${error ? 'has-error' : ''}`}>
    <div className="image-upload-label-row"><span>{label}</span>{success && <span className="image-upload-complete"><Check size={13} /> Uploaded</span>}</div>
    <div className={`image-upload-dropzone ${imageUrl ? 'has-image' : ''}`}>
      {imageUrl ? <img src={imageUrl} alt={`${label} preview`} className="image-upload-preview" /> : <div className="image-upload-placeholder"><span><ImagePlus size={22} /></span><strong>Choose a clear image</strong><small>JPG, PNG, or WebP · up to 10 MB</small></div>}
      <label className="image-upload-button">
        <input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => { void upload(event.currentTarget.files?.[0]); event.currentTarget.value = '' }} disabled={disabled || uploading} />
        {uploading ? <><LoaderCircle className="vendor-spinner" size={15} /> Uploading</> : imageUrl ? <><RefreshCw size={14} /> Replace image</> : <><UploadCloud size={15} /> Select image</>}
      </label>
      {imageUrl && !uploading && <span className="image-upload-shield" aria-label="Secure upload complete"><Check size={13} /></span>}
    </div>
    {error && <p className="image-upload-error" role="alert"><AlertCircle size={14} /> {error}</p>}
    {!error && helperText && <p className="image-upload-help">{helperText}</p>}
    {value && !success && <button className="image-upload-remove" type="button" onClick={() => { onChange(undefined); setPreviewUrl(undefined); setSuccess(false) }} disabled={disabled}><X size={13} /> Remove image</button>}
  </div>
}


