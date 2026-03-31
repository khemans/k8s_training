import { useEffect, useState } from 'react'
import api from '../lib/api'
import { ChevronLeft, ChevronRight, CalendarDays, MapPin, X } from 'lucide-react'

interface InterviewEvent {
  job_id: string
  title: string
  company: string
  location: string | null
  status: string
  interview_at: string
  match_score: number | null
}

const STATUS_LABELS: Record<string, { label: string; color: string; dot: string }> = {
  phone_screen: { label: 'Phone Screen', color: 'bg-amber-100 text-amber-800 border-amber-200', dot: 'bg-amber-400' },
  interview:    { label: 'Interview',    color: 'bg-violet-100 text-violet-800 border-violet-200', dot: 'bg-violet-500' },
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay() // 0=Sun
}

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

export default function CalendarPage() {
  const [events, setEvents] = useState<InterviewEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [today] = useState(new Date())
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const [selectedEvent, setSelectedEvent] = useState<InterviewEvent | null>(null)

  useEffect(() => {
    api.get('/matches/tracker/')
      .then(res => {
        const interviews: InterviewEvent[] = res.data
          .filter((c: any) => c.interview_at && ['phone_screen', 'interview'].includes(c.status))
          .map((c: any) => ({
            job_id: c.job_id,
            title: c.title,
            company: c.company,
            location: c.location,
            status: c.status,
            interview_at: c.interview_at,
            match_score: c.match_score,
          }))
        setEvents(interviews)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) }
    else setViewMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) }
    else setViewMonth(m => m + 1)
  }
  const goToday = () => { setViewYear(today.getFullYear()); setViewMonth(today.getMonth()) }

  const daysInMonth = getDaysInMonth(viewYear, viewMonth)
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth)

  // Map events to day numbers for quick lookup
  const eventsByDay: Record<number, InterviewEvent[]> = {}
  events.forEach(e => {
    const d = new Date(e.interview_at)
    if (d.getFullYear() === viewYear && d.getMonth() === viewMonth) {
      const day = d.getDate()
      if (!eventsByDay[day]) eventsByDay[day] = []
      eventsByDay[day].push(e)
    }
  })

  // Build calendar grid (6 rows × 7 cols)
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const isToday = (day: number) =>
    day === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear()

  const upcomingEvents = events
    .filter(e => new Date(e.interview_at) >= new Date(today.toDateString()))
    .sort((a, b) => new Date(a.interview_at).getTime() - new Date(b.interview_at).getTime())
    .slice(0, 5)

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <CalendarDays className="w-6 h-6 text-violet-500" />
            Interview Calendar
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">Phone screens and interviews with scheduled dates</p>
        </div>
        {upcomingEvents.length > 0 && (
          <div className="hidden md:flex items-center gap-2 text-sm text-violet-700 bg-violet-50 border border-violet-200 rounded-xl px-4 py-2">
            <span className="font-semibold">{upcomingEvents.length}</span>
            upcoming {upcomingEvents.length === 1 ? 'interview' : 'interviews'}
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64 text-slate-400">Loading…</div>
      ) : events.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-3">
          <CalendarDays className="w-12 h-12 text-slate-200" />
          <p className="text-base font-medium">No interviews scheduled yet</p>
          <p className="text-sm text-center max-w-xs">
            Set an interview date on any tracker card in <strong>Phone Screen</strong> or <strong>Interview</strong> status and it'll appear here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Calendar */}
          <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition">
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-3">
                <h2 className="text-base font-semibold text-slate-900">
                  {MONTH_NAMES[viewMonth]} {viewYear}
                </h2>
                <button
                  onClick={goToday}
                  className="text-xs font-medium px-2.5 py-1 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition"
                >
                  Today
                </button>
              </div>
              <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition">
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>

            {/* Day labels */}
            <div className="grid grid-cols-7 border-b border-slate-100">
              {DAY_NAMES.map(d => (
                <div key={d} className="py-2 text-center text-xs font-semibold text-slate-400 uppercase tracking-wide">
                  {d}
                </div>
              ))}
            </div>

            {/* Grid */}
            <div className="grid grid-cols-7">
              {cells.map((day, idx) => {
                const dayEvents = day ? (eventsByDay[day] ?? []) : []
                return (
                  <div
                    key={idx}
                    className={`min-h-[90px] p-1.5 border-b border-r border-slate-100 ${
                      !day ? 'bg-slate-50/50' : 'bg-white'
                    } ${idx % 7 === 6 ? 'border-r-0' : ''}`}
                  >
                    {day && (
                      <>
                        <span className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full mb-1 ${
                          isToday(day)
                            ? 'bg-blue-600 text-white'
                            : 'text-slate-500'
                        }`}>
                          {day}
                        </span>
                        <div className="flex flex-col gap-0.5">
                          {dayEvents.map(ev => {
                            const meta = STATUS_LABELS[ev.status]
                            const time = new Date(ev.interview_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
                            return (
                              <button
                                key={ev.job_id}
                                onClick={() => setSelectedEvent(ev)}
                                className={`w-full text-left text-xs px-1.5 py-0.5 rounded-md border font-medium truncate ${meta.color} hover:opacity-80 transition`}
                                title={`${ev.title} @ ${ev.company} — ${time}`}
                              >
                                <span className="mr-1">{time}</span>
                                {ev.company}
                              </button>
                            )
                          })}
                        </div>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Upcoming sidebar */}
          <div className="flex flex-col gap-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Upcoming</h3>
              {upcomingEvents.length === 0 ? (
                <p className="text-sm text-slate-400">No upcoming interviews this month.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {upcomingEvents.map(ev => {
                    const meta = STATUS_LABELS[ev.status]
                    const d = new Date(ev.interview_at)
                    return (
                      <button
                        key={ev.job_id}
                        onClick={() => setSelectedEvent(ev)}
                        className="text-left w-full group"
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex flex-col items-center w-10 shrink-0 pt-0.5">
                            <span className="text-xs font-bold text-slate-500 uppercase">
                              {d.toLocaleDateString(undefined, { month: 'short' })}
                            </span>
                            <span className="text-xl font-bold text-slate-900 leading-none">
                              {d.getDate()}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-slate-900 truncate group-hover:text-violet-700 transition">
                              {ev.title}
                            </p>
                            <p className="text-xs text-slate-500 truncate">{ev.company}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className={`text-xs px-1.5 py-0.5 rounded-full border font-medium ${meta.color}`}>
                                {meta.label}
                              </span>
                              <span className="text-xs text-slate-400">
                                {d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Legend */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Legend</h3>
              <div className="flex flex-col gap-2">
                {Object.entries(STATUS_LABELS).map(([, meta]) => (
                  <div key={meta.label} className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${meta.dot}`} />
                    <span className="text-sm text-slate-600">{meta.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Event detail popup */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => setSelectedEvent(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm z-10">
            <button
              onClick={() => setSelectedEvent(null)}
              className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="mb-1">
              <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${STATUS_LABELS[selectedEvent.status]?.color}`}>
                {STATUS_LABELS[selectedEvent.status]?.label}
              </span>
            </div>
            <h3 className="text-lg font-bold text-slate-900 mt-2">{selectedEvent.title}</h3>
            <p className="text-slate-600 font-medium">{selectedEvent.company}</p>
            {selectedEvent.location && (
              <p className="text-slate-400 text-sm flex items-center gap-1 mt-1">
                <MapPin className="w-3.5 h-3.5" />{selectedEvent.location}
              </p>
            )}
            <div className="mt-4 pt-4 border-t border-slate-100">
              <p className="text-sm text-slate-500 font-medium">
                {new Date(selectedEvent.interview_at).toLocaleDateString(undefined, {
                  weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
                })}
              </p>
              <p className="text-2xl font-bold text-slate-900 mt-0.5">
                {new Date(selectedEvent.interview_at).toLocaleTimeString(undefined, {
                  hour: '2-digit', minute: '2-digit'
                })}
              </p>
            </div>
            {selectedEvent.match_score != null && (
              <p className="text-xs text-blue-600 font-semibold mt-3">Match score: {selectedEvent.match_score}/100</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
