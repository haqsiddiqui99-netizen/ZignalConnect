import { formatInr } from "@/lib/format";
import { gstIncluded, inrWords } from "@/lib/tax";

export type ReceiptDoc = {
  title: string;
  status: string;
  number: string;
  when: string;
  logo: string;
  showLogo: boolean;
  sellerName: string;
  sellerLines: string[];
  buyerName: string;
  buyerLines: string[];
  place: string;
  lines: { description: string; sac: string; amount: number }[];
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
  gstMode: "none" | "cgst" | "igst";
  method: string;
  reference: string;
  period: string;
  note: string;
};

const CSS = `
.receipt { max-width: 820px; margin: 0 auto; background: #fffdf8; color: #1c1916; border: 1px solid #e4dcd0; padding: 28px; }
.receipt-top, .receipt-parties { display: flex; justify-content: space-between; gap: 24px; }
.receipt-top { align-items: flex-start; border-bottom: 1px solid #e4dcd0; padding-bottom: 16px; }
.receipt-brand { display: flex; gap: 14px; align-items: flex-start; }
.receipt-logo { width: 56px; height: 56px; border-radius: 8px; background: #14261e; color: #f6f1e8; display: grid; place-items: center; font-weight: 650; letter-spacing: 0.04em; flex: none; }
.receipt h1 { font-family: Georgia, Palatino, serif; font-size: 28px; margin: 0 0 4px; font-weight: 500; }
.receipt h2 { font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase; margin: 0 0 6px; color: #6f675e; font-weight: 650; }
.receipt p { margin: 0; }
.receipt-meta { text-align: right; }
.receipt-meta strong { display: block; font-size: 18px; }
.receipt-parties { padding: 16px 0; }
.receipt-parties div { flex: 1; }
.receipt table { width: 100%; border-collapse: collapse; }
.receipt th, .receipt td { text-align: left; padding: 8px 0; border-bottom: 1px solid #e4dcd0; vertical-align: top; }
.receipt th { font-size: 12px; letter-spacing: 0.06em; text-transform: uppercase; color: #6f675e; }
.receipt .num { text-align: right; white-space: nowrap; }
.receipt-totals { width: 280px; margin-left: auto; margin-top: 8px; }
.receipt-totals td { border-bottom: none; padding: 3px 0; }
.receipt-totals tr.grand td { border-top: 1px solid #1c1916; font-size: 18px; padding-top: 8px; }
.receipt-foot { margin-top: 16px; color: #6f675e; font-size: 13px; }
.receipt-note { margin-top: 8px; }
@media print { body { background: white; } .receipt { border: none; } }
`;

function scaleLines(lines: ReceiptDoc["lines"], target: number) {
  const gross = lines.reduce((sum, line) => sum + line.amount, 0);
  if (gross === 0 || gross === target) return lines;
  let used = 0;
  return lines.map((line, index) => {
    const amount = index === lines.length - 1 ? target - used : Math.round((line.amount * target) / gross);
    used += amount;
    return { ...line, amount };
  });
}

function withGst(doc: ReceiptDoc): ReceiptDoc {
  const taxLine = /^(tax |cgst |sgst |igst )/i;
  const taxLines = doc.lines.filter((line) => taxLine.test(line.description));
  const goods = doc.lines.filter((line) => !taxLine.test(line.description));
  const recorded = doc.cgst + doc.sgst + doc.igst;
  if (recorded > 0) {
    const cgst = gstIncluded(doc.total).cgst;
    return { ...doc, lines: goods.length ? goods : doc.lines, taxable: gstIncluded(doc.total).taxable, cgst, sgst: cgst, igst: 0, gstMode: "cgst" };
  }
  const base = goods.length ? goods : doc.lines;
  const goodsSum = base.reduce((sum, line) => sum + line.amount, 0);
  const included = gstIncluded(doc.total);
  if (taxLines.length > 0 && Math.abs(goodsSum - included.taxable) <= 1) {
    return { ...doc, lines: base, taxable: goodsSum, cgst: included.cgst, sgst: included.sgst, igst: 0, gstMode: "cgst" };
  }
  if (taxLines.length > 0) {
    const tax = taxLines.reduce((sum, line) => sum + line.amount, 0);
    const cgst = gstIncluded(doc.total).cgst;
    return { ...doc, lines: base, taxable: gstIncluded(doc.total).taxable, cgst, sgst: cgst, igst: 0, gstMode: "cgst" };
  }
  return {
    ...doc,
    lines: scaleLines(base, included.taxable),
    taxable: included.taxable,
    cgst: included.cgst,
    sgst: included.sgst,
    igst: 0,
    gstMode: "cgst",
  };
}

export function ReceiptSheet({ doc }: { doc: ReceiptDoc }) {
  doc = withGst(doc);
  return (
    <article className="receipt">
      <style>{CSS}</style>
      <header className="receipt-top">
        <div className="receipt-brand">
          {doc.showLogo ? <div className="receipt-logo">{doc.logo}</div> : null}
          <div>
            <h1>{doc.sellerName}</h1>
            {doc.sellerLines.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        </div>
        <div className="receipt-meta">
          <strong>{doc.title}</strong>
          <p>{doc.number}</p>
          <p>{doc.when}</p>
          <p>{doc.status}</p>
        </div>
      </header>
      <section className="receipt-parties">
        <div>
          <h2>Billed to</h2>
          <p>
            <strong>{doc.buyerName}</strong>
          </p>
          {doc.buyerLines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
        <div className="receipt-meta">
          <h2>Place of supply</h2>
          <p>{doc.place || "Not set"}</p>
          <p>{doc.period}</p>
        </div>
      </section>
      <table>
        <thead>
          <tr>
            <th>Description</th>
            <th>SAC</th>
            <th className="num">Amount</th>
          </tr>
        </thead>
        <tbody>
          {doc.lines.map((line) => (
            <tr key={line.description}>
              <td>{line.description}</td>
              <td>{line.sac}</td>
              <td className="num">{formatInr(line.amount, 2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <table className="receipt-totals">
        <tbody>
          <tr>
            <td>Taxable value</td>
            <td className="num">{formatInr(doc.taxable, 2)}</td>
          </tr>
          {doc.gstMode === "cgst" ? (
            <>
              <tr>
                <td>CGST 9%</td>
                <td className="num">{formatInr(doc.cgst, 2)}</td>
              </tr>
              <tr>
                <td>SGST 9%</td>
                <td className="num">{formatInr(doc.sgst, 2)}</td>
              </tr>
            </>
          ) : null}
          <tr className="grand">
            <td>Total</td>
            <td className="num">{formatInr(doc.total, 2)}</td>
          </tr>
        </tbody>
      </table>
      <p className="receipt-note">{inrWords(doc.total)}</p>
      <p className="receipt-note">
        {doc.method ? `Paid by ${doc.method}` : "Payment not recorded"}
        {doc.reference ? ` · ${doc.reference}` : ""}
      </p>
      {doc.note ? <p className="receipt-note">{doc.note}</p> : null}
      <p className="receipt-foot">
        This document comes from the Zignal Connect ledger. Saving it does not charge a bank or a card.
      </p>
    </article>
  );
}
