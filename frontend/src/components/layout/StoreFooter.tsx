import { Link } from 'react-router-dom'

export function StoreFooter() {
  return <footer>
    <button className="back-top" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>Back to top</button>
    <div className="footer-links">
      <div><h2>Get to know us</h2><span>Find your next favorite thing</span></div>
      <div><h2>Sell with us</h2><Link to="/vendor/apply">Become a seller</Link></div>
      <div><h2>Let us help you</h2><Link to="/account">Your Account</Link><Link to="/account/orders">Your Orders</Link><Link to="/account/addresses">Your Addresses</Link></div>
      <div><h2>Payments</h2><span>UPI, cards and net banking via Razorpay</span></div>
    </div>
    <div className="footer-bottom"><Link to="/" className="wordmark">Marketly<span>.</span></Link><span>© {new Date().getFullYear()} Marketly</span></div>
  </footer>
}
