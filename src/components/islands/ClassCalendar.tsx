/**
 * The class calendar: one week at a time, seven day columns with each day's classes stacked under
 * it, and no hour grid, so empty hours take no space. Shown in the studio's timezone whatever the
 * viewer's device says. On phones the days stack and days without classes are left out.
 *  - coach: clicking a class opens its roster page
 *  - member: clicking a class opens a dialog to book or cancel, which posts the page's normal
 *    server form, so all booking rules run on the server
 */
import { tz } from "@date-fns/tz";
import { format } from "date-fns";
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { DATE_FNS_LOCALES, DATE_PATTERNS, capitalizeFirst } from "../../i18n/dates";
import type { Locale } from "../../i18n/locales";
import { translate, type Vars } from "../../i18n/translate";

export interface CalendarSession {
  id: string;
  start: string; // ISO instant
  end: string;
  title: string;
  icon: string;
  color: string;
  templateId: string;
  calendarName: string;
  coachName: string | null;
  description: string | null;
  booked: number;
  capacity: number;
  cancelled: boolean;
  myBookingId: string | null;
}

interface Props {
  mode: "coach" | "member";
  sessions: CalendarSession[];
  timezone: string;
  /** Studio today, YYYY-MM-DD. */
  today: string;
  /** Date to open on, YYYY-MM-DD. */
  selectedDate: string;
  /** Days covered by `sessions`; moving outside them reloads the page for that week. */
  rangeFrom?: string;
  rangeTo?: string;
  sessionBaseUrl?: string;
  bookingCutoffMinutes: number;
  cancellationCutoffMinutes: number;
  credits?: number;
  /** Earliest week that can be shown. */
  minDate?: string;
  /** Latest week that can be shown. */
  maxDate?: string;
  locale: Locale;
  /** The "booking" messages in the viewer's language. */
  messages: Record<string, unknown>;
}

let lang: Locale = "en";
let msgs: Record<string, unknown> = {};
const tr = (key: string, vars?: Vars) => translate(lang, msgs as never, msgs as never, key, vars);

/** Light container and dark text derived from a class type's colour. */
function shades(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const mix = (c: number, w: number, t: number) => Math.round(c + (t - c) * w);
  const toHex = (rr: number, gg: number, bb: number) =>
    `#${[rr, gg, bb].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
  return {
    main: hex,
    container: toHex(mix(r, 0.86, 255), mix(g, 0.86, 255), mix(b, 0.86, 255)),
    onContainer: toHex(mix(r, 0.45, 0), mix(g, 0.45, 0), mix(b, 0.45, 0)),
  };
}

const minutesUntil = (iso: string) => Math.floor((Date.parse(iso) - Date.now()) / 60_000);
const fmtTime = (iso: string, timeZone: string) =>
  format(new Date(iso), DATE_PATTERNS[lang].time, { in: tz(timeZone), locale: DATE_FNS_LOCALES[lang] });
const fmtDay = (iso: string, timeZone: string) =>
  capitalizeFirst(
    format(new Date(iso), DATE_PATTERNS[lang].dayLong, { in: tz(timeZone), locale: DATE_FNS_LOCALES[lang] }),
  );

function statusText(s: CalendarSession, mode: Props["mode"]): string {
  if (s.cancelled) return tr("dialog.cancelled");
  if (s.myBookingId) return tr("dialog.booked");
  if (mode === "coach") return tr("dialog.bookedCoach", { booked: s.booked, capacity: s.capacity });
  if (s.booked >= s.capacity) return tr("dialog.full");
  return tr("dialog.spotsLeft", { count: s.capacity - s.booked });
}

export default function ClassCalendar(props: Props) {
  lang = props.locale;
  msgs = props.messages;
  return <WeekBoard {...props} />;
}

const addDaysIso = (date: string, n: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const mondayOf = (date: string) => {
  const dow = new Date(`${date}T12:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDaysIso(date, -((dow + 6) % 7));
};
const fmtLocal = (date: string, pattern: string) =>
  format(new Date(`${date}T12:00:00Z`), pattern, { in: tz("UTC"), locale: DATE_FNS_LOCALES[lang] });
const localDay = (iso: string, timeZone: string) => format(new Date(iso), "yyyy-MM-dd", { in: tz(timeZone) });

function WeekBoard(props: Props) {
  const { mode, sessions, timezone, today } = props;
  const minWeek = props.minDate ? mondayOf(props.minDate) : null;
  const maxWeek = props.maxDate ? mondayOf(props.maxDate) : null;
  const [week, setWeek] = useState(() => {
    const m = mondayOf(props.selectedDate);
    return minWeek && m < minWeek ? minWeek : m;
  });
  const [open, setOpen] = useState<CalendarSession | null>(null);

  const go = (next: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set("date", next);
    // Outside the loaded days: load that week from the server.
    if ((props.rangeFrom && next < props.rangeFrom) || (props.rangeTo && addDaysIso(next, 6) > props.rangeTo)) {
      window.location.href = url.toString();
      return;
    }
    setWeek(next);
    window.history.replaceState(null, "", url);
  };

  const days = Array.from({ length: 7 }, (_, i) => addDaysIso(week, i));
  const byDay = useMemo(() => {
    const map = new Map<string, CalendarSession[]>();
    for (const s of sessions) {
      const d = localDay(s.start, timezone);
      map.set(d, [...(map.get(d) ?? []), s]);
    }
    return map;
  }, [sessions, timezone]);
  const end = days[6]!;
  const sameMonth = week.slice(0, 7) === end.slice(0, 7);
  const range = `${fmtLocal(week, sameMonth ? "d" : "d MMM")} – ${fmtLocal(end, "d MMM yyyy")}`;
  const weekHasClasses = days.some((d) => byDay.get(d)?.length);
  const thisWeek = mondayOf(today);

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-stone-100 px-4 py-3">
        <button type="button" className="btn btn-sm" onClick={() => go(thisWeek)} disabled={week === thisWeek}>
          {tr("book.thisWeek")}
        </button>
        <div className="flex items-center">
          <button
            type="button"
            className="rounded-lg p-2 text-stone-600 hover:bg-stone-100 disabled:opacity-30"
            onClick={() => go(addDaysIso(week, -7))}
            disabled={minWeek !== null && week <= minWeek}
            aria-label={tr("book.prevWeek")}
          >
            <Chevron dir="left" />
          </button>
          <button
            type="button"
            className="rounded-lg p-2 text-stone-600 hover:bg-stone-100 disabled:opacity-30"
            onClick={() => go(addDaysIso(week, 7))}
            disabled={maxWeek !== null && week >= maxWeek}
            aria-label={tr("book.nextWeek")}
          >
            <Chevron dir="right" />
          </button>
        </div>
        <h2 className="text-base font-semibold tracking-tight">{capitalizeFirst(range)}</h2>
      </div>

      <div className="grid divide-y divide-stone-100 md:grid-cols-7 md:divide-x md:divide-y-0">
        {days.map((d) => {
          const list = byDay.get(d) ?? [];
          const isToday = d === today;
          const past = d < today;
          return (
            <section
              key={d}
              className={`${list.length === 0 ? "hidden md:block" : ""} min-w-0 p-2.5 md:min-h-48 ${past ? "bg-stone-50/70" : ""}`}
              aria-label={capitalizeFirst(fmtLocal(d, DATE_PATTERNS[lang].dayLong))}
            >
              <header className="mb-2 flex items-center gap-2 px-1 md:flex-col md:gap-0.5 md:text-center">
                <span className="text-xs font-medium tracking-wide text-stone-500 uppercase">{fmtLocal(d, "EEE")}</span>
                <span
                  className={`flex h-8 min-w-8 items-center justify-center rounded-full px-1.5 text-sm font-semibold ${
                    isToday ? "bg-stone-900 text-white" : past ? "text-stone-400" : "text-stone-900"
                  }`}
                >
                  {fmtLocal(d, "d")}
                </span>
              </header>
              <div className="space-y-2">
                {list.map((s) =>
                  mode === "coach" ? (
                    <ClassCard
                      key={s.id}
                      s={s}
                      mode={mode}
                      timeZone={timezone}
                      href={`${props.sessionBaseUrl}/${s.id}`}
                    />
                  ) : (
                    <ClassCard key={s.id} s={s} mode={mode} timeZone={timezone} onOpen={() => setOpen(s)} />
                  ),
                )}
              </div>
            </section>
          );
        })}
      </div>
      {!weekHasClasses && <p className="muted px-4 py-8 text-center">{tr("book.noClassesWeek")}</p>}
      {open && createPortal(<BookingDialog session={open} {...props} onClose={() => setOpen(null)} />, document.body)}
    </div>
  );
}

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d={dir === "left" ? "m15 18-6-6 6-6" : "m9 18 6-6-6-6"} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ClassCard({
  s,
  mode,
  timeZone,
  href,
  onOpen,
}: {
  s: CalendarSession;
  mode: Props["mode"];
  timeZone: string;
  href?: string;
  onOpen?: () => void;
}) {
  const c = shades(s.color);
  const past = s.cancelled || Date.parse(s.end) < Date.now();
  const full = !s.myBookingId && s.booked >= s.capacity;
  const style = { background: c.container, color: c.onContainer, borderLeftColor: s.color, opacity: past ? 0.55 : 1 };
  const body = (
    <>
      <div className="fm-agenda-time">
        {fmtTime(s.start, timeZone)}–{fmtTime(s.end, timeZone)}
      </div>
      <div className={s.cancelled ? "fm-event-title line-through" : "fm-event-title"}>
        <span aria-hidden="true">{s.icon}</span> {s.title}
      </div>
      {s.coachName && <div className="fm-event-meta">{tr("dialog.with", { name: s.coachName })}</div>}
      <div
        className={
          s.myBookingId
            ? "fm-agenda-status fm-agenda-booked"
            : full
              ? "fm-agenda-status opacity-70"
              : "fm-agenda-status"
        }
      >
        {mode === "coach" && !s.cancelled && full
          ? `${statusText(s, mode)} · ${tr("dialog.full")}`
          : statusText(s, mode)}
      </div>
    </>
  );
  return href ? (
    <a href={href} className="fm-agenda-event block" style={style}>
      {body}
    </a>
  ) : (
    <button type="button" onClick={onOpen} className="fm-agenda-event block w-full text-left" style={style}>
      {body}
    </button>
  );
}

function BookingDialog({
  session: s,
  timezone,
  bookingCutoffMinutes,
  cancellationCutoffMinutes,
  credits = 0,
  onClose,
}: Props & { session: CalendarSession; onClose: () => void }) {
  const mins = minutesUntil(s.start);
  const started = mins <= 0;
  const closed = mins < bookingCutoffMinutes;
  const late = mins < cancellationCutoffMinutes;
  const spots = s.capacity - s.booked;
  const c = shades(s.color);
  return (
    <div
      className="fixed inset-0 z-[1000] flex items-end justify-center bg-stone-900/40 p-4 sm:items-center"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="fm-dialog-title"
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-2xl"
            style={{ background: c.container }}
            aria-hidden="true"
          >
            {s.icon}
          </div>
          <div className="flex-1">
            <h2 id="fm-dialog-title" className="text-lg font-semibold" style={{ color: c.onContainer }}>
              {s.title}
            </h2>
            <p className="text-sm text-stone-600">
              {fmtDay(s.start, timezone)}, {fmtTime(s.start, timezone)}–{fmtTime(s.end, timezone)}
            </p>
            <p className="text-sm text-stone-500">
              {s.coachName ? `${tr("dialog.with", { name: s.coachName })} · ` : ""}
              {s.calendarName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 text-xl leading-none text-stone-400 hover:text-stone-700"
            aria-label={tr("dialog.close")}
          >
            ×
          </button>
        </div>
        {s.description && <p className="mt-3 text-sm text-stone-600">{s.description}</p>}
        <p className="mt-3 text-sm font-medium">
          {spots <= 0 ? tr("dialog.classFull") : tr("dialog.spotsOfCapacity", { count: spots, capacity: s.capacity })}
        </p>

        <div className="mt-4">
          {s.myBookingId ? (
            <form method="post" className="space-y-2">
              <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{tr("dialog.youAreBooked")}</p>
              <input type="hidden" name="_action" value="cancel" />
              <input type="hidden" name="bookingId" value={s.myBookingId} />
              {!started && (
                <>
                  {late && (
                    <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                      {tr("dialog.lateWarning", { hours: Math.round(cancellationCutoffMinutes / 60) })}
                    </p>
                  )}
                  <button className="btn w-full">
                    {late ? tr("dialog.cancelAnyway") : tr("dialog.cancelGetBack")}
                  </button>
                </>
              )}
            </form>
          ) : started ? (
            <p className="text-sm text-stone-500">{tr("dialog.started")}</p>
          ) : closed ? (
            <p className="text-sm text-stone-500">
              {tr("dialog.closed", { hours: Math.round(bookingCutoffMinutes / 60) })}
            </p>
          ) : spots <= 0 ? (
            <p className="text-sm text-stone-500">{tr("dialog.askCoachSpot")}</p>
          ) : credits <= 0 ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{tr("dialog.noCredits")}</p>
          ) : (
            <form method="post">
              <input type="hidden" name="_action" value="book" />
              <input type="hidden" name="sessionId" value={s.id} />
              <button className="btn btn-primary w-full">{tr("dialog.book", { count: credits })}</button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
