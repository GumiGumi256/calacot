// Display labels shared by server pages and client forms. Kept out of "use client" modules:
// a server component importing a plain object from a client module receives a client
// reference, not the object, so lookups would silently fall back to raw values.
export const kindLabels: Record<string, string> = {
  contract: "Contract", drawing: "Drawing", brief: "Brief", permit: "Permit", photo: "Photo", report: "Report", policy: "Policy",
  staff_record: "Staff record", property_document: "Property document", other: "Other", quotation: "Quotation", invoice: "Invoice", receipt: "Receipt", expense_receipt: "Expense evidence",
};
export const recordLabels: Record<string, string> = { client: "Client", project: "Project", task: "Task", milestone: "Milestone", staff: "Employee", company: "Company records", expense: "Expense", invoice: "Invoice", quotation: "Quotation", property: "Property", none: "Unlinked" };
