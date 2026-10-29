const sessionStorageKey = 'bz_session_id'

export function getGuestSessionId(): string {
  let sessionId = localStorage.getItem(sessionStorageKey)
  if (!sessionId) {
    sessionId = crypto.randomUUID()
    localStorage.setItem(sessionStorageKey, sessionId)
  }
  return sessionId
}
