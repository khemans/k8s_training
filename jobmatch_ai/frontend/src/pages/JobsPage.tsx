import { useEffect, useState, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import api from '../lib/api'
import toast from 'react-hot-toast'
import {
  Briefcase, Search, MapPin, Filter, AlertTriangle,
  ExternalLink, Bookmark, BookmarkCheck,
  Zap, X, Loader2, Trash2,
  Building2, Clock, DollarSign, TrendingUp,
  ArrowLeft, ArrowRight, ChevronDown,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────

interface Job {
  id: string
  title: string
  company: string
  location: string | null
  source: string
  source_url: string
  career_page_url: string | null
  salary_range: { min?: number; max?: number; period?: string } | null
  posted_at: string | null
  scraped_at: string
  is_active: boolean
  is_expired?: boolean
}

interface JobMatch {
  id: string
  job_id: string
  match_score: number
  match_explanation: string
  skills_gap: string[]
  resume_suggestions: string[]
  created_at: string
}

interface JobsResponse {
  total: number
  page: number
  limit: number
  results: Job[]
  total_unanalyzed?: number  // total unanalyzed across all pages (when sort_by_score)
}

const SOURCE_LABELS: Record<string, { label: string; color: string }> = {
  indeed:       { label: 'Indeed',       color: 'bg-blue-50 text-blue-700 border-blue-200' },
  glassdoor:    { label: 'Glassdoor',    color: 'bg-green-50 text-green-700 border-green-200' },
  linkedin:     { label: 'LinkedIn',     color: 'bg-sky-50 text-sky-700 border-sky-200' },
  ziprecruiter: { label: 'ZipRecruiter', color: 'bg-orange-50 text-orange-700 border-orange-200' },
  jsearch:      { label: 'JSearch',      color: 'bg-purple-50 text-purple-700 border-purple-200' },
  wellfound:    { label: 'Wellfound',    color: 'bg-rose-50 text-rose-700 border-rose-200' },
}

function scoreColor(score: number) {
  if (score >= 80) return { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', ring: 'stroke-emerald-500', label: 'Excellent' }
  if (score >= 65) return { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', ring: 'stroke-blue-500', label: 'Strong' }
  if (score >= 50) return { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', ring: 'stroke-amber-500', label: 'Moderate' }
  return { bg: 'bg-red-50', text: 'text-red-600', border: 'border-red-200', ring: 'stroke-red-400', label: 'Weak' }
}

function formatSalary(range: Job['salary_range']): string | null {
  if (!range?.min && !range?.max) return null
  const fmt = (n: number) => n >= 1000 ? `$${(n / 1000).toFixed(0)}k` : `$${n}`
  const period = range.period === 'hour' ? '/hr' : '/yr'
  if (range.min && range.max) return `${fmt(range.min)} – ${fmt(range.max)}${period}`
  if (range.min) return `${fmt(range.min)}+${period}`
  return null
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Recently'
  const diff = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return `${Math.floor(days / 30)}mo ago`
}

// ── Score Ring ───────────────────────────────────────────────────────────

function ScoreRing({ score, size = 52 }: { score: number; size?: number }) {
  const colors = scoreColor(score)
  const r = (size - 8) / 2
  const circ = 2 * Math.PI * r
  const dash = (score / 100) * circ
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={4} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" strokeWidth={4} strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          className={`transition-all duration-700 ${colors.ring}`} />
      </svg>
      <span className="absolute text-xs font-bold text-slate-700">{score}</span>
    </div>
  )
}

// ── Job Card ─────────────────────────────────────────────────────────────

function CompanyAvatar({ name }: { name: string }) {
  const initials = name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
  const colors = [
    'bg-blue-100 text-blue-700', 'bg-emerald-100 text-emerald-700',
    'bg-violet-100 text-violet-700', 'bg-amber-100 text-amber-700',
    'bg-rose-100 text-rose-700', 'bg-cyan-100 text-cyan-700',
    'bg-indigo-100 text-indigo-700', 'bg-orange-100 text-orange-700',
  ]
  const color = colors[name.charCodeAt(0) % colors.length]
  return (
    <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${color}`}>
      {initials}
    </div>
  )
}

function JobCard({ job, match, saved, onSave, onAnalyze, onClick, analyzing, onDelete }: {
  job: Job; match?: JobMatch; saved: boolean
  onSave: () => void; onAnalyze: () => void; onClick: () => void; analyzing: boolean
  onDelete?: () => void
}) {
  const src = SOURCE_LABELS[job.source] ?? { label: job.source, color: 'bg-slate-100 text-slate-600 border-slate-200' }
  const salary = formatSalary(job.salary_range)
  const colors = match ? scoreColor(match.match_score) : null

  return (
    <div
      className="group bg-white border border-slate-200 rounded-2xl px-6 py-5 hover:shadow-md hover:border-slate-300 transition-all duration-200 cursor-pointer"
      onClick={onClick}
    >
      <div className="flex items-start gap-4">
        {/* Logo + Score */}
        <div className="relative shrink-0">
          <CompanyAvatar name={job.company} />
          {match && (
            <div className="absolute -bottom-1.5 -right-1.5">
              <ScoreRing score={match.match_score} size={28} />
            </div>
          )}
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Title row */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-slate-900 text-base leading-snug group-hover:text-blue-700 transition-colors truncate">
                  {job.title}
                </h3>
                {job.posted_at && (
                  <span className="text-xs text-slate-400 shrink-0">{timeAgo(job.posted_at)}</span>
                )}
              </div>
              <p className="text-sm text-slate-500 mt-0.5">{job.company}</p>
            </div>

            {/* Right actions */}
            <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
              {!match && (
                <button
                  onClick={onAnalyze}
                  disabled={analyzing}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-xs font-semibold rounded-xl transition whitespace-nowrap"
                >
                  {analyzing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                  {analyzing ? 'Analyzing…' : 'Analyze'}
                </button>
              )}
              <button
                onClick={onSave}
                className={`p-2 rounded-xl border transition ${saved ? 'border-blue-200 bg-blue-50 text-blue-600' : 'border-slate-200 text-slate-400 hover:text-blue-500 hover:border-blue-200'}`}
              >
                {saved ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
              </button>
              {job.source === 'imported' && onDelete && (
                <button
                  onClick={onDelete}
                  title="Delete imported job"
                  className="p-2 rounded-xl border border-slate-200 text-slate-400 hover:text-red-500 hover:border-red-200 transition"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Metadata row */}
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            {job.location && (
              <span className="text-xs text-slate-500 flex items-center gap-1">
                <MapPin className="w-3 h-3 text-slate-400" />{job.location}
              </span>
            )}
            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${src.color}`}>
              {src.label}
            </span>
            {salary && (
              <span className="text-xs text-slate-500 flex items-center gap-1">
                <DollarSign className="w-3 h-3 text-slate-400" />{salary}
              </span>
            )}
            {match && (
              <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${colors!.bg} ${colors!.text} ${colors!.border}`}>
                {colors!.label} match
              </span>
            )}
          </div>

          {/* Skills gap pills */}
          {match && match.skills_gap.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              {match.skills_gap.slice(0, 4).map(skill => (
                <span key={skill} className="px-2 py-0.5 bg-red-50 text-red-600 text-xs rounded-full border border-red-100">
                  gap: {skill}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Job Detail Drawer ────────────────────────────────────────────────────
// ── Job Detail Drawer ────────────────────────────────────────────────────

function JobDrawer({ job, match, saved, onSave, onAnalyze, onClose, analyzing, onMarkApplied }: {
  job: Job & { description?: string }; match?: JobMatch; saved: boolean
  onSave: () => void; onAnalyze: () => void; onClose: () => void; analyzing: boolean
  onMarkApplied?: (jobId: string) => void
}) {
  const [showApplyPrompt, setShowApplyPrompt] = useState(false)
  const src = SOURCE_LABELS[job.source] ?? { label: job.source, color: 'bg-slate-100 text-slate-600 border-slope-200' }
  const salary = formatSalary(job.salary_range)
  const applyUrl = job.career_page_url || job.source_url
  const colors = match ? scoreColor(match.match_score) : null

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/20 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-2xl bg-white shadow-2xl flex flex-col h-full overflow-hidden animate-slide-in-right">
        {/* Header */}
        <div className="px-6 pt-6 pb-5 border-b border-slate-100">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="flex items-start gap-4 flex-1 min-w-0">
              <CompanyAvatar name={job.company} />
              <div className="flex-1 min-w-0">
                <h2 className="text-xl font-bold text-slate-900 leading-snug">{job.title}</h2>
                <div className="flex items-center gap-1.5 mt-1 text-sm text-slate-500 flex-wrap">
                  <span className="font-medium text-slate-700">{job.company}</span>
                  {src.label !== job.company && (
                    <>
                      <span className="text-slate-300">·</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${src.color}`}>{src.label}</span>
                    </>
                  )}
                  {job.posted_at && (
                    <>
                      <span className="text-slate-300">·</span>
                      <span className="text-xs text-slate-400">{timeAgo(job.posted_at)}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 transition shrink-0">
              <X className="w-5 h-5" />
            </button>
          </div>
          {/* Metadata pills row */}
          <div className="flex items-center gap-2 flex-wrap">
            {job.location && (
              <span className="inline-flex items-center gap-1.5 text-xs text-slate-600 bg-slate-100 rounded-full px-3 py-1.5 font-medium">
                <MapPin className="w-3 h-3" />{job.location}
              </span>
            )}
            {salary && (
              <span className="inline-flex items-center gap-1.5 text-xs text-slate-600 bg-slate-100 rounded-full px-3 py-1.5 font-medium">
                <DollarSign className="w-3 h-3" />{salary}
              </span>
            )}
            {match && (
              <span className={`inline-flex items-center gap-1.5 text-xs rounded-full px-3 py-1.5 font-semibold border ${colors!.bg} ${colors!.text} ${colors!.border}`}>
                {match.match_score}/100 · {colors!.label} match
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100">
          <button
            type="button"
            onClick={() => setShowApplyPrompt(true)}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition"
          >
            Apply Now <ExternalLink className="w-4 h-4" />
          </button>

          {showApplyPrompt && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-black/40" onClick={() => setShowApplyPrompt(false)} />
              <div className="relative bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm z-10">
                <h3 className="text-base font-bold text-slate-900 mb-1">Opening application</h3>
                <p className="text-sm text-slate-500 mb-5">
                  Did you apply to <span className="font-semibold text-slate-700">{job.title}</span> at <span className="font-semibold text-slate-700">{job.company}</span>?
                </p>
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => {
                      onMarkApplied?.(job.id)
                      window.open(applyUrl, '_blank')
                      setShowApplyPrompt(false)
                    }}
                    className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition text-sm"
                  >
                    ✓ Yes, I applied
                  </button>
                  <button
                    onClick={() => { onSave(); window.open(applyUrl, '_blank'); setShowApplyPrompt(false) }}
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
          <button onClick={onSave}
            className={`p-2.5 rounded-xl border-2 transition ${saved ? 'border-blue-300 bg-blue-50 text-blue-600' : 'border-slate-200 text-slate-400 hover:border-blue-300 hover:text-blue-500'}`}>
            {saved ? <BookmarkCheck className="w-5 h-5" /> : <Bookmark className="w-5 h-5" />}
          </button>
        </div>

        {/* Scrollable */}
        <div className="flex-1 overflow-y-auto">
          {/* Expired warning */}
          {job.is_expired && (
            <div className="mx-6 mt-4 flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800">
                <span className="font-semibold">This listing may no longer be active.</span> The job posting could not be verified — it may have been filled or removed.
              </p>
            </div>
          )}
          {/* Match */}
          <div className="p-6 border-b border-slate-100">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                <Zap className="w-4 h-4 text-blue-500" /> AI Match Analysis
              </h3>
              {match && (
                <button onClick={onAnalyze} className="text-xs text-slate-400 hover:text-blue-600 transition">
                  Re-analyze
                </button>
              )}
            </div>

            {!match ? (
              <div className="text-center py-4">
                <p className="text-sm text-slate-500 mb-3">See how well this job matches your resume</p>
                <button onClick={onAnalyze} disabled={analyzing}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold rounded-xl transition">
                  {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                  {analyzing ? 'Analyzing your resume…' : 'Analyze Match'}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-start gap-4">
                  <ScoreRing score={match.match_score} size={64} />
                  <div>
                    <span className={`inline-flex px-2.5 py-1 rounded-full text-sm font-semibold border ${colors!.bg} ${colors!.text} ${colors!.border}`}>
                      {colors!.label} match
                    </span>
                    <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">{match.match_explanation}</p>
                  </div>
                </div>

                {match.skills_gap.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Skills Gap</p>
                    <div className="flex flex-wrap gap-1.5">
                      {match.skills_gap.map(skill => (
                        <span key={skill} className="px-2.5 py-1 bg-red-50 text-red-600 text-xs rounded-full border border-red-100">{skill}</span>
                      ))}
                    </div>
                  </div>
                )}

                {match.resume_suggestions.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Resume Suggestions</p>
                    <ul className="space-y-2">
                      {match.resume_suggestions.map((s, i) => (
                        <li key={i} className="flex gap-2 text-sm text-slate-700">
                          <TrendingUp className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                          <span>{s}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Description */}
          <div className="p-6">
            <h3 className="font-semibold text-slate-800 mb-3">Job Description</h3>
            <div className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
              {(job as any).description || 'No description available.'}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────

const LIMIT = 20
const SOURCES = ['indeed', 'glassdoor', 'linkedin', 'ziprecruiter', 'wellfound', 'jsearch']

export default function JobsPage() {
  const { user } = useAuth()

  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [selectedSources, setSelectedSources] = useState<string[]>([])
  const [remoteOnly, setRemoteOnly] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [showUnanalyzed, setShowUnanalyzed] = useState(true)
  const [page, setPage] = useState(1)

  const [jobs, setJobs] = useState<Job[]>([])
  const [total, setTotal] = useState(0)
  const [totalUnanalyzed, setTotalUnanalyzed] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  const [matches, setMatches] = useState<Record<string, JobMatch>>({})
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())
  const [analyzing, setAnalyzing] = useState<Record<string, boolean>>({})
  const [refreshingMatches, setRefreshingMatches] = useState(false)

  const [selectedJob, setSelectedJob] = useState<Job | null>(null)
  const [detailJob, setDetailJob] = useState<(Job & { description?: string }) | null>(null)

  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedQuery(query), 400)
    return () => clearTimeout(debounceRef.current)
  }, [query])

  const fetchJobs = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, any> = {
        page, limit: LIMIT,
        sort_by_score: true,
      }
      if (debouncedQuery) params.q = debouncedQuery
      if (selectedSources.length) params.source = selectedSources
      if (remoteOnly) params.remote_only = true

      const res = await api.get('/jobs/', { params })
      setJobs(res.data.results)
      setTotal(res.data.total)
      setTotalUnanalyzed(res.data.total_unanalyzed ?? null)
    } catch {
      toast.error('Failed to load jobs')
    } finally {
      setLoading(false)
    }
  }, [page, debouncedQuery, selectedSources, remoteOnly])

  useEffect(() => { fetchJobs() }, [fetchJobs])
  useEffect(() => { setPage(1) }, [debouncedQuery, selectedSources, remoteOnly])

  // Load saved + matches
  useEffect(() => {
    api.get('/matches/saved/').then(res => {
      setSavedIds(new Set(res.data.map((s: any) => s.job_id)))
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!jobs.length) return
    api.get('/matches/').then(res => {
      const map: Record<string, JobMatch> = {}
      res.data.forEach((m: JobMatch) => { map[m.job_id] = m })
      setMatches(map)
    }).catch(() => {})
  }, [jobs])

  const openJob = async (job: Job) => {
    setSelectedJob(job)
    setDetailJob(job as any)
    try {
      const res = await api.get(`/jobs/${job.id}`)
      setDetailJob(res.data)
    } catch {}
  }

  const handleAnalyze = async (jobId: string) => {
    setAnalyzing(prev => ({ ...prev, [jobId]: true }))
    try {
      const res = await api.post(`/matches/${jobId}`)
      setMatches(prev => ({ ...prev, [jobId]: res.data }))
      toast.success(`Match score: ${res.data.match_score}/100`)
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Analysis failed')
    } finally {
      setAnalyzing(prev => ({ ...prev, [jobId]: false }))
    }
  }

  const handleRefreshMatches = async () => {
    setRefreshingMatches(true)
    try {
      await api.post('/matches/refresh')
      toast.success('Match analysis queued. New scores will appear shortly.')
      // Refetch jobs and matches after a short delay so worker can process
      setTimeout(() => { fetchJobs() }, 3000)
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Could not queue match analysis')
    } finally {
      setRefreshingMatches(false)
    }
  }

  const handleSave = async (jobId: string) => {
    const isSaved = savedIds.has(jobId)
    try {
      if (isSaved) {
        await api.delete(`/matches/saved/${jobId}`)
        setSavedIds(prev => { const n = new Set(prev); n.delete(jobId); return n })
        toast.success('Removed from saved')
      } else {
        await api.post(`/matches/saved/${jobId}`)
        setSavedIds(prev => new Set([...prev, jobId]))
        toast.success('Job saved!')
      }
    } catch {
      toast.error('Could not update saved jobs')
    }
  }

  const handleMarkApplied = async (jobId: string) => {
    try {
      await api.post(`/matches/saved/${jobId}`)  // save if not already saved
    } catch {}
    try {
      await api.patch(`/matches/saved/${jobId}`, { status: 'applied' })
      setSavedIds(prev => new Set([...prev, jobId]))
      toast.success('Marked as Applied!')
    } catch {
      toast.error('Could not update status')
    }
  }

  const handleDeleteJob = async (jobId: string) => {
    if (!window.confirm('Delete this imported job? It will also be removed from your tracker.')) return
    try {
      await api.delete(`/jobs/${jobId}`)
      setJobs(prev => prev.filter(j => j.id !== jobId))
      setSavedIds(prev => { const n = new Set(prev); n.delete(jobId); return n })
      setMatches(prev => { const n = { ...prev }; delete n[jobId]; return n })
      if (selectedJob?.id === jobId) setSelectedJob(null)
      toast.success('Job deleted')
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Could not delete job')
    }
  }

  const toggleSource = (src: string) =>
    setSelectedSources(prev => prev.includes(src) ? prev.filter(s => s !== src) : [...prev, src])

  // Split analyzed vs unanalyzed
  const analyzedJobs = jobs.filter(j => matches[j.id])
  const unanalyzedJobs = jobs.filter(j => !matches[j.id])
  const totalPages = Math.ceil(total / LIMIT)

  return (
    <div className="max-w-5xl mx-auto py-8 px-4">

        {/* Search */}
        <div className="flex gap-3 mb-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input type="text" value={query} onChange={e => setQuery(e.target.value)}
              placeholder="Search jobs, companies, skills…"
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            {query && (
              <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <button onClick={() => setShowFilters(f => !f)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition ${
              showFilters || selectedSources.length || remoteOnly
                ? 'bg-blue-600 border-blue-600 text-white'
                : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300'
            }`}>
            <Filter className="w-4 h-4" /> Filters
            {(selectedSources.length > 0 || remoteOnly) && (
              <span className="bg-white/30 text-current text-xs px-1.5 py-0.5 rounded-full">
                {selectedSources.length + (remoteOnly ? 1 : 0)}
              </span>
            )}
          </button>
        </div>

        {/* Filter panel */}
        {showFilters && (
          <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4 space-y-4">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Source</p>
              <div className="flex flex-wrap gap-2">
                {SOURCES.map(src => {
                  const meta = SOURCE_LABELS[src] ?? { label: src, color: 'bg-slate-100 text-slate-600 border-slate-200' }
                  const active = selectedSources.includes(src)
                  return (
                    <button key={src} onClick={() => toggleSource(src)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-full border transition ${
                        active ? meta.color + ' ring-2 ring-offset-1 ring-current' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                      }`}>
                      {meta.label}
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => setRemoteOnly(r => !r)}
                className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-full border transition ${
                  remoteOnly ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                }`}>
                <MapPin className="w-3.5 h-3.5" /> Remote only
              </button>
              {(selectedSources.length > 0 || remoteOnly) && (
                <button onClick={() => { setSelectedSources([]); setRemoteOnly(false) }}
                  className="text-xs text-slate-400 hover:text-slate-600 underline">
                  Clear filters
                </button>
              )}
            </div>
          </div>
        )}

        {/* Results header */}
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <p className="text-sm text-slate-500">
            {loading ? 'Loading…' : `${total.toLocaleString()} jobs found`}
          </p>
          <button
            onClick={handleRefreshMatches}
            disabled={refreshingMatches || loading}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white disabled:text-slate-500 transition shadow-sm"
          >
            {refreshingMatches ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            {refreshingMatches ? 'Queuing…' : 'Refresh my matches'}
          </button>
        </div>

        {loading ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white border border-slate-200 rounded-xl p-5 animate-pulse">
                <div className="h-3 bg-slate-200 rounded w-1/4 mb-3" />
                <div className="h-5 bg-slate-200 rounded w-3/4 mb-2" />
                <div className="h-3 bg-slate-200 rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : jobs.length === 0 ? (
          <div className="text-center py-16">
            <Briefcase className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500 font-medium">No jobs found</p>
            <p className="text-slate-400 text-sm mt-1">Try adjusting your search or filters</p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Analyzed jobs section */}
            {analyzedJobs.length > 0 ? (
              <div>
                <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-blue-500" />
                  Matched Jobs — sorted by score
                </h2>
                <div className="flex flex-col gap-3">
                  {analyzedJobs.map(job => (
                    <JobCard key={job.id} job={job} match={matches[job.id]}
                      saved={savedIds.has(job.id)} analyzing={analyzing[job.id] ?? false}
                      onAnalyze={() => handleAnalyze(job.id)}
                      onSave={() => handleSave(job.id)}
                      onDelete={() => handleDeleteJob(job.id)}
                      onClick={() => openJob(job)} />
                  ))}
                </div>
              </div>
            ) : unanalyzedJobs.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
                <h2 className="text-sm font-semibold text-slate-700 mb-1 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-blue-500" />
                  Matched Jobs
                </h2>
                <p className="text-sm text-slate-600 mb-4">No jobs have been matched to your resume yet. We’ll analyze your top jobs and show scores here.</p>
                <button
                  onClick={handleRefreshMatches}
                  disabled={refreshingMatches || loading}
                  className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white disabled:text-slate-500 transition"
                >
                  {refreshingMatches ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                  {refreshingMatches ? 'Queuing…' : 'Refresh my matches'}
                </button>
              </div>
            )}

            {/* Unanalyzed jobs section */}
            {unanalyzedJobs.length > 0 && (
              <div>
                <button
                  onClick={() => setShowUnanalyzed(s => !s)}
                  className="flex items-center gap-2 text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3 hover:text-slate-700 transition w-full"
                >
                  <span className="flex-1 text-left">
                    Unanalyzed Jobs ({totalUnanalyzed ?? unanalyzedJobs.length})
                  </span>
                  {showUnanalyzed ? <ChevronDown className="w-4 h-4" /> : <ChevronDown className="w-4 h-4 -rotate-90" />}
                </button>
                {showUnanalyzed && (
                  <div className="flex flex-col gap-3">
                    {unanalyzedJobs.map(job => (
                      <JobCard key={job.id} job={job}
                        saved={savedIds.has(job.id)} analyzing={analyzing[job.id] ?? false}
                        onAnalyze={() => handleAnalyze(job.id)}
                        onSave={() => handleSave(job.id)}
                        onDelete={() => handleDeleteJob(job.id)}
                        onClick={() => openJob(job)} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-4 mt-8">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:border-blue-300 disabled:opacity-40 transition">
              <ArrowLeft className="w-4 h-4" /> Previous
            </button>
            <span className="text-sm text-slate-500">Page {page} of {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:border-blue-300 disabled:opacity-40 transition">
              Next <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Drawer */}
        {selectedJob && (
          <JobDrawer job={detailJob ?? selectedJob} match={matches[selectedJob.id]}
            saved={savedIds.has(selectedJob.id)} analyzing={analyzing[selectedJob.id] ?? false}
            onAnalyze={() => handleAnalyze(selectedJob.id)}
            onSave={() => handleSave(selectedJob.id)}
            onMarkApplied={handleMarkApplied}
            onClose={() => { setSelectedJob(null); setDetailJob(null) }} />
        )}
    </div>
  )
}
