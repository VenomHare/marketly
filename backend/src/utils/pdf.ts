const clean = (value: unknown) => String(value ?? "—")
  .normalize("NFKD")
  .replace(/[₹]/g, "Rs.")
  .replace(/[^\x20-\x7E]/g, "")
  .replace(/[\\()]/g, (char) => `\\${char}`);

/** Small dependency-free PDF writer for downloadable transaction documents. */
export function createDocumentPdf(title: string, subtitle: string, rows: string[]) {
  const lines = [`MARKETLY  /  ${title.toUpperCase()}`, subtitle, "", ...rows.map(clean)];
  const pageLines: string[][] = [];
  while (lines.length) pageLines.push(lines.splice(0, 48));
  if (!pageLines.length) pageLines.push([]);

  const objects: string[] = ["<< /Type /Catalog /Pages 2 0 R >>", "", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
  const pageRefs: number[] = [];
  for (const page of pageLines) {
    const pageObject = objects.length + 1;
    const contentObject = pageObject + 1;
    pageRefs.push(pageObject);
    const commands = ["BT", "/F1 10 Tf", "48 752 Td", ...page.map((line, index) => `${index === 0 ? "" : "0 -14 Td "}(${line.slice(0, 110)}) Tj`), "ET"].join("\n");
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObject} 0 R >>`);
    objects.push(`<< /Length ${new TextEncoder().encode(commands).length} >>\nstream\n${commands}\nendstream`);
  }
  objects[1] = `<< /Type /Pages /Kids [${pageRefs.map((ref) => `${ref} 0 R`).join(" ")}] /Count ${pageRefs.length} >>`;

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(new TextEncoder().encode(pdf).length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = new TextEncoder().encode(pdf).length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, "ascii");
}

export const pdfMoney = (paise: number) => `Rs. ${(paise / 100).toFixed(2)}`;
