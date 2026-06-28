import { Plus, Trash2 } from "lucide-react";
import { itemCategories } from "../config/constants.js";
import { num } from "../lib/utils.js";

export function BudgetHeadSelect({ budgetHeads, value, onChange }) {
  const rows = budgetHeads;
  return (
    <select value={value || ""} onChange={(e) => onChange(e.target.value)}>
      <option value="">Select budget head</option>
      {rows.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
    </select>
  );
}



export function InfrastructureSelect({ infrastructures, value, onChange, storeOption = false, required = false }) {
  const rows = infrastructures;
  return (
    <select value={value || ""} onChange={(e) => onChange(e.target.value)} required={required}>
      <option value="">{storeOption ? "Store / Not Assigned" : "Select infrastructure"}</option>
      {rows.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
    </select>
  );
}



export function LineEditor({ items, lines, setLines, receipt = false, arrival = false, inventory = [] }) {
  function update(index, patch) {
    setLines(lines.map((line, i) => i === index ? { ...line, ...patch } : line));
  }
  function matchItem(name) {
    const key = String(name || "").trim().toLowerCase();
    return items.find((item) => item.name.toLowerCase() === key);
  }
  function stockStatsForLine(line) {
    const item = line.itemId ? items.find((entry) => entry.id === line.itemId) : matchItem(line.itemName);
    if (!item) return null;
    const rows = inventory.filter((entry) => entry.itemId === item.id);
    return {
      store: rows.filter((entry) => !entry.infrastructureId).reduce((sum, entry) => sum + Number(entry.balance || 0), 0),
      total: rows.reduce((sum, entry) => sum + Number(entry.balance || 0), 0)
    };
  }
  return (
    <div className="line-section">
      <div className="line-section-head">
        <div>
          <strong>Item lines</strong>
          <span>Material description, quantity, unit, and remarks.</span>
        </div>
        <button type="button" className="soft-button" onClick={() => setLines([...lines, blankLine()])}>
          <Plus size={16} />
          <span>Add item</span>
        </button>
      </div>
      <datalist id="itemOptions">{items.map((item) => <option key={item.id} value={item.name} />)}</datalist>
      <div className="line-editor">
        {lines.map((line, index) => {
          const stockStats = inventory.length ? stockStatsForLine(line) : null;
          return (
          <div className={`line-row ${receipt ? "receipt-line" : ""} ${stockStats ? "stock-line" : ""}`} key={index}>
            <label>Item <input list="itemOptions" value={line.itemName} onChange={(e) => {
              const item = matchItem(e.target.value);
              update(index, {
                itemName: e.target.value,
                itemId: item?.id || line.itemId || "",
                category: item?.category || line.category,
                specification: item?.category || line.specification,
                unit: item?.unit || line.unit
              });
            }} required /></label>
            <label>Category
              <select value={line.category ?? line.specification ?? ""} onChange={(e) => update(index, { category: e.target.value, specification: e.target.value })}>
                <option value="">Select category</option>
                {itemCategories.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            </label>
            <label>Qty <input type="number" step="0.01" min="0.01" value={line.quantity} onChange={(e) => update(index, { quantity: e.target.value })} required /></label>
            <label className="field-control">
              <span>Unit</span>
              <input value={line.unit} onChange={(e) => update(index, { unit: e.target.value })} />
            </label>
            {stockStats ? <div className="stock-hint-cell"><span className="stock-hint">Store stock: {num(stockStats.store)} {line.unit}{stockStats.total !== stockStats.store ? ` | Total stock: ${num(stockStats.total)} ${line.unit}` : ""}</span></div> : null}
            {receipt ? <label>Rate <input type="number" step="0.01" min="0" value={line.rate || ""} onChange={(e) => {
              const rate = e.target.value;
              const quantity = Number(line.quantity || 0);
              update(index, { rate, amount: quantity && rate !== "" ? String(Number(rate || 0) * quantity) : line.amount });
            }} /></label> : null}
            {receipt ? <label>Amount <input type="number" step="0.01" min="0" value={line.amount || ""} onChange={(e) => update(index, { amount: e.target.value })} /></label> : null}
            {arrival ? <label className="check-label">Arrived <input type="checkbox" checked={line.reached !== false} onChange={(e) => update(index, { reached: e.target.checked })} /></label> : null}
            <label>Remarks <input value={line.remarks} onChange={(e) => update(index, { remarks: e.target.value })} /></label>
            <button type="button" className="icon-button" disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, i) => i !== index))} title="Remove item line">
              <Trash2 size={16} />
            </button>
          </div>
          );
        })}
      </div>
    </div>
  );
}



export function blankLine() {
  return { itemName: "", category: "", specification: "", quantity: "", unit: "", remarks: "" };
}


