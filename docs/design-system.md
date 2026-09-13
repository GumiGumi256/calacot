# Calacot design system

Shared tokens live in app/globals.css; button variants live in components/ui/button.tsx.

## Actions

Use Button for actions and Link with buttonVariants() for navigation. Never nest links and buttons.

- default: gold primary action with dark text and a subtle shadow.
- outline: supporting action on a normal page surface.
- secondary: quieter filled action.
- ghost: toolbar and low emphasis actions.
- link: inline text action.
- destructive: destructive action only.
- glass: white text and translucent fill over dark photography.

Sizes: xs 28px, sm 36px, default 44px, lg 48px. Use lg for page CTAs, default for forms, and icon sizes for icon-only actions. Give icon-only actions an accessible label. Keep className for layout; change appearance through variants. The legacy CustomButton delegates to the same Button.

## Layout and typography

Use Container or site-container for 90rem content width and fluid 20?48px gutters. Use section-space for fluid 64?112px vertical padding, page-gutter for full-width sections, and gap-4 / gap-6 / gap-8 / gap-12 for action groups, cards, grids, and larger content groups. Preserve special hero and carousel geometry where needed.

Use section-heading for section titles, section-copy for introductory copy, and semantic foreground / muted-foreground colors. Hero display typography can remain expressive. Form inputs and selects use 44px default heights and shared rounded corners.

Use semantic background, foreground, primary, secondary, border, and ring colors so surfaces work in both themes. Reserve glass for dark backgrounds. Buttons include focus, disabled, and reduced-motion states.
