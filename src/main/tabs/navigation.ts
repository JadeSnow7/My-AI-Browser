/** Only a new top-level document should reset the Runtime console. */
export const isMainDocumentNavigation = (
  isInPlace: boolean,
  isMainFrame: boolean,
): boolean => isMainFrame && !isInPlace;
