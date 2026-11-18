/**
 * The class calendar (Schedule-X), shown in the studio's timezone whatever the viewer's device says.
 *  - coach: week/day/month/list views; clicking a class opens its roster page
 *  - member: clicking a class opens a dialog to book or cancel; the dialog posts the page's normal
 *    server form, so all booking rules run on the server
 */
import {
  createViewDay,
  createViewList,
  createViewMonthGrid,
  createViewWeek,
  createViewWeekAgenda,
} from "@schedule-x/calendar";
import type { CalendarEventExternal } from "@schedule-x/calendar";
import { createCurrentTimePlugin } from "@schedule-x/current-time";
import { ScheduleXCalendar, useCalendarApp } from "@schedule-x/react";
import "@schedule-x/theme-default/dist/index.css";
import { tz } from "@date-fns/tz";
import { format } from "date-fns";
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { DATE_FNS_LOCALES, DATE_PATTERNS, capitalizeFirst } from "../../i18n/dates";
import { CALENDAR_LOCALE_TAGS, type Locale } from "../../i18n/locales";
import { translate, type Vars } from "../../i18n/translate";
// Schedule-X works with the global Temporal API; this installs it where browsers lack it.
import "temporal-polyfill/global";

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
  sessionBaseUrl?: string;
  bookingCutoffMinutes: number;
  cancellationCutoffMinutes: number;
  credits?: number;
  minDate?: string;
  locale: Locale;
  /** The "booking" messages in the viewer's language. */
  messages: Record<string, unknown>;
}

/*
 * Schedule-X renders the event cards itself, outside this component's props, so the language and
 * messages are set here once per page (there is one calendar per page).
 */
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

function MonthEvent({ calendarEvent }: { calendarEvent: CalendarEventExternal }) {
  const s = calendarEvent.session as CalendarSession;
  const c = shades(s.color);
  return (
    <div
      className="fm-month-event"
      style={{ color: c.onContainer, opacity: s.cancelled || Date.parse(s.end) < Date.now() ? 0.5 : 1 }}
    >
      <span className="fm-dot" style={{ background: s.color }} />
      {fmtTime(s.start, calendarEvent.tz as string)} {s.icon} {s.title}
      {s.myBookingId && " ✓"}
    </div>
  );
}

/** A class in the week agenda: one card per class, stacked per day, no hour grid. */
function AgendaEvent({ calendarEvent }: { calendarEvent: CalendarEventExternal }) {
  const s = calendarEvent.session as CalendarSession;
  const timeZone = calendarEvent.tz as string;
  const c = shades(s.color);
  const past = s.cancelled || Date.parse(s.end) < Date.now();
  return (
    <div
      className="fm-agenda-event"
      style={{ background: c.container, color: c.onContainer, borderLeftColor: s.color, opacity: past ? 0.5 : 1 }}
    >
      <div className="fm-agenda-time">
        {fmtTime(s.start, timeZone)}–{fmtTime(s.end, timeZone)}
      </div>
      <div className="fm-event-title">
        <span aria-hidden="true">{s.icon}</span> {s.title}
      </div>
      {s.coachName && <div className="fm-event-meta">{tr("dialog.with", { name: s.coachName })}</div>}
      <div className={s.myBookingId ? "fm-agenda-status fm-agenda-booked" : "fm-agenda-status"}>
        {statusText(s, calendarEvent.mode as Props["mode"])}
      </div>
    </div>
  );
}

/** Hours to show in the time grid: from the earliest class to the latest, not a fixed 06–22. */
function hourRange(sessions: CalendarSession[], timeZone: string) {
  if (!sessions.length) return { start: 7, end: 21 };
  const hour = (iso: string) => Number(format(new Date(iso), "H", { in: tz(timeZone) }));
  const minute = (iso: string) => Number(format(new Date(iso), "m", { in: tz(timeZone) }));
  const start = Math.min(...sessions.map((s) => hour(s.start)));
  const end = Math.max(...sessions.map((s) => hour(s.end) + (minute(s.end) > 0 ? 1 : 0)));
  return { start: Math.max(0, start), end: Math.min(24, Math.max(end, start + 1)) };
}

function EventBox({ calendarEvent }: { calendarEvent: CalendarEventExternal }) {
  const s = calendarEvent.session as CalendarSession;
  const timeZone = calendarEvent.tz as string;
  const full = s.booked >= s.capacity;
  const c = shades(s.color);
  return (
    <div
      className="fm-event"
      style={{
        background: c.container,
        color: c.onContainer,
        borderLeftColor: s.color,
        opacity: s.cancelled || Date.parse(s.end) < Date.now() ? 0.55 : 1,
      }}
    >
      <div className="fm-event-title">
        <span aria-hidden="true">{s.icon}</span> {s.title}
      </div>
      <div className="fm-event-meta">
        {fmtTime(s.start, timeZone)}–{fmtTime(s.end, timeZone)}
        {" · "}
        {s.myBookingId ? (
          <b>{tr("dialog.booked")}</b>
        ) : calendarEvent.mode === "coach" ? (
          `${s.booked}/${s.capacity}`
        ) : full && !s.cancelled ? (
          tr("dialog.full")
        ) : (
          statusText(s, calendarEvent.mode as Props["mode"])
        )}
      </div>
    </div>
  );
}

export default function ClassCalendar(props: Props) {
  const { mode, sessions, timezone, today, selectedDate, sessionBaseUrl } = props;
  lang = props.locale;
  msgs = props.messages;
  const [open, setOpen] = useState<CalendarSession | null>(null);
  const [narrow] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches);

  const hours = useMemo(() => hourRange(sessions, timezone), [sessions, timezone]);

  const calendars = useMemo(() => {
    const out: Record<string, { colorName: string; lightColors: ReturnType<typeof shades> }> = {};
    for (const s of sessions)
      out[`t${s.templateId.replace(/-/g, "")}`] = {
        colorName: `t${s.templateId.replace(/-/g, "")}`,
        lightColors: shades(s.color),
      };
    return out;
  }, [sessions]);

  const events = useMemo(
    () =>
      sessions.map((s) => ({
        id: s.id,
        // The list view only shows the title, so it carries the status there.
        title: `${s.icon} ${s.title} · ${statusText(s, mode)}`,
        _options: { additionalClasses: Date.parse(s.end) < Date.now() || s.cancelled ? ["fm-past"] : [] },
        start: Temporal.Instant.from(s.start).toZonedDateTimeISO(timezone),
        end: Temporal.Instant.from(s.end).toZonedDateTimeISO(timezone),
        calendarId: `t${s.templateId.replace(/-/g, "")}`,
        people: s.coachName ? [s.coachName] : [],
        session: s,
        tz: timezone,
        mode,
      })),
    [sessions, timezone, mode],
  );

  const calendarApp = useCalendarApp(
    {
      // Members: a day strip with the chosen day's classes as cards (no empty hours), on any screen.
      // Coaches: the hour grid for the whole week, trimmed to the hours that have classes; list on phones.
      views: [createViewWeekAgenda(), createViewWeek(), createViewDay(), createViewMonthGrid(), createViewList()],
      defaultView: mode === "member" ? "week-agenda" : narrow ? "list" : "week",
      isResponsive: false,
      selectedDate: Temporal.PlainDate.from(selectedDate),
      timezone: timezone as never,
      locale: CALENDAR_LOCALE_TAGS[props.locale],
      firstDayOfWeek: 1,
      dayBoundaries: {
        start: `${String(hours.start).padStart(2, "0")}:00`,
        end: `${String(hours.end).padStart(2, "0")}:00`,
      },
      weekOptions: {
        gridHeight: (hours.end - hours.start) * 56,
        eventOverlap: false,
        timeAxisFormatOptions: { hour: "2-digit", minute: "2-digit", hourCycle: "h23" },
      },
      monthGridOptions: { nEventsPerDay: 4 },
      calendars,
      events,
      ...(props.minDate ? { minDate: Temporal.PlainDate.from(props.minDate) } : {}),
      callbacks: {
        onEventClick(event) {
          const s = event.session as CalendarSession;
          if (mode === "coach") window.location.href = `${sessionBaseUrl}/${s.id}`;
          else setOpen(s);
        },
        onSelectedDateUpdate(date) {
          // Keep the visible week in the URL so a booking (full page post) comes back to it.
          const url = new URL(window.location.href);
          url.searchParams.set("date", date.toString());
          window.history.replaceState(null, "", url);
        },
      },
    },
    [createCurrentTimePlugin()],
  );

  return (
    <div className="fm-calendar" data-today={today}>
      <ScheduleXCalendar
        calendarApp={calendarApp}
        customComponents={{
          timeGridEvent: EventBox,
          dateGridEvent: EventBox,
          monthGridEvent: MonthEvent,
          weekAgendaEvent: AgendaEvent,
        }}
      />
      {/* Rendered on <body>, outside the calendar, so its sticky header can't cover the dialog. */}
      {open && createPortal(<BookingDialog session={open} {...props} onClose={() => setOpen(null)} />, document.body)}
    </div>
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
