import { Link } from 'react-router-dom'
import { useDocumentTitle } from '../utils/use-document-title'

export function NotFoundPage() {
  useDocumentTitle('Page not found')
  return <section className="not-found">
    <div className="display-number">404</div>
    <h1>Page not found</h1>
    <p>We couldn't find the page you're looking for.</p>
    <Link className="button primary" to="/">Go to Marketly home</Link>
  </section>
}

export function Component() {
  return <NotFoundPage />
}
