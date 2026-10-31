import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { MinimalLayout } from '../components/layout/MinimalLayout'
import { StoreLayout } from '../components/layout/StoreLayout'
import { VendorPageLoading } from '../components/ui/VendorPageLoading'

function RouteErrorPage() {
  return <main className="not-found"><h1>This page couldn’t load</h1><a className="button neutral" href="/">Return to Marketly</a></main>
}

const router = createBrowserRouter([
  {
    element: <StoreLayout />,
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, lazy: () => import('../pages/HomePage') },
      { path: 'search', lazy: () => import('../pages/SearchPage') },
      { path: 'category/:slug', lazy: () => import('../pages/SearchPage') },
      { path: 'product/:productId', lazy: () => import('../pages/ProductPage') },
      { path: 'seller/:vendorId', lazy: () => import('../pages/SellerPage') },
      { path: 'cart', lazy: () => import('../features/cart/CartPage') },
      { path: 'checkout', lazy: () => import('../features/checkout/CheckoutPage') },
      { path: 'account', lazy: () => import('../features/account/AccountPage') },
      { path: 'account/orders', lazy: () => import('../features/account/AccountPage') },
      { path: 'vendor/apply', lazy: () => import('../features/vendor/ApplyVendorPage'), hydrateFallbackElement: <VendorPageLoading /> },
      { path: 'vendor/dashboard', lazy: () => import('../features/vendor/VendorDashboardPage'), hydrateFallbackElement: <VendorPageLoading /> },
      { path: 'vendor/products', lazy: () => import('../features/vendor/VendorProductsPage'), hydrateFallbackElement: <VendorPageLoading /> },
      { path: 'vendor/orders', lazy: () => import('../features/vendor/VendorOrdersPage'), hydrateFallbackElement: <VendorPageLoading /> },
      { path: 'vendor/kyc', lazy: () => import('../features/vendor/VendorKycPage'), hydrateFallbackElement: <VendorPageLoading /> },
      { path: '*', lazy: () => import('../pages/NotFoundPage') },
    ],
  },
  {
    path: 'admin',
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, lazy: () => import('../features/admin/AdminDashboardPage') },
      { path: ':section', lazy: () => import('../features/admin/AdminDashboardPage') },
    ],
  },
  {
    element: <MinimalLayout />,
    errorElement: <RouteErrorPage />,
    children: [
      { path: 'login', lazy: () => import('../features/auth/LoginPage') },
      { path: 'register', lazy: () => import('../features/auth/RegisterPage') },
    ],
  },
])

export function AppRouter() {
  return <RouterProvider router={router} />
}
