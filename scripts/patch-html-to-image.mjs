import { readFile, writeFile } from "node:fs/promises";

const packageRoot = new URL("../node_modules/html-to-image/", import.meta.url);
const packageJson = JSON.parse(
  await readFile(new URL("package.json", packageRoot), "utf8"),
);

if (packageJson.version !== "1.11.13") {
  throw new Error(
    `Review the exact-font patch before using html-to-image ${packageJson.version}.`,
  );
}

const patches = [
  {
    file: "src/clone-node.ts",
    before: `      let value = sourceStyle.getPropertyValue(name)
      if (name === 'font-size' && value.endsWith('px')) {
        const reducedFont =
          Math.floor(parseFloat(value.substring(0, value.length - 2))) - 0.1
        value = \`\${reducedFont}px\`
      }
`,
    after: `      // A page texture must use the source DOM's exact font metrics.
      let value = sourceStyle.getPropertyValue(name)
`,
  },
  {
    file: "es/clone-node.js",
    before: `            let value = sourceStyle.getPropertyValue(name);
            if (name === 'font-size' && value.endsWith('px')) {
                const reducedFont = Math.floor(parseFloat(value.substring(0, value.length - 2))) - 0.1;
                value = \`\${reducedFont}px\`;
            }
`,
    after: `            // A page texture must use the source DOM's exact font metrics.
            let value = sourceStyle.getPropertyValue(name);
`,
  },
  {
    file: "lib/clone-node.js",
    before: `            var value = sourceStyle.getPropertyValue(name);
            if (name === 'font-size' && value.endsWith('px')) {
                var reducedFont = Math.floor(parseFloat(value.substring(0, value.length - 2))) - 0.1;
                value = "".concat(reducedFont, "px");
            }
`,
    after: `            // A page texture must use the source DOM's exact font metrics.
            var value = sourceStyle.getPropertyValue(name);
`,
  },
];

let changed = false;
for (const patch of patches) {
  const path = new URL(patch.file, packageRoot);
  const source = await readFile(path, "utf8");
  if (source.includes(patch.after)) continue;
  if (!source.includes(patch.before)) {
    throw new Error(`Could not apply exact-font patch to ${patch.file}.`);
  }
  await writeFile(path, source.replace(patch.before, patch.after));
  changed = true;
}

console.log(
  changed
    ? "Patched html-to-image to preserve exact font sizes."
    : "html-to-image exact-font patch already applied.",
);
