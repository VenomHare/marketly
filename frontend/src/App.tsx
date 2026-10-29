import { AppRouter } from './app/router'
import { AuthBootstrap } from './app/AuthBootstrap'
import { AppProviders } from './app/providers'

export default function App() {
  return <AppProviders><AuthBootstrap><AppRouter /></AuthBootstrap></AppProviders>
}
