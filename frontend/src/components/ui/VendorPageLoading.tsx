export function VendorPageLoading() {
  return <div className="vendor-page-loading">
    <div className="skeleton vendor-skeleton-title" />
    <div className="skeleton vendor-skeleton-line" />
    <div className="vendor-metric-grid">
      {Array.from({ length: 4 }, (_, index) => <div className="vendor-metric-skeleton" key={index}>
        <div className="skeleton" /><div className="skeleton" /><div className="skeleton" />
      </div>)}
    </div>
  </div>
}
