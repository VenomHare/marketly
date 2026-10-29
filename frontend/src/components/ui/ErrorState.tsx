type Props = {
  message?: string
  onRetry?: () => void
}

export function ErrorState({ message = 'Something went wrong. Please try again.', onRetry }: Props) {
  return <div className="state-box" role="alert">
    <p>{message}</p>
    {onRetry && <button className="button neutral" onClick={onRetry}>Retry</button>}
  </div>
}
