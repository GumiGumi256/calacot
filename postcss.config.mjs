import path from "node:path";

// Tailwind resolves `@import "tailwindcss"` from the directory of the CSS file being processed.
// Turbopack sometimes hands PostCSS a CSS chunk with an empty `from`; Tailwind then uses the
// parent of the project (C:\Users\Gumis\Desktop) and fails with "Can't resolve 'tailwindcss'".
// Give such chunks a name inside the project. Turbopack runs this worker with cwd = project root
// (import.meta.url would point into .next, because the config is bundled).
const nameUnnamedCss = () => ({
  postcssPlugin: "calacot-name-unnamed-css",
  Once(_root, { result }) {
    if (result.opts.from) return;
    result.opts.from = path.join(process.cwd(), "app", "__unnamed__.css");
  },
});
nameUnnamedCss.postcss = true;

const config = {
  plugins: [nameUnnamedCss(), "@tailwindcss/postcss"],
};

export default config;
