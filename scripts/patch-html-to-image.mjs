import { readFile, writeFile } from "node:fs/promises";

const packageRoot = new URL("../node_modules/html-to-image/", import.meta.url);
const packageJson = JSON.parse(
  await readFile(new URL("package.json", packageRoot), "utf8"),
);

if (packageJson.version !== "1.11.13") {
  throw new Error(
    `Review the html-to-image patches before using html-to-image ${packageJson.version}.`,
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
  // A capture that names the computed properties to copy must get exactly
  // those, on that call. Upstream kept the first call's list for the rest of
  // the session, so a later capture could never name more (see
  // src/book3d/captureStyles.ts). Calls that name none still share the
  // cached full list, as before.
  {
    file: "src/util.ts",
    before: `export function getStyleProperties(options: Options = {}): string[] {
  if (styleProps) {
    return styleProps
  }

  if (options.includeStyleProperties) {
    styleProps = options.includeStyleProperties
    return styleProps
  }
`,
    after: `export function getStyleProperties(options: Options = {}): string[] {
  if (options.includeStyleProperties) {
    return options.includeStyleProperties
  }

  if (styleProps) {
    return styleProps
  }
`,
  },
  {
    file: "es/util.js",
    before: `export function getStyleProperties(options = {}) {
    if (styleProps) {
        return styleProps;
    }
    if (options.includeStyleProperties) {
        styleProps = options.includeStyleProperties;
        return styleProps;
    }
`,
    after: `export function getStyleProperties(options = {}) {
    if (options.includeStyleProperties) {
        return options.includeStyleProperties;
    }
    if (styleProps) {
        return styleProps;
    }
`,
  },
  {
    file: "lib/util.js",
    before: `function getStyleProperties(options) {
    if (options === void 0) { options = {}; }
    if (styleProps) {
        return styleProps;
    }
    if (options.includeStyleProperties) {
        styleProps = options.includeStyleProperties;
        return styleProps;
    }
`,
    after: `function getStyleProperties(options) {
    if (options === void 0) { options = {}; }
    if (options.includeStyleProperties) {
        return options.includeStyleProperties;
    }
    if (styleProps) {
        return styleProps;
    }
`,
  },
];

let changed = false;
for (const patch of patches) {
  const path = new URL(patch.file, packageRoot);
  const source = await readFile(path, "utf8");
  if (source.includes(patch.after)) continue;
  if (!source.includes(patch.before)) {
    throw new Error(`Could not apply an html-to-image patch to ${patch.file}.`);
  }
  await writeFile(path, source.replace(patch.before, patch.after));
  changed = true;
}

console.log(
  changed
    ? "Patched html-to-image: exact font sizes, per-call style properties."
    : "html-to-image patches already applied.",
);
