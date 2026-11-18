/**
 * The class calendar (Schedule-X), shown in the studio's timezone whatever the viewer's device says.
 *  - coach: week/day/month/list views; clicking a class opens its roster page
 *  - member: clicking a class opens a dialog to book or cancel; the dialog posts the page's normal
 *    server form, so all booking rules run on the server
 */
import { createViewDay, createViewList, createViewMonthGrid, createViewWeek } from "@schedule-x/calendar";
import type { CalendarEventExternal } from "@schedule-x/calendar";
import { createCurrentTimePlugin } from "@schedule-x/current-time";
import { ScheduleXCalendar, useCalendarApp } from "@schedule-x/react";
import "@schedule-x/theme-default/dist/index.css";
import { tz } from "@date-fns/tz";
import { format } from "date-fns";
import { enGB } from "date-fns/locale";
import { useMemo, useState } from "react";
import { FORMATS } from "../../lib/format";
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
}

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
  format(new Date(iso), FORMATS.time, { in: tz(timeZone), locale: enGB });
const fmtDay = (iso: string, timeZone: string) =>
  format(new Date(iso), FORMATS.dayLong, { in: tz(timeZone), locale: enGB });

function statusText(s: CalendarSession, mode: Props["mode"]): string {
  if (s.cancelled) return "Cancelled";
  if (s.myBookingId) return "✓ Booked";
  if (mode === "coach") return `${s.booked}/${s.capacity} booked`;
  if (s.booked >= s.capacity) return "Full";
  return `${s.capacity - s.booked} ${s.capacity - s.booked === 1 ? "spot" : "spots"} left`;
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
        {s.cancelled ? (
          "Cancelled"
        ) : s.myBookingId ? (
          <b>✓ Booked</b>
        ) : calendarEvent.mode === "coach" ? (
          `${s.booked}/${s.capacity}`
        ) : full ? (
          "Full"
        ) : (
          `${s.capacity - s.booked} left`
        )}
      </div>
    </div>
  );
}

export default function ClassCalendar(props: Props) {
  const { mode, sessions, timezone, today, selectedDate, sessionBaseUrl } = props;
  const [open, setOpen] = useState<CalendarSession | null>(null);
  const [narrow] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches);

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
      views: [createViewWeek(), createViewDay(), createViewMonthGrid(), createViewList()],
      // Phones get the list of upcoming classes; the week grid is too cramped there.
      defaultView: narrow ? "list" : "week",
      isResponsive: false,
      selectedDate: Temporal.PlainDate.from(selectedDate),
      timezone: timezone as never,
      locale: "en-GB",
      firstDayOfWeek: 1,
      dayBoundaries: { start: "06:00", end: "22:00" },
      weekOptions: {
        gridHeight: 900,
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
        customComponents={{ timeGridEvent: EventBox, dateGridEvent: EventBox, monthGridEvent: MonthEvent }}
      />
      {open && <BookingDialog session={open} {...props} onClose={() => setOpen(null)} />}
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
      className="fixed inset-0 z-50 flex items-end justify-center bg-stone-900/40 p-4 sm:items-center"
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
              {s.coachName ? `with ${s.coachName} · ` : ""}
              {s.calendarName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 text-xl leading-none text-stone-400 hover:text-stone-700"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        {s.description && <p className="mt-3 text-sm text-stone-600">{s.description}</p>}
        <p className="mt-3 text-sm font-medium">
          {spots <= 0 ? "This class is full." : `${spots} of ${s.capacity} spots left`}
        </p>

        <div className="mt-4">
          {s.myBookingId ? (
            <form method="post" className="space-y-2">
              <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                ✓ You're booked into this class.
              </p>
              <input type="hidden" name="_action" value="cancel" />
              <input type="hidden" name="bookingId" value={s.myBookingId} />
              {!started && (
                <>
                  {late && (
                    <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                      It's less than {Math.round(cancellationCutoffMinutes / 60)}h before the class, so cancelling won't
                      return your credit.
                    </p>
                  )}
                  <button className="btn w-full">
                    {late ? "Cancel anyway (credit used)" : "Cancel booking, get credit back"}
                  </button>
                </>
              )}
            </form>
          ) : started ? (
            <p className="text-sm text-stone-500">This class has started.</p>
          ) : closed ? (
            <p className="text-sm text-stone-500">
              Booking closes {Math.round(bookingCutoffMinutes / 60)}h before the class.
            </p>
          ) : spots <= 0 ? (
            <p className="text-sm text-stone-500">Ask your coach if a spot opens up.</p>
          ) : credits <= 0 ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              You have no credits. Ask your coach for a plan.
            </p>
          ) : (
            <form method="post">
              <input type="hidden" name="_action" value="book" />
              <input type="hidden" name="sessionId" value={s.id} />
              <button className="btn btn-primary w-full">Book · uses 1 of your {credits} credits</button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
