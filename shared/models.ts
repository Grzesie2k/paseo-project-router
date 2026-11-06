export interface ModelOption {
  id: string;
  label: string;
}

export function filterModels(models: readonly ModelOption[], query: string): ModelOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...models];
  return models.filter((m) => m.id.toLowerCase().includes(q) || m.label.toLowerCase().includes(q));
}

// A saved value outside the catalog is kept as typed and flagged.
export function describeModel(models: readonly ModelOption[], value: string | undefined): { text: string; inCatalog: boolean } {
  if (!value) return { text: "", inCatalog: true };
  const hit = models.find((m) => m.id === value);
  return hit ? { text: hit.label, inCatalog: true } : { text: value, inCatalog: false };
}

// Offered when the typed text is not already a catalog id.
export function customCandidate(models: readonly ModelOption[], query: string): string | null {
  const q = query.trim();
  return q && !models.some((m) => m.id === q) ? q : null;
}
