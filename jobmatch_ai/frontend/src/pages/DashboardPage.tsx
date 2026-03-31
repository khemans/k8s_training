import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import api from '../lib/api'
import {
  Upload, Settings, ChevronRight, Plus,
  Zap, MapPin, TrendingUp, AlertCircle, CheckCircle,
  FileText, Star, ArrowRight
} from 'lucide-react'

interface ParsedResume {
  full_name?: string
  skills?: { technical?: string[]; soft?: string[]; domain?: string[] }
  strengths?: string[]
  inferred_seniority?: string
  suggested_roles?: string[]
  career_trajectory?: string
}

interface ResumeProfile {
  id: string
  label: string
  parse_confidence: number | null
  parsed_json: ParsedResume | null
  is_active: boolean
  created_at: string
}

interface SeekerProfile {
  status: string
  desired_roles_json: string[]
  location_prefs_json: { locations?: string[]; remote_preference?: string }
  seniority_band: string | string[] | null
}

function SkillBadge({ label }: { label: string }) {
  return (
    <span className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-medium border border-blue-100">
      {label}
    </span>
  )
}

function SectionCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-xl border border-slate-200 p-6 ${className}`}>
      {children}
    </div>
  )
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active:  { label: '🔍 Actively looking',      color: 'text-green-700 bg-green-50 border-green-200' },
  passive: { label: '👀 Casually exploring',     color: 'text-blue-700 bg-blue-50 border-blue-200' },
  urgent:  { label: '⚡ Urgent — within 30 days', color: 'text-orange-700 bg-orange-50 border-orange-200' },
}

export default function DashboardPage() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [resumes, setResumes] = useState<ResumeProfile[]>([])
  const [seeker, setSeeker] = useState<SeekerProfile | null>(null)
  const [loadingResumes, setLoadingResumes] = useState(true)
  const [loadingSeeker, setLoadingSeeker] = useState(true)

  useEffect(() => {
    api.get('/resumes/').then(r => setResumes(r.data)).finally(() => setLoadingResumes(false))
    api.get('/profile/').then(r => setSeeker(r.data)).catch(() => setSeeker(null)).finally(() => setLoadingSeeker(false))
  }, [])

  const activeResume = resumes.find(r => r.is_active) ?? resumes[0] ?? null
  const parsed = activeResume?.parsed_json ?? null

  const hasResume = resumes.length > 0
  const hasSeeker = !!seeker
  const hasSkills = (parsed?.skills?.technical?.length ?? 0) > 0
  const profileComplete = hasResume && hasSeeker && hasSkills

  const missingItems = [
    !hasResume && { label: 'Upload your resume', href: '/resume/upload', icon: <Upload className="w-4 h-4" /> },
    !hasSeeker && { label: 'Set job preferences', href: '/onboarding/preferences', icon: <Settings className="w-4 h-4" /> },
    hasResume && !hasSkills && { label: 'Resume parsed with low confidence — consider re-uploading', href: '/resume/upload', icon: <AlertCircle className="w-4 h-4" /> },
  ].filter(Boolean) as { label: string; href: string; icon: React.ReactNode }[]

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 space-y-6">

        {/* Welcome */}
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Welcome back{parsed?.full_name && typeof parsed.full_name === 'string' ? `, ${parsed.full_name.split(' ')[0]}` : ''}! 👋
          </h1>
          <p className="text-slate-500 mt-1 text-sm">Here's your job search profile at a glance.</p>
        </div>

        {/* Incomplete profile prompt */}
        {!profileComplete && missingItems.length > 0 && (
          <SectionCard className="border-amber-200 bg-amber-50">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="font-semibold text-amber-800 text-sm mb-2">Complete your profile to get better matches</p>
                <div className="space-y-2">
                  {missingItems.map((item, i) => (
                    <Link key={i} to={item.href}
                      className="flex items-center gap-2 text-sm text-amber-700 hover:text-amber-900 hover:underline">
                      {item.icon}
                      {item.label}
                      <ChevronRight className="w-3 h-3 ml-auto" />
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </SectionCard>
        )}

        {profileComplete && (
          <SectionCard className="border-green-200 bg-green-50">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />
              <p className="text-sm text-green-800 font-medium">
                Profile complete — you're ready to browse and match jobs! 🚀
              </p>
            </div>
          </SectionCard>
        )}

        {/* Browse Jobs CTA */}
        <Link
          to="/jobs"
          className="block bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl p-6 text-white hover:from-blue-700 hover:to-blue-800 transition group"
        >
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-lg">Browse Matching Jobs</h3>
              <p className="text-blue-100 text-sm mt-1">
                {hasResume
                  ? 'Click Analyze on any job to see your match score, skills gap, and resume tips.'
                  : 'Upload your resume to unlock AI-powered match scores for every job.'}
              </p>
            </div>
            <ArrowRight className="w-6 h-6 text-blue-300 group-hover:translate-x-1 transition-transform ml-4 shrink-0" />
          </div>
        </Link>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* Resume summary */}
          <SectionCard className="md:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-blue-500" />
                <h2 className="font-semibold text-slate-800">AI Profile Summary</h2>
              </div>
              {activeResume && (
                <Link to={`/profile/resume/${activeResume.id}`}
                  className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                  Full profile <ChevronRight className="w-3 h-3" />
                </Link>
              )}
            </div>

            {loadingResumes ? (
              <div className="animate-pulse space-y-3">
                <div className="h-4 bg-slate-200 rounded w-3/4" />
                <div className="h-4 bg-slate-200 rounded w-1/2" />
              </div>
            ) : !parsed ? (
              <div className="text-center py-6">
                <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 text-sm mb-3">No resume uploaded yet</p>
                <Link to="/resume/upload"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
                  <Upload className="w-4 h-4" /> Upload Resume
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-3 flex-wrap">
                  {parsed.inferred_seniority && (
                    <span className="px-3 py-1 bg-slate-100 text-slate-700 rounded-full text-sm font-medium capitalize">
                      {parsed.inferred_seniority}-level
                    </span>
                  )}
                  {seeker?.status && (
                    <span className={`px-3 py-1 rounded-full text-sm font-medium border ${STATUS_LABELS[seeker.status]?.color}`}>
                      {STATUS_LABELS[seeker.status]?.label}
                    </span>
                  )}
                </div>

                {parsed.career_trajectory && (
                  <p className="text-sm text-slate-600 leading-relaxed">{parsed.career_trajectory}</p>
                )}

                {parsed.strengths && parsed.strengths.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Top Strengths</p>
                    <div className="flex flex-wrap gap-2">
                      {parsed.strengths.map(s => <SkillBadge key={s} label={s} />)}
                    </div>
                  </div>
                )}

                {parsed.skills?.technical && parsed.skills.technical.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Technical Skills</p>
                    <div className="flex flex-wrap gap-2">
                      {parsed.skills.technical.slice(0, 10).map(s => <SkillBadge key={s} label={s} />)}
                      {parsed.skills.technical.length > 10 && (
                        <span className="px-2.5 py-1 text-slate-400 text-xs">+{parsed.skills.technical.length - 10} more</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </SectionCard>

          {/* Suggested roles */}
          <SectionCard>
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-5 h-5 text-blue-500" />
              <h2 className="font-semibold text-slate-800">Suggested Roles</h2>
            </div>
            {!parsed?.suggested_roles?.length ? (
              <p className="text-sm text-slate-400">Upload a resume to see suggested roles.</p>
            ) : (
              <div className="space-y-2">
                {parsed.suggested_roles.map(r => (
                  <div key={r} className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50">
                    <Star className="w-3.5 h-3.5 text-green-500 shrink-0" />
                    <span className="text-sm text-slate-700">{r}</span>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {/* Preferences */}
          <SectionCard>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <MapPin className="w-5 h-5 text-blue-500" />
                <h2 className="font-semibold text-slate-800">Job Preferences</h2>
              </div>
              <Link to="/onboarding/preferences" className="text-xs text-blue-600 hover:underline">Edit</Link>
            </div>
            {loadingSeeker ? (
              <div className="animate-pulse space-y-2">
                <div className="h-4 bg-slate-200 rounded w-2/3" />
                <div className="h-4 bg-slate-200 rounded w-1/2" />
              </div>
            ) : !seeker ? (
              <div>
                <p className="text-sm text-slate-400 mb-3">No preferences set yet.</p>
                <Link to="/onboarding/preferences"
                  className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
                  <Settings className="w-3.5 h-3.5" /> Set Preferences
                </Link>
              </div>
            ) : (
              <div className="space-y-3 text-sm">
                {seeker.seniority_band && (
                  <div className="flex justify-between items-start">
                    <span className="text-slate-500">Seniority</span>
                    <div className="flex flex-wrap gap-1 justify-end">
                      {(Array.isArray(seeker.seniority_band) ? seeker.seniority_band : [seeker.seniority_band]).map(s => (
                        <span key={s} className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-full text-xs capitalize">{s}</span>
                      ))}
                    </div>
                  </div>
                )}
                {seeker.desired_roles_json?.length > 0 && (
                  <div>
                    <span className="text-slate-500 block mb-1">Target roles</span>
                    <div className="flex flex-wrap gap-1">
                      {seeker.desired_roles_json.map(r => (
                        <span key={r} className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-full text-xs">{r}</span>
                      ))}
                    </div>
                  </div>
                )}
                {seeker.location_prefs_json?.remote_preference && (
                  <div className="flex justify-between items-start">
                    <span className="text-slate-500">Work arrangement</span>
                    <div className="flex flex-wrap gap-1 justify-end">
                      {(Array.isArray(seeker.location_prefs_json.remote_preference)
                        ? seeker.location_prefs_json.remote_preference
                        : [seeker.location_prefs_json.remote_preference]
                      ).map(r => (
                        <span key={r} className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-full text-xs">{r}</span>
                      ))}
                    </div>
                  </div>
                )}
                {((seeker.location_prefs_json?.locations?.length ?? 0) > 0) && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Locations</span>
                    <span className="font-medium text-slate-700">{(seeker.location_prefs_json?.locations ?? []).join(', ')}</span>
                  </div>
                )}
              </div>
            )}
          </SectionCard>

        </div>

        {/* Resume list */}
        {resumes.length > 0 && (
          <SectionCard>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-500" />
                <h2 className="font-semibold text-slate-800">Your Resumes</h2>
              </div>
              <Link to="/resume/upload"
                className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                <Plus className="w-3 h-3" /> Add another
              </Link>
            </div>
            <div className="space-y-2">
              {resumes.map(r => (
                <Link key={r.id} to={`/profile/resume/${r.id}`}
                  className="flex items-center justify-between p-3 rounded-lg border border-slate-100 hover:border-blue-200 hover:bg-blue-50 transition">
                  <div className="flex items-center gap-3">
                    <FileText className="w-4 h-4 text-slate-400" />
                    <div>
                      <p className="text-sm font-medium text-slate-700">{r.label}</p>
                      <p className="text-xs text-slate-400">{new Date(r.created_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {r.parse_confidence !== null && r.parse_confidence > 0 && (
                      <span className="text-xs text-slate-400">{Math.round(r.parse_confidence * 100)}% confidence</span>
                    )}
                    <ChevronRight className="w-4 h-4 text-slate-300" />
                  </div>
                </Link>
              ))}
            </div>
          </SectionCard>
        )}

      </div>
  )
}
