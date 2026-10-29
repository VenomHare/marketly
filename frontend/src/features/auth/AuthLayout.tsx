import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

export function AuthLayout({ title, children }: { title: string; children: ReactNode }) {
  return <main className="auth-page">
    <Link to="/" className="wordmark auth-wordmark">Marketly<span>.</span></Link>
    <section className="auth-card"><h1>{title}</h1>{children}</section>
    <footer className="auth-footer"><Link to="/">Marketly home</Link><span>© {new Date().getFullYear()} Marketly</span></footer>
  </main>
}
