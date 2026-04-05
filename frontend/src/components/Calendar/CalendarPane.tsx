import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isToday, addMonths, subMonths,
  addWeeks, subWeeks, addDays, subDays, parseISO, isSameDay,
  differenceInMinutes, setHours, setMinutes, getHours
} from 'date-fns'
import {
  getCalendar, getCalendarShares, createEvent, updateEvent,
  deleteEvent, shareCalendar, unshareCalendar
} from '../../api/client'
import { toast } from '../../hooks/useToast'
import type { CalendarEvent } from '../../types'

type CalView = 'month' | 'week' | 'day'

const EVENT_COLORS = ['#F5C400', '#38bdf8', '#22c55e', '#ef4444', '#a78bfa', '#fb923c', '#f472b6']
const HOURS = Array.from({ length: 24 }, (_, i) => i)
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

interface EventModalState {
  open: boolean
  event?: Partial<CalendarEvent>
  isNew: boolean
}

export default function CalendarPane() {
  const [view, setView] = useState<CalView>('month')
  const [current, setCurrent] = useState(new Date())
  const [showShare, setShowShare] = useState(false)
  const [shareEmail, setShareEmail] = useState('')
  const [eventModal, setEventModal] = useState<EventModalState>({ open: false, isNew: true })
  const queryClient = useQueryClient()

  const { data: calData } = useQuery({
    queryKey: ['calendar'],
    queryFn: () => getCalendar().then((r) => r.data),
  })

  const { data: sharesData } = useQuery({
    queryKey: ['calendar-shares'],
    queryFn: () => getCalendarShares().then((r) => r.data),
  })

  const createMut = useMutation({
    mutationFn: (data: Record<string, unknown>) => createEvent(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['calendar'] }); toast('Event created', 'success') },
    onError: () => toast('Failed to create event', 'error'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => updateEvent(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['calendar'] }); toast('Event updated', 'success') },
    onError: () => toast('Failed to update event', 'error'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteEvent(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['calendar'] }); toast('Event deleted', 'success') },
    onError: () => toast('Failed to delete event', 'error'),
  })

  const shareMut = useMutation({
    mutationFn: (email: string) => shareCalendar(email),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['calendar-shares'] }); setShareEmail(''); toast('Shared', 'success') },
    onError: () => toast('Failed to share', 'error'),
  })

  const unshareMut = useMutation({
    mutationFn: (email: string) => unshareCalendar(email),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['calendar-shares'] }); toast('Unshared', 'success') },
  })

  const events = calData?.events || []

  const nav = (dir: 1 | -1) => {
    if (view === 'month') setCurrent(dir > 0 ? addMonths(current, 1) : subMonths(current, 1))
    else if (view === 'week') setCurrent(dir > 0 ? addWeeks(current, 1) : subWeeks(current, 1))
    else setCurrent(dir > 0 ? addDays(current, 1) : subDays(current, 1))
  }

  const getTitle = () => {
    if (view === 'month') return format(current, 'MMMM yyyy')
    if (view === 'week') {
      const start = startOfWeek(current)
      const end = endOfWeek(current)
      return `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`
    }
    return format(current, 'EEEE, MMMM d, yyyy')
  }

  const openNewEvent = (start?: string) => {
    const defaultStart = start || format(setMinutes(setHours(new Date(), 9), 0), "yyyy-MM-dd'T'HH:mm")
    const defaultEnd = start
      ? format(new Date(new Date(start).getTime() + 60 * 60 * 1000), "yyyy-MM-dd'T'HH:mm")
      : format(setMinutes(setHours(new Date(), 10), 0), "yyyy-MM-dd'T'HH:mm")
    setEventModal({
      open: true,
      isNew: true,
      event: { title: '', description: '', location: '', start: defaultStart, end: defaultEnd, allDay: false, color: '#F5C400' },
    })
  }

  const openEditEvent = (ev: CalendarEvent) => {
    if (ev.readonly) return
    setEventModal({ open: true, isNew: false, event: { ...ev } })
  }

  const saveEvent = async () => {
    const ev = eventModal.event!
    if (!ev.title) { toast('Title is required', 'error'); return }
    if (eventModal.isNew) {
      await createMut.mutateAsync(ev as Record<string, unknown>)
    } else {
      await updateMut.mutateAsync({ id: ev.id!, data: ev as Record<string, unknown> })
    }
    setEventModal({ open: false, isNew: true })
  }

  const deleteEvt = async () => {
    if (!eventModal.event?.id) return
    if (!confirm('Delete this event?')) return
    await deleteMut.mutateAsync(eventModal.event.id)
    setEventModal({ open: false, isNew: true })
  }

  const eventsOnDay = (day: Date) =>
    events.filter((ev) => {
      try {
        const start = parseISO(ev.start)
        const end = parseISO(ev.end)
        return isSameDay(day, start) || (day > start && day < end)
      } catch { return false }
    })

  const renderMonthView = () => {
    const monthStart = startOfMonth(current)
    const monthEnd = endOfMonth(current)
    const gridStart = startOfWeek(monthStart)
    const gridEnd = endOfWeek(monthEnd)
    const days = eachDayOfInterval({ start: gridStart, end: gridEnd })

    return (
      <div className="cal-month">
        <div className="cal-weekdays">
          {WEEKDAYS.map((d) => <div key={d} className="cal-weekday">{d}</div>)}
        </div>
        <div className="cal-grid" style={{ gridTemplateRows: `repeat(${Math.ceil(days.length / 7)}, 1fr)` }}>
          {days.map((day) => {
            const dayEvents = eventsOnDay(day)
            const shown = dayEvents.slice(0, 3)
            const more = dayEvents.length - 3
            return (
              <div
                key={day.toISOString()}
                className={`cal-cell ${!isSameMonth(day, current) ? 'other-month' : ''} ${isToday(day) ? 'today' : ''}`}
                onClick={() => openNewEvent(format(day, "yyyy-MM-dd'T'09:00"))}
              >
                <div className="cal-day-num">{format(day, 'd')}</div>
                {shown.map((ev) => (
                  <div
                    key={ev.id}
                    className={`cal-event-chip ${ev.readonly ? 'shared' : ''}`}
                    style={{ background: ev.color || 'var(--yl)' }}
                    onClick={(e) => { e.stopPropagation(); openEditEvent(ev) }}
                    title={ev.title}
                  >
                    {ev.title}
                  </div>
                ))}
                {more > 0 && <div className="cal-more">+{more} more</div>}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  const renderWeekDayView = () => {
    const days = view === 'week'
      ? eachDayOfInterval({ start: startOfWeek(current), end: endOfWeek(current) })
      : [current]

    return (
      <div className="cal-time-grid" style={{ height: '100%' }}>
        <div className="cal-time-labels">
          <div style={{ height: 48 }} />
          {HOURS.map((h) => (
            <div key={h} className="cal-time-label">
              {h === 0 ? '' : `${h.toString().padStart(2, '0')}:00`}
            </div>
          ))}
        </div>
        <div className="cal-day-cols" style={{ overflowY: 'auto' }}>
          {days.map((day) => {
            const dayEvs = eventsOnDay(day).filter((ev) => !ev.allDay)
            return (
              <div key={day.toISOString()} className="cal-day-col">
                <div className={`cal-day-col-header ${isToday(day) ? 'today' : ''}`}>
                  <div className="day-name">{format(day, 'EEE')}</div>
                  <div className="day-num">{format(day, 'd')}</div>
                </div>
                <div style={{ position: 'relative' }}>
                  {HOURS.map((h) => (
                    <div
                      key={h}
                      className="cal-hour-slot"
                      onClick={() => openNewEvent(format(setMinutes(setHours(day, h), 0), "yyyy-MM-dd'T'HH:mm"))}
                    />
                  ))}
                  {dayEvs.map((ev) => {
                    try {
                      const start = parseISO(ev.start)
                      const end = parseISO(ev.end)
                      const topOffset = (getHours(start) + start.getMinutes() / 60) * 48
                      const height = Math.max((differenceInMinutes(end, start) / 60) * 48, 18)
                      return (
                        <div
                          key={ev.id}
                          className="cal-event-block"
                          style={{ top: topOffset + 48, height, background: ev.color || 'var(--yl)', opacity: ev.readonly ? 0.7 : 1 }}
                          onClick={(e) => { e.stopPropagation(); openEditEvent(ev) }}
                          title={ev.title}
                        >
                          {ev.title}
                        </div>
                      )
                    } catch { return null }
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="cal-pane">
      {/* Header */}
      <div className="cal-header">
        <div className="cal-title">{getTitle()}</div>
        <div className="cal-nav">
          <button className="icon-btn" onClick={() => nav(-1)}><i className="bi bi-chevron-left" /></button>
          <button className="btn-ghost" onClick={() => setCurrent(new Date())}>Today</button>
          <button className="icon-btn" onClick={() => nav(1)}><i className="bi bi-chevron-right" /></button>
        </div>
        <div className="cal-view-btns">
          {(['day', 'week', 'month'] as CalView[]).map((v) => (
            <button key={v} className={`cal-view-btn ${view === v ? 'active' : ''}`} onClick={() => setView(v)}>
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
        <button className="btn-ghost" onClick={() => openNewEvent()}>
          <i className="bi bi-plus" /> New Event
        </button>
        <button
          className={`icon-btn ${showShare ? 'active' : ''}`}
          title="Share calendar"
          onClick={() => setShowShare((v) => !v)}
        >
          <i className="bi bi-share" />
        </button>
      </div>

      {/* Share panel */}
      {showShare && (
        <div className="cal-share-panel" style={{ margin: '0 20px 12px' }}>
          <div style={{ fontWeight: 700, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--dim)', marginBottom: 8 }}>
            Shared With
          </div>
          <div className="cal-share-list">
            {(sharesData?.shares || []).map((email) => (
              <div key={email} className="cal-share-item">
                <span>{email}</span>
                <button className="btn-ghost" style={{ padding: '2px 8px', fontSize: 12 }} onClick={() => unshareMut.mutate(email)}>
                  Remove
                </button>
              </div>
            ))}
            {(sharesData?.shares || []).length === 0 && (
              <div style={{ fontSize: 13, color: 'var(--dim)' }}>Not shared with anyone</div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="form-input"
              style={{ flex: 1 }}
              placeholder="email@domain.com"
              value={shareEmail}
              onChange={(e) => setShareEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && shareEmail && shareMut.mutate(shareEmail)}
            />
            <button className="btn-primary" onClick={() => shareEmail && shareMut.mutate(shareEmail)}>
              <i className="bi bi-person-plus" /> Share
            </button>
          </div>
        </div>
      )}

      {/* Calendar body */}
      <div className="cal-body">
        {view === 'month' ? renderMonthView() : renderWeekDayView()}
      </div>

      {/* Event editor modal */}
      {eventModal.open && (
        <div className="modal-overlay" onClick={() => setEventModal({ open: false, isNew: true })}>
          <div className="event-modal" onClick={(e) => e.stopPropagation()}>
            <div className="event-modal-title">
              {eventModal.isNew ? 'NEW EVENT' : 'EDIT EVENT'}
            </div>

            <div className="form-group">
              <label className="form-label">Title</label>
              <input
                className="form-input"
                value={eventModal.event?.title || ''}
                onChange={(e) => setEventModal((s) => ({ ...s, event: { ...s.event, title: e.target.value } }))}
                autoFocus
              />
            </div>

            <div className="form-group">
              <label className="form-label">Description</label>
              <input
                className="form-input"
                value={eventModal.event?.description || ''}
                onChange={(e) => setEventModal((s) => ({ ...s, event: { ...s.event, description: e.target.value } }))}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Location</label>
              <input
                className="form-input"
                value={eventModal.event?.location || ''}
                onChange={(e) => setEventModal((s) => ({ ...s, event: { ...s.event, location: e.target.value } }))}
              />
            </div>

            <div className="form-grid-2" style={{ marginBottom: 14 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Start</label>
                <input
                  type="datetime-local"
                  className="form-input"
                  value={eventModal.event?.start?.slice(0, 16) || ''}
                  onChange={(e) => setEventModal((s) => ({ ...s, event: { ...s.event, start: e.target.value } }))}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">End</label>
                <input
                  type="datetime-local"
                  className="form-input"
                  value={eventModal.event?.end?.slice(0, 16) || ''}
                  onChange={(e) => setEventModal((s) => ({ ...s, event: { ...s.event, end: e.target.value } }))}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={eventModal.event?.allDay || false}
                  onChange={(e) => setEventModal((s) => ({ ...s, event: { ...s.event, allDay: e.target.checked } }))}
                />
                <span className="toggle-slider" />
                <span style={{ fontSize: 13 }}>All day</span>
              </label>
            </div>

            <div className="form-group">
              <label className="form-label">Color</label>
              <div className="color-swatches">
                {EVENT_COLORS.map((c) => (
                  <div
                    key={c}
                    className={`color-swatch ${eventModal.event?.color === c ? 'selected' : ''}`}
                    style={{ background: c }}
                    onClick={() => setEventModal((s) => ({ ...s, event: { ...s.event, color: c } }))}
                  />
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', marginTop: 4 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-primary" onClick={saveEvent}>
                  <i className="bi bi-check" /> Save
                </button>
                <button className="btn-ghost" onClick={() => setEventModal({ open: false, isNew: true })}>
                  Cancel
                </button>
              </div>
              {!eventModal.isNew && (
                <button className="btn-danger" onClick={deleteEvt}>
                  <i className="bi bi-trash3" /> Delete
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
