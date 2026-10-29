import { useEffect, useState } from 'react'
import { AlertCircle, Check, ImagePlus, LoaderCircle, RefreshCw, UploadCloud, X } from 'lucide-react'
import { client } from '../../api/client'
import { getImageUrl } from '../../utils/image-url'

type UploadPurpose = 'kyc' | 'product'
type UploadTicket = { upload_id: string; upload_url: string; object_key: string; expires_in: number }
export type UploadedProductImage = { id: string; object_key: string; alt_text?: string; position: number }
type Props = {
  label: string
  purpose: UploadPurpose
  value?: string
  productId?: string
  onChange: (objectKey: string | undefined) => void
  onUploaded?: (image: UploadedProductImage) => void
  multiple?: boolean
  helperText?: string
  disabled?: boolean
}

const MAX_FILE_SIZE = 10 * 1024 * 1024
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export function ImageUploadField({ label, purpose, value, productId, onChange, onUploaded, multiple = false, helperText, disabled = false }: Props) {
  const [previewUrl, setPreviewUrl] = useState<string>()
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [uploadProgress, setUploadProgress] = useState('')

  useEffect(() => () => { if (previewUrl?.startsWith('blob:')) URL.revokeObjectURL(previewUrl) }, [previewUrl])

  async function uploadFile(file: File) {
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
      if (purpose === 'product' && productId) {
        const { data: image } = await client.post<UploadedProductImage>(`/products/${productId}/image`, {
          object_key: confirmed.object_key,
          alt_text: label,
        })
        onChange(image.object_key)
        onUploaded?.(image)
      } else {
        onChange(confirmed.object_key)
      }
  }

  async function upload(selection: FileList | null) {
    const files = Array.from(selection ?? [])
    if (!files.length) return

    const validationErrors: string[] = []
    const validFiles = files.filter(file => {
      if (!ALLOWED_TYPES.includes(file.type)) {
        validationErrors.push(`${file.name}: choose a JPEG, PNG, or WebP image.`)
        return false
      }
      if (file.size > MAX_FILE_SIZE) {
        validationErrors.push(`${file.name}: the image must be smaller than 10 MB.`)
        return false
      }
      return true
    })

    if (purpose === 'product' && !productId) {
      setError('Save the product before adding images.')
      return
    }
    if (!validFiles.length) {
      setError(validationErrors.join(' '))
      return
    }

    setError('')
    setSuccess(false)
    if (!multiple) onChange(undefined)
    setUploading(true)
    let uploadedCount = 0
    const failedUploads = [...validationErrors]

    for (const [index, file] of validFiles.entries()) {
      setUploadProgress(`Uploading ${index + 1} of ${validFiles.length}: ${file.name}`)
      setPreviewUrl(URL.createObjectURL(file))
      try {
        await uploadFile(file)
        uploadedCount += 1
      } catch (uploadError) {
        const reason = uploadError instanceof Error ? uploadError.message : 'Upload failed.'
        failedUploads.push(`${file.name}: ${reason}`)
      }
    }

    setSuccess(uploadedCount > 0)
    setUploading(false)
    setUploadProgress('')
    setError(failedUploads.length ? `${uploadedCount} uploaded. ${failedUploads.join(' ')}` : '')
  }

  const imageUrl = previewUrl ?? getImageUrl(value)

  return <div className={`image-upload-field ${error ? 'has-error' : ''}`}>
    <div className="image-upload-label-row"><span>{label}</span>{success && <span className="image-upload-complete"><Check size={13} /> Uploaded</span>}</div>
    <div className={`image-upload-dropzone ${imageUrl ? 'has-image' : ''}`}>
      {imageUrl ? <img src={imageUrl} alt={`${label} preview`} className="image-upload-preview" /> : <div className="image-upload-placeholder"><span><ImagePlus size={22} /></span><strong>Choose a clear image</strong><small>JPG, PNG, or WebP · up to 10 MB</small></div>}
      <label className="image-upload-button">
        <input type="file" accept="image/jpeg,image/png,image/webp" multiple={multiple} onChange={event => { void upload(event.currentTarget.files); event.currentTarget.value = '' }} disabled={disabled || uploading} />
        {uploading ? <><LoaderCircle className="vendor-spinner" size={15} /> Uploading</> : imageUrl ? <><RefreshCw size={14} /> {multiple ? 'Add images' : 'Replace image'}</> : <><UploadCloud size={15} /> {multiple ? 'Select images' : 'Select image'}</>}
      </label>
      {imageUrl && !uploading && <span className="image-upload-shield" aria-label="Secure upload complete"><Check size={13} /></span>}
    </div>
    {uploadProgress && <p className="image-upload-progress" aria-live="polite"><LoaderCircle className="vendor-spinner" size={13} /> {uploadProgress}</p>}
    {error && <p className="image-upload-error" role="alert"><AlertCircle size={14} /> {error}</p>}
    {!error && helperText && <p className="image-upload-help">{helperText}</p>}
    {value && !success && <button className="image-upload-remove" type="button" onClick={() => { onChange(undefined); setPreviewUrl(undefined); setSuccess(false) }} disabled={disabled}><X size={13} /> Remove image</button>}
  </div>
}


