import { byId } from "./utils.js";

const headers = [
  "Date",
  "Lifecycle",
  "Item",
  "Quantity",
  "Unit",
  "Total Amount",
  "From",
  "To / Location",
  "Challan No",
  "DV No",
  "Bill No",
  "Document",
  "Duty Person",
  "Remarks"
];

function text(value) {
  return value === null || value === undefined ? "" : String(value);
}

function exportRows(events, infrastructures) {
  const infrastructureMap = byId(infrastructures);
  return events.map((event) => [
    text(event.date),
    text(event.lifecycle),
    text(event.itemName),
    Number(event.quantity || 0),
    text(event.unit),
    Number(event.totalAmount || 0),
    text(infrastructureMap[event.fromInfrastructureId]?.name || (event.fromInfrastructureId ? event.fromInfrastructureId : "Store")),
    text(infrastructureMap[event.toInfrastructureId]?.name || (event.toInfrastructureId ? event.toInfrastructureId : "Store")),
    text(event.challanNo),
    text(event.dvNo),
    text(event.billNo),
    text(event.documentNo),
    text(event.dutyPerson),
    text(event.remarks)
  ]);
}

export function ledgerFilterSummary(filters, items, infrastructures) {
  const item = items.find((entry) => entry.id === filters.itemId)?.name || "All items";
  const infrastructure = filters.infrastructureId === "store"
    ? "Store / Not Assigned"
    : infrastructures.find((entry) => entry.id === filters.infrastructureId)?.name || "All locations";
  return [
    `Item: ${item}`,
    `Location: ${infrastructure}`,
    `From: ${filters.dateFrom || "Any"}`,
    `To: ${filters.dateTo || "Any"}`,
    `Search: ${filters.query || "None"}`
  ].join(" | ");
}

function exportDate() {
  return new Date().toISOString().slice(0, 10);
}

export async function downloadLedgerXlsx(events, infrastructures, filterSummary) {
  const { default: writeExcelFile } = await import("write-excel-file/browser");
  const generatedAt = new Date().toLocaleString();
  const titleCell = { value: "Yarju OAP Stock Ledger / Item Trace", fontWeight: "bold", fontSize: 16, textColor: "#17304F", columnSpan: headers.length };
  const metadataCell = { value: `${filterSummary}\nGenerated: ${generatedAt}`, textColor: "#475467", wrap: true, columnSpan: headers.length };
  const headerRow = headers.map((value) => ({ value, fontWeight: "bold", backgroundColor: "#17304F", textColor: "#FFFFFF", wrap: true }));
  const dataRows = exportRows(events, infrastructures).map((row) => row.map((value, index) => ({
    value,
    type: [3, 5].includes(index) ? Number : String,
    format: [3, 5].includes(index) ? "#,##0.00" : undefined,
    wrap: true
  })));
  const columns = [12, 22, 28, 12, 10, 16, 22, 22, 16, 16, 16, 18, 22, 34].map((width) => ({ width }));
  await writeExcelFile([[titleCell], [metadataCell], [], headerRow, ...dataRows], { columns, freezeRows: 4 }).toFile(`stock-ledger-${exportDate()}.xlsx`);
}

export async function downloadLedgerPdf(events, infrastructures, filterSummary) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const document = new jsPDF({ orientation: "landscape", unit: "pt", format: "a3" });
  document.setTextColor(23, 48, 79);
  document.setFontSize(16);
  document.text("Yarju OAP Stock Ledger / Item Trace", 36, 34);
  document.setTextColor(71, 84, 103);
  document.setFontSize(8);
  const metadata = `${filterSummary} | Generated: ${new Date().toLocaleString()}`;
  document.text(document.splitTextToSize(metadata, document.internal.pageSize.getWidth() - 72), 36, 50);
  autoTable(document, {
    startY: 68,
    head: [headers],
    body: exportRows(events, infrastructures),
    theme: "grid",
    margin: { top: 34, right: 24, bottom: 30, left: 24 },
    styles: { fontSize: 6.5, cellPadding: 3, overflow: "linebreak", valign: "top" },
    headStyles: { fillColor: [23, 48, 79], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [247, 249, 252] },
    columnStyles: {
      0: { cellWidth: 48 },
      2: { cellWidth: 72 },
      3: { cellWidth: 40, halign: "right" },
      5: { cellWidth: 52, halign: "right" },
      13: { cellWidth: 92 }
    },
    didDrawPage: () => {
      const pageNumber = document.getNumberOfPages();
      document.setFontSize(7);
      document.setTextColor(102, 112, 133);
      document.text(`Page ${pageNumber}`, document.internal.pageSize.getWidth() - 55, document.internal.pageSize.getHeight() - 14);
    }
  });
  document.save(`stock-ledger-${exportDate()}.pdf`);
}
