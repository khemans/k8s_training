import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import api from '../lib/api'
import toast from 'react-hot-toast'
import {
  Bookmark,
  Send,
  Phone,
  Users,
  Trophy,
  XCircle,
  ExternalLink,
  Loader2,
  FileText,
  Link as LinkIcon,
  X,
  Trash2,
  MapPin,
  CalendarDays,
  AlertTriangle,
} from 'lucide-react'

const STATUSES = [
  { id: 'saved', label: 'Saved', icon: Bookmark, color: 'bg-slate-100 border-slate-200 text-slate-700' },
  { id: 'applied', label: 'Applied', icon: Send, color: 'bg-blue-100 border-blue-200 text-blue-700' },
  { id: 'phone_screen', label: 'Phone Screen', icon: Phone, color: 'bg-amber-100 border-amber-200 text-amber-700' },
  { id: 'interview', label: 'Interview', icon: Users, color: 'bg-violet-100 border-violet-200 text-violet-700' },
  { id: 'offer', label: 'Offer', icon: Trophy, color: 'bg-emerald-100 border-emerald-200 text-emerald-700' },
  { id: 'rejected', label: 'Rejected', icon: XCircle, color: 'bg-red-100 border-red-200 text-red-700' },
] as const

type StatusId = typeof STATUSES[number]['id']

interface TrackerCard {
  id: string
  job_id: string
  status: string
  saved_at: string
  applied_at: string | null
  interview_at: string | null
  notes: string | null
  title: string
  company: string
  location: string | null
  source: string
  source_url: string
  career_page_url: string | null
  match_score: number | null
  match_explanation: string | null
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function TrackerCardComponent({
  card,
  onStatusChange,
  onNotesChange,
  onUnsave,
  onOpen,
  updating,
}: {
  card: TrackerCard
  onStatusChange: (jobId: string, status: string) => void
  onNotesChange: (jobId: string, notes: string) => void
  onUnsave: (jobId: string) => void
  onOpen: (card: TrackerCard) => void
  updating: Record<string, boolean>
}) {
  const [notesEdit, setNotesEdit] = useState(card.notes ?? '')
  const [showNotes, setShowNotes] = useState(false)
  const meta = STATUSES.find(s => s.id === card.status) ?? STATUSES[0]
  const isUpdating = updating[card.job_id]

  const handleMove = (newStatus: string) => {
    if (newStatus === card.status) return
    onStatusChange(card.job_id, newStatus)
  }

  const handleSaveNotes = () => {
    if (notesEdit !== (card.notes ?? '')) {
      onNotesChange(card.job_id, notesEdit)
    }
    setShowNotes(false)
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm hover:shadow transition">
      <button
        type="button"
        onClick={() => onOpen(card)}
        className="text-left w-full block"
      >
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-slate-900 text-sm leading-snug line-clamp-2">{card.title}</h3>
            <p className="text-slate-600 text-xs mt-0.5">{card.company}</p>
          </div>
          {card.match_score != null && (
            <span className="shrink-0 w-8 h-8 rounded-full bg-blue-50 text-blue-700 flex items-center justify-center text-xs font-bold">
              {card.match_score}
            </span>
          )}
        </div>
      </button>
      {(card.applied_at || card.notes) && (
        <div className="text-xs text-slate-500 space-y-0.5 mb-2">
          {card.applied_at && <p>Applied {formatDate(card.applied_at)}</p>}
          {card.interview_at && ['phone_screen','interview'].includes(card.status) && (
            <p className="flex items-center gap-1 text-violet-700 font-medium">
              <CalendarDays className="w-3 h-3" />{formatDate(card.interview_at)}
            </p>
          )}
          {card.notes && !showNotes && <p className="line-clamp-2">{card.notes}</p>}
        </div>
      )}
      {showNotes ? (
        <div className="mb-3">
          <textarea
            value={notesEdit}
            onChange={e => setNotesEdit(e.target.value)}
            placeholder="Notes…"
            className="w-full text-sm border border-slate-200 rounded-lg p-2 resize-none h-20"
            autoFocus
            onClick={e => e.stopPropagation()}
          />
          <div className="flex gap-2 mt-1">
            <button onClick={e => { e.stopPropagation(); handleSaveNotes() }} className="text-xs font-medium text-blue-600 hover:underline">Save</button>
            <button onClick={e => { e.stopPropagation(); setNotesEdit(card.notes ?? ''); setShowNotes(false) }} className="text-xs text-slate-500 hover:underline">Cancel</button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={e => { e.stopPropagation(); setShowNotes(true) }}
          className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 mb-3"
        >
          <FileText className="w-3 h-3" /> {card.notes ? 'Edit notes' : 'Add notes'}
        </button>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={card.status}
          onChange={e => handleMove(e.target.value)}
          disabled={isUpdating}
          onClick={e => e.stopPropagation()}
          className="text-xs font-medium rounded-lg border border-slate-200 bg-white text-slate-700 px-2 py-1.5 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
        >
          {STATUSES.map(s => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onOpen(card) }}
          className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
        >
          View JD
        </button>
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onUnsave(card.job_id) }}
          disabled={isUpdating}
          className="flex items-center gap-1 text-xs text-slate-400 hover:text-red-600 disabled:opacity-50"
          title="Remove from tracker"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  )
}

// Job detail drawer: shows full JD in-app; Apply opens external link only
function JobDetailDrawer({
  card,
  onClose,
  onStatusChange,
  onNotesChange,
  onInterviewDateChange,
  onUnsave,
  updating,
}: {
  card: TrackerCard | null
  onClose: () => void
  onStatusChange: (jobId: string, status: string) => void
  onNotesChange: (jobId: string, notes: string) => void
  onInterviewDateChange: (jobId: string, date: string | null) => void
  onUnsave: (jobId: string) => void
  updating: Record<string, boolean>
}) {
  const [jobDetail, setJobDetail] = useState<{ description?: string; is_expired?: boolean } | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [notesEdit, setNotesEdit] = useState(card?.notes ?? '')
  const [notesSaving, setNotesSaving] = useState(false)
  const [interviewDateSaving, setInterviewDateSaving] = useState(false)
  const [showApplyPrompt, setShowApplyPrompt] = useState(false)

  useEffect(() => {
    if (!card) return
    setNotesEdit(card.notes ?? '')
    setJobDetail(null)
    setLoadingDetail(true)
    api.get(`/jobs/${card.job_id}`)
      .then(res => setJobDetail(res.data))
      .catch(() => setJobDetail({ description: undefined }))
      .finally(() => setLoadingDetail(false))
  }, [card?.job_id])

  useEffect(() => {
    if (card) setNotesEdit(card.notes ?? '')
  }, [card?.notes])

  if (!card) return null

  const applyUrl = card.career_page_url || card.source_url
  const hasApplyUrl = !!applyUrl && !applyUrl.startsWith('pasted://')
  const meta = STATUSES.find(s => s.id === card.status) ?? STATUSES[0]

  const handleSaveNotes = async () => {
    if (notesEdit === (card.notes ?? '')) return
    setNotesSaving(true)
    try {
      await onNotesChange(card.job_id, notesEdit)
    } finally {
      setNotesSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/30" onClick={onClose} />
      <div className="w-full max-w-xl bg-white shadow-2xl flex flex-col h-full overflow-hidden animate-in slide-in-from-right duration-200">
        <div className="p-6 border-b border-slate-200 flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${meta.color}`}>{meta.label}</span>
              {card.match_score != null && (
                <span className="text-xs font-semibold text-blue-600">Match: {card.match_score}/100</span>
              )}
            </div>
            <h2 className="text-lg font-bold text-slate-900 leading-snug">{card.title}</h2>
            <p className="text-slate-600 mt-1">{card.company}</p>
            {card.location && (
              <p className="text-slate-500 text-sm mt-1 flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" /> {card.location}
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100">
          {hasApplyUrl ? (
            <button
              type="button"
              onClick={() => card.status === 'applied' ? window.open(applyUrl, '_blank') : setShowApplyPrompt(true)}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition"
            >
              Apply <ExternalLink className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              disabled
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-100 text-slate-400 font-semibold rounded-xl cursor-not-allowed"
              title="No application URL available for this job"
            >
              Apply <ExternalLink className="w-4 h-4" />
            </button>
          )}

          {showApplyPrompt && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-black/40" onClick={() => setShowApplyPrompt(false)} />
              <div className="relative bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm z-10">
                <h3 className="text-base font-bold text-slate-900 mb-1">Opening application</h3>
                <p className="text-sm text-slate-500 mb-5">
                  Did you apply to <span className="font-semibold text-slate-700">{card.title}</span> at <span className="font-semibold text-slate-700">{card.company}</span>?
                </p>
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => {
                      onStatusChange(card.job_id, 'applied')
                      window.open(applyUrl, '_blank')
                      setShowApplyPrompt(false)
                    }}
                    className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition text-sm"
                  >
                    ✓ Yes, I applied
                  </button>
                  <button
                    onClick={() => { window.open(applyUrl, '_blank'); setShowApplyPrompt(false) }}
                    className="w-full px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-xl transition text-sm"
                  >
                    No, but save it
                  </button>
                  <button
                    onClick={() => setShowApplyPrompt(false)}
                    className="w-full px-4 py-2.5 text-slate-400 hover:text-slate-600 font-medium transition text-sm"
                  >
                    Not interested
                  </button>
                </div>
              </div>
            </div>
          )}
          <select
            value={card.status}
            onChange={e => onStatusChange(card.job_id, e.target.value)}
            disabled={updating[card.job_id]}
            className="text-sm font-medium rounded-xl border border-slate-200 bg-white px-4 py-2.5"
          >
            {STATUSES.map(s => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </div>

        <div className="flex-1 overflow-y-auto">
          {jobDetail?.is_expired && (
            <div className="mx-6 mt-4 flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800">
                <span className="font-semibold">This listing may no longer be active.</span> The job posting could not be verified — it may have been filled or removed.
              </p>
            </div>
          )}
          {card.match_explanation && (
            <div className="p-6 border-b border-slate-100 bg-blue-50/50">
              <h3 className="text-sm font-semibold text-slate-700 mb-2">Match summary</h3>
              <p className="text-sm text-slate-600">{card.match_explanation}</p>
            </div>
          )}

          {['phone_screen', 'interview'].includes(card.status) && (
            <div className="p-6 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
                <CalendarDays className="w-4 h-4 text-violet-500" />
                Interview Date &amp; Time
              </h3>
              <input
                type="datetime-local"
                defaultValue={card.interview_at ? (() => { const d = new Date(card.interview_at); const pad = (n: number) => String(n).padStart(2,'0'); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}` })() : ''}
                disabled={interviewDateSaving}
                onChange={async (e) => {
                  setInterviewDateSaving(true)
                  try {
                    await onInterviewDateChange(card.job_id, e.target.value || null)
                  } finally {
                    setInterviewDateSaving(false)
                  }
                }}
                className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-violet-300"
              />
              {card.interview_at && (
                <p className="text-xs text-slate-400 mt-1.5">
                  {new Date(card.interview_at).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
              )}
            </div>
          )}

          <div className="p-6">
            <h3 className="text-sm font-semibold text-slate-700 mb-2">Notes</h3>
            <textarea
              value={notesEdit}
              onChange={e => setNotesEdit(e.target.value)}
              onBlur={handleSaveNotes}
              placeholder="Add notes…"
              rows={2}
              className="w-full text-sm border border-slate-200 rounded-xl p-3 resize-none"
              disabled={notesSaving}
            />
          </div>

          <div className="p-6 border-t border-slate-100">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Job description</h3>
            {loadingDetail ? (
              <div className="flex items-center gap-2 text-slate-500">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading…
              </div>
            ) : (
              <div className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
                {jobDetail?.description || 'No description available.'}
              </div>
            )}
          </div>
        </div>

        <div className="p-6 border-t border-slate-200 bg-slate-50">
          <button
            type="button"
            onClick={() => onUnsave(card.job_id)}
            disabled={updating[card.job_id]}
            className="flex items-center gap-2 text-sm text-slate-500 hover:text-red-600 disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" /> Remove from tracker
          </button>
        </div>
      </div>
    </div>
  )
}

export default function TrackerPage() {
  const [cards, setCards] = useState<TrackerCard[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<Record<string, boolean>>({})
  const [showFromUrlModal, setShowFromUrlModal] = useState(false)
  const [fromUrlUrl, setFromUrlUrl] = useState('')
  const [fromUrlStatus, setFromUrlStatus] = useState('applied')
  const [fromUrlNotes, setFromUrlNotes] = useState('')
  const [fromUrlLoading, setFromUrlLoading] = useState(false)
  const [selectedCard, setSelectedCard] = useState<TrackerCard | null>(null)

  // Paste JD state
  const [showPasteModal, setShowPasteModal] = useState(false)
  const [pasteTitle, setPasteTitle] = useState('')
  const [pasteCompany, setPasteCompany] = useState('')
  const [pasteLocation, setPasteLocation] = useState('')
  const [pasteUrl, setPasteUrl] = useState('')
  const [pasteDescription, setPasteDescription] = useState('')
  const [pasteNotes, setPasteNotes] = useState('')
  const [pasteLoading, setPasteLoading] = useState(false)

  const fetchTracker = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/matches/tracker/')
      setCards(res.data)
    } catch {
      toast.error('Failed to load tracker')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchTracker() }, [fetchTracker])

  const handleStatusChange = async (jobId: string, status: string) => {
    setUpdating(prev => ({ ...prev, [jobId]: true }))
    try {
      await api.patch(`/matches/saved/${jobId}`, { status })
      setCards(prev => prev.map(c => c.job_id === jobId ? { ...c, status, applied_at: status === 'applied' ? new Date().toISOString() : c.applied_at } : c))
      toast.success('Status updated')
    } catch {
      toast.error('Failed to update status')
    } finally {
      setUpdating(prev => ({ ...prev, [jobId]: false }))
    }
  }

  const handleNotesChange = async (jobId: string, notes: string) => {
    setUpdating(prev => ({ ...prev, [jobId]: true }))
    try {
      await api.patch(`/matches/saved/${jobId}`, { notes: notes || null })
      setCards(prev => prev.map(c => c.job_id === jobId ? { ...c, notes: notes || null } : c))
      toast.success('Notes saved')
    } catch {
      toast.error('Failed to save notes')
    } finally {
      setUpdating(prev => ({ ...prev, [jobId]: false }))
    }
  }

  const handleInterviewDateChange = async (jobId: string, date: string | null) => {
    try {
      const interview_at = date ? new Date(date).toISOString() : null
      await api.patch(`/matches/saved/${jobId}`, { interview_at })
      setCards(prev => prev.map(c => c.job_id === jobId ? { ...c, interview_at } : c))
    } catch {
      toast.error('Failed to save interview date')
    }
  }

  const handleUnsave = async (jobId: string) => {
    setUpdating(prev => ({ ...prev, [jobId]: true }))
    try {
      await api.delete(`/matches/saved/${jobId}`)
      setCards(prev => prev.filter(c => c.job_id !== jobId))
      if (selectedCard?.job_id === jobId) setSelectedCard(null)
      toast.success('Removed from tracker')
    } catch {
      toast.error('Failed to remove')
    } finally {
      setUpdating(prev => ({ ...prev, [jobId]: false }))
    }
  }

  const resetPasteModal = () => {
    setPasteTitle('')
    setPasteCompany('')
    setPasteLocation('')
    setPasteUrl('')
    setPasteDescription('')
    setPasteNotes('')
    setShowPasteModal(false)
  }

  const handleAddFromText = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pasteTitle.trim() || !pasteCompany.trim() || !pasteDescription.trim()) {
      toast.error('Title, company, and job description are required')
      return
    }
    setPasteLoading(true)
    try {
      await api.post('/matches/tracker/from-text', {
        title: pasteTitle.trim(),
        company: pasteCompany.trim(),
        location: pasteLocation.trim() || undefined,
        url: pasteUrl.trim() || undefined,
        description: pasteDescription.trim(),
        notes: pasteNotes.trim() || undefined,
      })
      await fetchTracker()
      resetPasteModal()
      toast.success('Job added to tracker and match score calculated')
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Could not add job'
      toast.error(Array.isArray(msg) ? msg[0] : msg)
    } finally {
      setPasteLoading(false)
    }
  }

  const handleAddFromUrl = async (e: React.FormEvent) => {
    e.preventDefault()
    const url = fromUrlUrl.trim()
    if (!url) {
      toast.error('Please enter a job URL')
      return
    }
    setFromUrlLoading(true)
    try {
      await api.post('/matches/tracker/from-url', {
        url,
        status: fromUrlStatus,
        notes: fromUrlNotes.trim() || undefined,
      })
      await fetchTracker()
      setShowFromUrlModal(false)
      setFromUrlUrl('')
      setFromUrlNotes('')
      setFromUrlStatus('applied')
      toast.success('Job added to tracker and match score calculated')
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Could not add job from URL'
      toast.error(Array.isArray(msg) ? msg[0] : msg)
    } finally {
      setFromUrlLoading(false)
    }
  }

  const byStatus = (status: StatusId) => cards.filter(c => c.status === status)

  return (
    <div className="max-w-7xl mx-auto py-8 px-4">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Application Tracker</h1>
          <p className="text-slate-500 text-sm mt-1">Move jobs through your pipeline. Save jobs from the Jobs page or add by URL.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowPasteModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-700 hover:bg-slate-800 text-white text-sm font-semibold rounded-xl shadow-sm transition"
          >
            <FileText className="w-4 h-4" /> Paste JD
          </button>
          <button
            type="button"
            onClick={() => setShowFromUrlModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl shadow-sm transition"
          >
            <LinkIcon className="w-4 h-4" /> Add from URL
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
        </div>
      ) : cards.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <Bookmark className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-600 font-medium">No jobs in your tracker yet</p>
          <p className="text-slate-500 text-sm mt-1">Save jobs from the <Link to="/jobs" className="text-blue-600 hover:underline">Jobs</Link> page or{' '}<button type="button" onClick={() => setShowFromUrlModal(true)} className="text-blue-600 hover:underline">add a job by URL</button>.</p>
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4 items-start">
          {STATUSES.map(({ id, label, icon: Icon, color }) => (
            <div key={id} className="min-w-[300px] flex-shrink-0 flex flex-col rounded-xl border border-slate-200 bg-slate-50/50">
              <div className={`flex items-center gap-2 px-4 py-3 border-b border-slate-200 rounded-t-xl ${color} border`}>
                <Icon className="w-4 h-4 shrink-0" />
                <span className="font-semibold text-sm">{label}</span>
                <span className="ml-auto text-xs opacity-80">({byStatus(id).length})</span>
              </div>
              <div className="p-3 flex-1 space-y-3 overflow-y-auto max-h-[70vh]">
                {byStatus(id).map(card => (
                  <TrackerCardComponent
                    key={card.id}
                    card={card}
                    onStatusChange={handleStatusChange}
                    onNotesChange={handleNotesChange}
                    onUnsave={handleUnsave}
                    onOpen={setSelectedCard}
                    updating={updating}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Job detail drawer: JD in-app; Apply = external only */}
      <JobDetailDrawer
        card={selectedCard ? (cards.find(c => c.job_id === selectedCard.job_id) ?? null) : null}
        onClose={() => setSelectedCard(null)}
        onStatusChange={handleStatusChange}
        onNotesChange={handleNotesChange}
        onInterviewDateChange={handleInterviewDateChange}
        onUnsave={handleUnsave}
        updating={updating}
      />

      {/* Add from URL modal */}
      {showFromUrlModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => !fromUrlLoading && setShowFromUrlModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl max-w-lg w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900">Track job from URL</h2>
              <button type="button" onClick={() => !fromUrlLoading && setShowFromUrlModal(false)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-slate-500 mb-4">Paste a job posting URL. We’ll fetch the page, extract the job details, add it to your tracker, and calculate your match score.</p>
            <form onSubmit={handleAddFromUrl} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Job URL</label>
                <input
                  type="url"
                  value={fromUrlUrl}
                  onChange={e => setFromUrlUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                  disabled={fromUrlLoading}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Initial status</label>
                <select
                  value={fromUrlStatus}
                  onChange={e => setFromUrlStatus(e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={fromUrlLoading}
                >
                  {STATUSES.map(s => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Notes (optional)</label>
                <textarea
                  value={fromUrlNotes}
                  onChange={e => setFromUrlNotes(e.target.value)}
                  placeholder="e.g. Applied 2/26, referral from..."
                  rows={2}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  disabled={fromUrlLoading}
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => !fromUrlLoading && setShowFromUrlModal(false)}
                  className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50"
                  disabled={fromUrlLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={fromUrlLoading}
                  className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm font-semibold rounded-xl flex items-center justify-center gap-2"
                >
                  {fromUrlLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LinkIcon className="w-4 h-4" />}
                  {fromUrlLoading ? 'Adding…' : 'Add & score'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Paste JD modal */}
      {showPasteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => !pasteLoading && resetPasteModal()} />
          <div className="relative bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900">Track job from pasted JD</h2>
              <button type="button" onClick={() => !pasteLoading && resetPasteModal()} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-slate-500 mb-4">Paste in a job description you received by email or found without a link. We'll score it against your resume and add it to your tracker.</p>
            <form onSubmit={handleAddFromText} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Job Title <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={pasteTitle}
                  onChange={e => setPasteTitle(e.target.value)}
                  placeholder="e.g. Senior Product Manager"
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                  disabled={pasteLoading}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Company <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={pasteCompany}
                  onChange={e => setPasteCompany(e.target.value)}
                  placeholder="e.g. Acme Corp"
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                  disabled={pasteLoading}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Location <span className="text-slate-400 font-normal">(optional)</span></label>
                <input
                  type="text"
                  value={pasteLocation}
                  onChange={e => setPasteLocation(e.target.value)}
                  placeholder="e.g. Remote, New York NY"
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={pasteLoading}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Job URL <span className="text-slate-400 font-normal">(optional — enables Apply button)</span></label>
                <input
                  type="url"
                  value={pasteUrl}
                  onChange={e => setPasteUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={pasteLoading}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Job Description <span className="text-red-500">*</span></label>
                <textarea
                  value={pasteDescription}
                  onChange={e => setPasteDescription(e.target.value)}
                  placeholder="Paste the full job description here…"
                  rows={8}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  required
                  disabled={pasteLoading}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Notes <span className="text-slate-400 font-normal">(optional)</span></label>
                <textarea
                  value={pasteNotes}
                  onChange={e => setPasteNotes(e.target.value)}
                  placeholder="e.g. Referred by John, recruiter reached out…"
                  rows={2}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  disabled={pasteLoading}
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => !pasteLoading && resetPasteModal()}
                  className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50"
                  disabled={pasteLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pasteLoading}
                  className="flex-1 px-4 py-2.5 bg-slate-700 hover:bg-slate-800 disabled:bg-slate-300 text-white text-sm font-semibold rounded-xl flex items-center justify-center gap-2"
                >
                  {pasteLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                  {pasteLoading ? 'Scoring…' : 'Add & score'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
