const publicImageBaseUrl = (import.meta.env.VITE_R2_PUBLIC_BASE_URL || '').replace(/\/$/, '')

export function getImageUrl(objectKey?: string): string | undefined {
  if (!objectKey || !publicImageBaseUrl) return undefined
  return `${publicImageBaseUrl}/${objectKey}`
}
