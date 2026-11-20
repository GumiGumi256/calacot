/**
 * Clerk sign-in and sign-up forms in Calacot's style: brand font, gold primary button with dark
 * text (as on the public site), rounded corners and the soft card edge. Colours are brand tokens.
 */
export const clerkFormAppearance = {
  variables: {
    colorPrimary: "var(--color-brand-primary)",
    colorTextOnPrimaryBackground: "var(--color-brand-black)",
    fontFamily: "var(--font-sans)",
    borderRadius: "0.75rem",
  },
  elements: {
    cardBox: "rounded-3xl! border! border-brand-black-100! shadow-[0_24px_48px_-24px_oklch(0.1941_0.012_285.23/0.25)]!",
    formButtonPrimary: "rounded-full! font-medium! text-brand-black! shadow-none!",
    headerTitle: "font-heading!",
  },
};
