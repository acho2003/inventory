export const statusLabels = {
  SUBMITTED: "Submitted",
  STORE_VERIFIED: "Store verified",
  APPROVED: "Final approved",
  ORDERED: "Order placed",
  PARTIALLY_RECEIVED: "Partly received",
  RECEIVED: "Received",
  CLOSED: "Closed",
  REJECTED: "Rejected",
  IMPORTED_FOLLOW_UP: "Imported follow-up"
};

export const APP_NAME = "Yarju_OAP_inventory";

export const stockEventTypes = {
  TRANSFER: "Transfer",
  DISPOSED: "Disposed",
  SPOILED: "Spoiled",
  REPAIR_NOTE: "Repair note",
  RETURNED_FROM_REPAIR: "Returned from repair"
};

export const itemCategories = [
  "Fuel & Lubricants",
  "Blasting Materials",
  "Equipment & Vehicle Hiring Charges",
  "Transportation Charges",
  "Construction Materials",
  "Plumbing Materials",
  "Tools & Equipments",
  "Office Stationery",
  "Miscellaneous",
  "Electrical Items",
  "Paints & Coatings",
  "Fastening & Joining Materials",
  "Sanitary Materials",
  "Accommodation & Kitchen Supplies",
  "Operating Expenses",
  "Ritual Expenses",
  "Tax (GST)"
];

export const demoUsers = {
  admin: ["admin", "admin123"],
  requester: ["requester", "request123"],
  store: ["store", "store123"],
  approver: ["approver", "approve123"]
};

export const roleLabels = {
  admin: "Admin",
  requester: "Requisition",
  store: "Store / PMU",
  approver: "Final Approver"
};

export const viewPermissions = {
  dashboard: ["dashboard:read"],
  projects: ["project:read"],
  requisitions: ["requisition:read", "requisition:create"],
  approvals: ["requisition:first_approve", "requisition:final_approve"],
  receive: ["receipt:create"],
  inventory: ["inventory:read"],
  issue: ["issue:create"],
  reports: ["report:read"],
  audit: ["audit:read"]
};

export function can(user, permission) {
  return Boolean(user?.permissions?.includes(permission));
}

export function canAny(user, permissions = []) {
  return permissions.some((permission) => can(user, permission));
}

export function viewAllowed(user, view) {
  return canAny(user, viewPermissions[view] || []);
}

export function firstAllowedView(user) {
  return ["dashboard", "requisitions", "approvals", "receive", "inventory", "issue", "projects", "reports", "audit"].find((entry) => viewAllowed(user, entry)) || "requisitions";
}

