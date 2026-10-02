import type { InteractiveListContent } from "@/lib/whatsapp/types";

export const CARE_MENU_MESSAGE =
  "Choose a Calacot topic from the list. Replies are limited to Calacot services and customer care.";

export const careMenuOptions = [
  {
    id: "architecture",
    title: "Architecture & design",
    description: "House designs, layouts and design packages",
    businessUnit: "architecture",
  },
  {
    id: "real_estate",
    title: "Real estate",
    description: "Homes, land and property services",
    businessUnit: "real_estate",
  },
  {
    id: "interiors",
    title: "Interior design",
    description: "Interiors for homes and workspaces",
    businessUnit: "interiors",
  },
  {
    id: "painting",
    title: "Painting",
    description: "Interior and exterior painting",
    businessUnit: "painting",
  },
  {
    id: "tech",
    title: "Software & technology",
    description: "Custom software and digital products",
    businessUnit: "tech",
  },
  {
    id: "order_status",
    title: "Order status",
    description: "Check a Calacot design purchase",
  },
  {
    id: "support_status",
    title: "Support request status",
    description: "Check an existing support request",
  },
  {
    id: "talk_to_team",
    title: "Talk to our team",
    description: "Request personal help from Calacot",
  },
] as const;

export type CareMenuChoice = (typeof careMenuOptions)[number]["id"];

export const careMenuPayload = {
  type: "list",
  header: { type: "text", text: "Calacot customer care" },
  body: { text: CARE_MENU_MESSAGE },
  action: {
    button: "Choose a topic",
    sections: [
      {
        title: "Calacot",
        rows: careMenuOptions.map(({ id, title, description }) => ({
          id,
          title,
          description,
        })),
      },
    ],
  },
} satisfies InteractiveListContent;

export function getCareMenuChoice(value: string): CareMenuChoice | null {
  const normalized = value.trim().toLocaleLowerCase("en");
  return (
    careMenuOptions.find(
      (option) =>
        option.id === normalized ||
        option.title.toLocaleLowerCase("en") === normalized,
    )?.id ?? null
  );
}