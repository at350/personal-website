/** Compare editorial strings while ignoring case, punctuation, and whitespace. */
function copyKey(value: string): string {
  return value
    .normalize("NFKD")
    .toLocaleLowerCase("en-US")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Do not print a card excerpt when it only repeats or lightly reframes its
 * title. Distinct source copy is returned untouched.
 */
export function distinctExcerpt(
  title: string,
  excerpt: string | undefined,
): string | undefined {
  if (excerpt === undefined) return undefined;
  const titleKey = copyKey(title);
  const excerptKey = copyKey(excerpt);
  if (!titleKey || !excerptKey) return undefined;
  if (
    titleKey === excerptKey ||
    titleKey.includes(excerptKey) ||
    excerptKey.includes(titleKey)
  ) {
    return undefined;
  }
  return excerpt;
}
