import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

// Tailwind resolves `@import "tailwindcss"` from the directory of the CSS file being processed.
// When Turbopack hands PostCSS a CSS chunk with an empty or out-of-project `from`, that directory
// becomes the parent folder (C:\Users\Gumis\Desktop) and the build fails with
// "Can't resolve 'tailwindcss'". Point such chunks back inside the project before Tailwind runs.
const keepFromInsideProject = () => ({
  postcssPlugin: "calacot-keep-from-inside-project",
  Once(_root, { result }) {
    const from = result.opts.from;
    const resolved = from ? path.resolve(from).toLowerCase() : "";
    if (resolved.startsWith(projectRoot.toLowerCase() + path.sep)) return;
    console.warn(`[postcss] CSS with from=${JSON.stringify(from)} rerouted into the project`);
    result.opts.from = path.join(projectRoot, "app", "__unnamed__.css");
  },
});
keepFromInsideProject.postcss = true;

const config = {
  plugins: [keepFromInsideProject(), "@tailwindcss/postcss"],
};

export default config;
