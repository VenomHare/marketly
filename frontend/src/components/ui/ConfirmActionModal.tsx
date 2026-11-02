import { useEffect, useRef } from 'react'
import { AlertTriangle } from 'lucide-react'

type Props = {
  title: string
  description: string
  confirmLabel?: string
  tone?: 'danger' | 'primary'
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmActionModal({ title, description, confirmLabel = 'Continue', tone = 'danger', busy = false, onConfirm, onCancel }: Props) {
  const confirmButton = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    confirmButton.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onCancel() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [busy, onCancel])

  return <div className="confirm-action-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onCancel() }}>
    <section className="confirm-action-modal" role="alertdialog" aria-modal="true" aria-labelledby="confirm-action-title" aria-describedby="confirm-action-description">
      <span className="confirm-action-icon"><AlertTriangle size={20} /></span>
      <h2 id="confirm-action-title">{title}</h2>
      <p id="confirm-action-description">{description}</p>
      <div className="confirm-action-buttons">
        <button type="button" className="button neutral" onClick={onCancel} disabled={busy}>Cancel</button>
        <button ref={confirmButton} type="button" className={`button ${tone}`} onClick={onConfirm} disabled={busy}>{busy ? 'Working…' : confirmLabel}</button>
      </div>
    </section>
  </div>
}
