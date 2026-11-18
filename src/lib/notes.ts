/** Colours for coach note categories. Labels come from noteCategoryLabel() in src/server/labels.ts. */
export const NOTE_CATEGORY = {
  general: { cls: "bg-stone-100 text-stone-700" },
  progress: { cls: "bg-emerald-50 text-emerald-700" },
  programme: { cls: "bg-sky-50 text-sky-700" },
  nutrition: { cls: "bg-amber-50 text-amber-700" },
  health: { cls: "bg-rose-50 text-rose-700" },
} as const;
export type NoteCategory = keyof typeof NOTE_CATEGORY;
