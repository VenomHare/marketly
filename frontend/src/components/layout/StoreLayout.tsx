import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { StoreFooter } from './StoreFooter'
import { StoreHeader } from './StoreHeader'

export function StoreLayout() {
  const location = useLocation()

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [location.pathname])

  return <div className="app-shell">
    <StoreHeader />
    <main><Outlet /></main>
    <StoreFooter />
  </div>
}
