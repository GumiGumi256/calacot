import { randomUUID } from "node:crypto";
import type { InteractiveListContent } from "@/lib/whatsapp/types";
export const WELCOME =
  "Welcome to Calacot. How can we help you today? Please choose an option below.";
export const services = [
  ["architecture", "Architecture"],
  ["painting", "Painting"],
  ["interiors", "Interiors"],
  ["real_estate", "Real estate"],
  ["tech", "Software development"],
] as const;
export type MenuState = {
  screen: string;
  flowVersion?: number;
  options?: Record<string, string>;
  service?: string;
  name?: string;
  brief?: string;
  versionId?: string;
  page?: number;
  verifiedClientId?: string | null;
  verifiedUser?: string;
};
export type Option = [string, string];
export const navigation: Option[] = [
  ["back", "Back"],
  ["main", "Main menu"],
];
export const tree: Record<string, Option[]> = {
  main: [
    ["services", "Explore our services"],
    ["start", "Start a project"],
    ["quotes", "My quotations"],
    ["invoices", "My invoices"],
    ["purchases", "My design purchases"],
    ["team", "Talk to our team"],
  ],
  services: services.map(([id, title]) => [`service:${id}`, title]),
  start: services.map(([id, title]) => [`start:${id}`, title]),
  service: [
    ["start_selected", "Start a project"],
    ["team", "Talk to our team"],
  ],
  quotes: [
    ["quote_latest", "View latest quotation"],
    ["quote_confirm", "Confirm quotation"],
    ["quote_list", "Choose another quotation"],
    ["team", "Talk to our team"],
  ],
  invoices: [
    ["invoice_latest", "View latest invoice"],
    ["invoice_outstanding", "Outstanding invoices"],
    ["pay", "How to pay"],
    ["team", "Talk to our team"],
  ],
  purchases: [
    ["purchase_latest", "View recent purchase"],
    ["purchase_reference", "Payment/access status"],
    ["team", "Get assistance"],
  ],
  review: [
    ["accept", "Confirm this quote"],
    ["team", "Talk to our team"],
    ["cancel", "Cancel"],
  ],
  summary: [
    ["submit", "Submit enquiry"],
    ["cancel", "Cancel"],
  ],
  name: [["team", "Talk to our team"]],
  brief: [["team", "Talk to our team"]],
  reference: [["team", "Talk to our team"]],
  verification: [
    ["verified", "I've linked my account"],
    ["team", "Talk to our team"],
  ],
};
export function menuReply(state: MenuState, text: string, extra?: Option[]) {
  const choices = [
    ...(extra || tree[state.screen] || [["team", "Talk to our team"]]),
    ...(state.screen === "main" ? [] : navigation),
  ];
  if (choices.length > 10 || choices.some(([, title]) => title.length > 24))
    throw new Error("menu_limits");
  const options: Record<string, string> = {};
  const rows = choices.map(([action, title]) => {
    const id = `care:${randomUUID()}`;
    options[id] = action;
    return { id, title };
  });
  const payload: InteractiveListContent = {
    type: "list",
    body: { text: text.slice(0, 1024) },
    action: {
      button: "Choose an option",
      sections: [{ title: "Calacot", rows }],
    },
  };
  return { state: { ...state, flowVersion: 1, options }, payload };
}
export function selectedAction(
  state: MenuState,
  body: string,
  type: string,
  expired: boolean,
) {
  const command = body.trim().toLowerCase();
  if (type === "text" && ["menu", "back", "cancel"].includes(command))
    return command === "menu" ? "main" : command;
  if (expired) return null;
  return type === "interactive" ? state.options?.[body] || null : null;
}
export function parent(screen: string) {
  return (
    (
      {
        service: "services",
        name: "start",
        brief: "name",
        summary: "brief",
        review: "quotes",
        quote_list: "quotes",
        reference: "purchases",
        verification: "main",
      } as Record<string, string>
    )[screen] || "main"
  );
}
