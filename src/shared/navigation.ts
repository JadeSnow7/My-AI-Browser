/** Addresses accepted by the browser's single navigation entry point. */
const ADDRESS_PATTERN = /^(?:https?:\/\/)?(?:[\w-]+(?:\.[a-z]{2,})+|localhost)(?::\d+)?(?:[/?#]|$)/i;

export const looksLikeAddress = (value: string): boolean =>
  ADDRESS_PATTERN.test(value.trim());

/** Preserve explicit URLs and path/query/fragment data; search everything else. */
export const normalizeNavigationInput = (
  raw: string,
  searchBase = "https://www.google.com/search?q=",
): string => {
  const value = raw.trim();
  if (/^https?:\/\//i.test(value)) return value;
  if (looksLikeAddress(value)) return `https://${value}`;
  return `${searchBase}${encodeURIComponent(value)}`;
};
