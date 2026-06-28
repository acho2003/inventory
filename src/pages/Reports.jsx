import { fmt, num } from "../lib/utils.js";
import { Header, PanelTitle } from "../components/common.jsx";

export function Reports({ data }) {
  const reports = data.reports;
  if (!reports) return <><Header title="Reports" /><div className="panel">Loading reports...</div></>;
  return (
    <>
      <Header title="Reports" eyebrow="Audit view" subtitle="Imported manual expense records and recent stock movements." />
      <div className="grid two">
        <div className="panel"><PanelTitle title="Budget Heads" /><div className="table-wrap"><table><thead><tr><th>Budget Head</th><th>Amount</th><th>Status</th></tr></thead><tbody>{data.budgetHeads.map((head) => <tr key={head.id}><td>{head.name}</td><td>{num(head.amount)}</td><td>{head.status || "Active"}</td></tr>)}</tbody></table></div></div>
        <div className="panel"><PanelTitle title="Document Coverage" /><table><tbody><tr><th>Receipts with Challan No</th><td>{num(reports.dashboard.documents.receiptsWithChallan)}</td></tr><tr><th>Receipts with DV No</th><td>{num(reports.dashboard.documents.receiptsWithDv)}</td></tr><tr><th>Receipts with Bill No</th><td>{num(reports.dashboard.documents.receiptsWithBill)}</td></tr></tbody></table></div>
      </div>
      <div className="panel">
        <PanelTitle title="Imported Expense Sample" subtitle="Sample rows from the historical manual expense sheets." />
        <div className="table-wrap">
          <table>
            <thead><tr><th>Bill</th><th>DV</th><th>Challan</th><th>Item</th><th>Qty</th><th>Amount</th><th>Enterprise</th></tr></thead>
            <tbody>{reports.expenses.slice(0, 80).map((e, index) => <tr key={`${e.billNo}-${index}`}><td>{fmt(e.billNo)}</td><td>{fmt(e.dvNo)}</td><td>{fmt(e.challanNo)}</td><td>{fmt(e.itemName)}</td><td>{num(e.quantity)} {fmt(e.unit)}</td><td>{num(e.amount)}</td><td>{fmt(e.enterprise)}</td></tr>)}</tbody>
          </table>
        </div>
      </div>
    </>
  );
}


