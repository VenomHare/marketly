import puppeteer from "puppeteer";

const escapeHtml = (value: unknown) => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");

type InvoiceItem = {
  product_name: string;
  sku: string;
  quantity: number;
  unit_price_paise: number;
  discount_paise: number;
  line_total_paise: number;
};

type CustomerInvoice = {
  invoiceNumber: string;
  orderId: string;
  date: Date;
  status: string;
  address: Record<string, string | undefined>;
  items: InvoiceItem[];
  subtotalPaise: number;
  discountPaise: number;
  shippingPaise: number;
  totalPaise: number;
};

const invoiceMoney = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const invoiceDate = (date: Date) => new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(date);

/** Render an invoice as a styled HTML document, then print it to PDF with Chromium. */
export async function createInvoicePdf(invoice: CustomerInvoice) {
  const addressLines = [
    invoice.address.first_line,
    invoice.address.second_line,
    [invoice.address.city, invoice.address.state, invoice.address.postal_code].filter(Boolean).join(", "),
    invoice.address.country,
    invoice.address.contact_number ? `Phone: ${invoice.address.contact_number}` : undefined,
  ].filter(Boolean);
  const rows = invoice.items.map((item) => `<tr>
    <td><strong>${escapeHtml(item.product_name)}</strong><small>SKU ${escapeHtml(item.sku)}</small></td>
    <td class="number">${item.quantity}</td>
    <td class="number">${invoiceMoney(item.unit_price_paise)}</td>
    <td class="number">${invoiceMoney(item.discount_paise)}</td>
    <td class="number total">${invoiceMoney(item.line_total_paise)}</td>
  </tr>`).join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Marketly Invoice</title><style>
    @page { size: A4; margin: 18mm 16mm 20mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #111827; font: 12px/1.55 Arial, Helvetica, sans-serif; }
    .topline { height: 7px; margin: -18mm -16mm 24px; background: #2563EB; }
    header { display: flex; align-items: flex-start; justify-content: space-between; padding-bottom: 22px; border-bottom: 1px solid #DCE4F1; }
    .brand { color: #0B1220; font-size: 25px; font-weight: 800; letter-spacing: -1.5px; }
    .brand span { color: #2563EB; }
    .brand-note { margin-top: 3px; color: #56657A; font-size: 10px; }
    .invoice-title { color: #0B1220; font-size: 26px; font-weight: 700; text-align: right; letter-spacing: -.5px; }
    .invoice-number { margin-top: 3px; color: #56657A; text-align: right; font-size: 11px; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 22px 0; }
    .card { padding: 13px 15px; border: 1px solid #DCE4F1; border-radius: 8px; background: #F5F8FE; }
    .label { margin-bottom: 6px; color: #56657A; font-size: 9px; font-weight: 700; letter-spacing: .8px; text-transform: uppercase; }
    .value { color: #111827; font-weight: 600; }
    .muted { color: #56657A; font-weight: 400; }
    .section-title { margin: 24px 0 9px; color: #0B1220; font-size: 13px; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; }
    thead { display: table-header-group; }
    th { padding: 10px 8px; color: white; background: #14213D; font-size: 9px; letter-spacing: .4px; text-align: left; text-transform: uppercase; }
    th:first-child { border-radius: 6px 0 0 0; }
    th:last-child { border-radius: 0 6px 0 0; }
    td { padding: 11px 8px; border-bottom: 1px solid #E7ECF4; vertical-align: top; }
    td small { display: block; margin-top: 2px; color: #738097; font-size: 9px; }
    .number { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .total { font-weight: 700; }
    .summary-wrap { display: flex; justify-content: flex-end; margin-top: 14px; }
    .summary { width: 250px; }
    .summary-row { display: flex; justify-content: space-between; padding: 5px 0; color: #56657A; }
    .summary-row span:last-child { color: #111827; font-variant-numeric: tabular-nums; }
    .grand-total { margin-top: 5px; padding: 11px 12px; border-radius: 6px; color: white; background: #14213D; font-size: 14px; font-weight: 700; }
    .grand-total span:last-child { color: white; }
    footer { margin-top: 35px; padding-top: 13px; border-top: 1px solid #DCE4F1; color: #738097; font-size: 9px; text-align: center; }
  </style></head><body><div class="topline"></div>
    <header><div><div class="brand">Marketly<span>.</span></div><div class="brand-note">Your marketplace, made simple.</div></div>
      <div><div class="invoice-title">INVOICE</div><div class="invoice-number">${escapeHtml(invoice.invoiceNumber)}</div></div>
    </header>
    <section class="meta"><div class="card"><div class="label">Billed to</div><div class="value">${escapeHtml(invoice.address.addressee_name || "Customer")}</div>${addressLines.map((line) => `<div class="muted">${escapeHtml(line)}</div>`).join("")}</div>
      <div class="card"><div class="label">Order details</div><div class="value">Order #${escapeHtml(invoice.orderId.slice(-8).toUpperCase())}</div><div class="muted">Invoice date: ${escapeHtml(invoiceDate(invoice.date))}</div><div class="muted">Order status: ${escapeHtml(invoice.status.replace(/_/g, " "))}</div></div>
    </section>
    <div class="section-title">Items in your order</div>
    <table><thead><tr><th style="width:42%">Item</th><th class="number">Qty</th><th class="number">Unit price</th><th class="number">Discount</th><th class="number">Amount</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="summary-wrap"><div class="summary"><div class="summary-row"><span>Subtotal</span><span>${invoiceMoney(invoice.subtotalPaise)}</span></div><div class="summary-row"><span>Discount</span><span>−${invoiceMoney(invoice.discountPaise)}</span></div><div class="summary-row"><span>Shipping</span><span>${invoiceMoney(invoice.shippingPaise)}</span></div><div class="summary-row grand-total"><span>Order total</span><span>${invoiceMoney(invoice.totalPaise)}</span></div></div></div>
    <footer>Thank you for shopping with Marketly.<br>This is a computer-generated invoice.</footer>
  </body></html>`;

  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    return await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
  } finally {
    await browser.close();
  }
}

type SettlementInvoice = {
  invoiceNumber: string;
  settlementId: string;
  vendorOrderId: string;
  orderId: string;
  date: Date;
  status: string;
  vendorName: string;
  vendorId: string;
  businessAddress: string;
  bankDetails: string;
  items: InvoiceItem[];
  grossPaise: number;
  commissionPaise: number;
  commissionReversedPaise: number;
  refundPaise: number;
  netPaise: number;
  transferReference?: string;
  simulatedPayout: boolean;
  releasedAt?: Date;
};

/** Render a seller settlement statement in the same Marketly HTML invoice design. */
export async function createSettlementInvoicePdf(invoice: SettlementInvoice) {
  const rows = invoice.items.map((item) => `<tr>
    <td><strong>${escapeHtml(item.product_name)}</strong><small>SKU ${escapeHtml(item.sku)}</small></td>
    <td class="number">${item.quantity}</td>
    <td class="number">${invoiceMoney(item.unit_price_paise)}</td>
    <td class="number">${invoiceMoney(item.discount_paise)}</td>
    <td class="number total">${invoiceMoney(item.line_total_paise)}</td>
  </tr>`).join("");
  const summaryRows = [
    ["Gross sales", invoice.grossPaise],
    ["Marketly commission", -invoice.commissionPaise],
    ["Commission reversed", invoice.commissionReversedPaise],
    ["Seller refund adjustment", -invoice.refundPaise],
  ].map(([label, amount]) => `<div class="summary-row"><span>${label}</span><span>${invoiceMoney(Number(amount))}</span></div>`).join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Marketly Settlement Invoice</title><style>
    @page { size: A4; margin: 18mm 16mm 20mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #111827; font: 12px/1.55 Arial, Helvetica, sans-serif; }
    .topline { height: 7px; margin: -18mm -16mm 24px; background: #2563EB; }
    header { display: flex; align-items: flex-start; justify-content: space-between; padding-bottom: 22px; border-bottom: 1px solid #DCE4F1; }
    .brand { color: #0B1220; font-size: 25px; font-weight: 800; letter-spacing: -1.5px; }
    .brand span { color: #2563EB; }
    .brand-note { margin-top: 3px; color: #56657A; font-size: 10px; }
    .invoice-title { color: #0B1220; font-size: 26px; font-weight: 700; text-align: right; letter-spacing: -.5px; }
    .invoice-number { margin-top: 3px; color: #56657A; text-align: right; font-size: 11px; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 22px 0; }
    .card { padding: 13px 15px; border: 1px solid #DCE4F1; border-radius: 8px; background: #F5F8FE; }
    .label { margin-bottom: 6px; color: #56657A; font-size: 9px; font-weight: 700; letter-spacing: .8px; text-transform: uppercase; }
    .value { color: #111827; font-weight: 600; }
    .muted { color: #56657A; font-weight: 400; }
    .section-title { margin: 24px 0 9px; color: #0B1220; font-size: 13px; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; }
    thead { display: table-header-group; }
    th { padding: 10px 8px; color: white; background: #14213D; font-size: 9px; letter-spacing: .4px; text-align: left; text-transform: uppercase; }
    th:first-child { border-radius: 6px 0 0 0; }
    th:last-child { border-radius: 0 6px 0 0; }
    td { padding: 11px 8px; border-bottom: 1px solid #E7ECF4; vertical-align: top; }
    td small { display: block; margin-top: 2px; color: #738097; font-size: 9px; }
    .number { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .total { font-weight: 700; }
    .summary-wrap { display: flex; justify-content: flex-end; margin-top: 14px; }
    .summary { width: 270px; }
    .summary-row { display: flex; justify-content: space-between; gap: 12px; padding: 5px 0; color: #56657A; }
    .summary-row span:last-child { color: #111827; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .grand-total { margin-top: 5px; padding: 11px 12px; border-radius: 6px; color: white; background: #14213D; font-size: 14px; font-weight: 700; }
    .grand-total span:last-child { color: white; }
    .note { margin-top: 22px; padding: 12px 14px; border-left: 3px solid #2563EB; background: #F5F8FE; }
    footer { margin-top: 35px; padding-top: 13px; border-top: 1px solid #DCE4F1; color: #738097; font-size: 9px; text-align: center; }
  </style></head><body><div class="topline"></div>
    <header><div><div class="brand">Marketly<span>.</span></div><div class="brand-note">Your marketplace, made simple.</div></div>
      <div><div class="invoice-title">SETTLEMENT</div><div class="invoice-number">${escapeHtml(invoice.invoiceNumber)}</div></div>
    </header>
    <section class="meta"><div class="card"><div class="label">Seller</div><div class="value">${escapeHtml(invoice.vendorName)}</div><div class="muted">Account ${escapeHtml(invoice.vendorId)}</div><div class="muted">${escapeHtml(invoice.businessAddress)}</div><div class="muted">${escapeHtml(invoice.bankDetails)}</div></div>
      <div class="card"><div class="label">Settlement details</div><div class="value">Settlement #${escapeHtml(invoice.settlementId.slice(-8).toUpperCase())}</div><div class="muted">Date: ${escapeHtml(invoiceDate(invoice.date))}</div><div class="muted">Status: ${escapeHtml(invoice.status.replace(/_/g, " "))}</div><div class="muted">Vendor order #${escapeHtml(invoice.vendorOrderId.slice(-8).toUpperCase())}</div><div class="muted">Marketplace order #${escapeHtml(invoice.orderId.slice(-8).toUpperCase())}</div></div></section>
    <div class="section-title">Order items</div>
    <table><thead><tr><th style="width:42%">Item</th><th class="number">Qty</th><th class="number">Unit price</th><th class="number">Discount</th><th class="number">Gross amount</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="summary-wrap"><div class="summary">${summaryRows}<div class="summary-row grand-total"><span>Net settlement</span><span>${invoiceMoney(invoice.netPaise)}</span></div></div></div>
    <div class="note"><div class="label">Payout details</div><div class="value">${invoice.simulatedPayout ? "Simulated payout · no funds were transferred" : invoice.transferReference ? `Transfer reference: ${escapeHtml(invoice.transferReference)}` : "Payout status: " + escapeHtml(invoice.status)}</div>${invoice.releasedAt ? `<div class="muted">Released ${escapeHtml(invoiceDate(invoice.releasedAt))}</div>` : ""}</div>
    <footer>Marketly seller settlement statement. Keep this document for your records.<br>This is a computer-generated document.</footer>
  </body></html>`;

  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    return await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
  } finally {
    await browser.close();
  }
}
