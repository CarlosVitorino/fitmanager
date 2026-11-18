/** Labels and colours for coach note categories. */
export const NOTE_CATEGORY = {
  general: { label: "General", cls: "bg-stone-100 text-stone-700" },
  progress: { label: "Progress", cls: "bg-emerald-50 text-emerald-700" },
  programme: { label: "Programme", cls: "bg-sky-50 text-sky-700" },
  nutrition: { label: "Nutrition", cls: "bg-amber-50 text-amber-700" },
  health: { label: "Health", cls: "bg-rose-50 text-rose-700" },
} as const;
export type NoteCategory = keyof typeof NOTE_CATEGORY;
