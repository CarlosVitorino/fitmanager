/**
 * Date input that looks the same in every browser. Shows "Wed 18 Nov 2026", opens a calendar
 * popover (react-day-picker) and submits a plain "YYYY-MM-DD" value under `name`, so the server
 * forms don't change. Weeks start on Monday.
 */
import { useEffect, useId, useRef, useState } from "react";
import { DayPicker } from "react-day-picker";
import { de, enGB, es, fr, pt } from "react-day-picker/locale";
import "react-day-picker/style.css";
import { format } from "date-fns";
import { DATE_FNS_LOCALES, DATE_PATTERNS, capitalizeFirst } from "../../i18n/dates";
import type { Locale } from "../../i18n/locales";

const PICKER_LOCALES = { en: enGB, de, es, fr, pt };

interface Props {
  name: string;
  value?: string | null;
  /** Studio's today as YYYY-MM-DD, used to highlight today and for the Today button. */
  today: string;
  required?: boolean;
  optional?: boolean;
  min?: string;
  ariaLabel?: string;
  locale: Locale;
  labels: { today: string; clear: string; placeholder: string };
}

const toDate = (s: string) => {
  const [y, m, d] = s.split("-").map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
};
const toValue = (d: Date) => format(d, "yyyy-MM-dd");

export default function DateField({ name, value, today, required, optional, min, ariaLabel, locale, labels }: Props) {
  const [selected, setSelected] = useState<string | null>(value || null);
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const popoverId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapper.current && !wrapper.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pick = (d: Date | undefined) => {
    if (d) setSelected(toValue(d));
    setOpen(false);
  };

  return (
    <div ref={wrapper} className="relative">
      <input type="hidden" name={name} value={selected ?? ""} />
      <button
        type="button"
        className="input flex items-center justify-between gap-2 text-left"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={popoverId}
        aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={selected ? "" : "text-stone-400"}>
          {selected
            ? capitalizeFirst(
                format(toDate(selected), DATE_PATTERNS[locale].dateWithDay, { locale: DATE_FNS_LOCALES[locale] }),
              )
            : labels.placeholder}
        </span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="shrink-0 text-stone-400"
          aria-hidden="true"
        >
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      </button>
      {required && !selected && (
        <input tabIndex={-1} required className="pointer-events-none absolute inset-0 opacity-0" aria-hidden="true" />
      )}
      {open && (
        <div
          id={popoverId}
          role="dialog"
          className="fm-daypicker absolute left-0 z-30 mt-1 rounded-xl border border-stone-200 bg-white p-3 shadow-lg"
        >
          <DayPicker
            mode="single"
            locale={PICKER_LOCALES[locale]}
            weekStartsOn={1}
            selected={selected ? toDate(selected) : undefined}
            onSelect={pick}
            defaultMonth={selected ? toDate(selected) : toDate(today)}
            today={toDate(today)}
            disabled={min ? { before: toDate(min) } : undefined}
            showOutsideDays
            fixedWeeks
            autoFocus
          />
          <div className="mt-2 flex justify-between border-t border-stone-100 pt-2">
            <button type="button" className="btn btn-sm" onClick={() => pick(toDate(today))}>
              {labels.today}
            </button>
            {optional && selected && (
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => {
                  setSelected(null);
                  setOpen(false);
                }}
              >
                {labels.clear}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
