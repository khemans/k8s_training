import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import api from '../lib/api'
import { Loader2, AlertTriangle, ChevronRight, Star, Briefcase, GraduationCap, Zap, TrendingUp } from 'lucide-react'

interface ParsedResume {
  full_name?: string
  email?: string
  location?: string
  summary?: string
  skills?: { technical?: string[]; soft?: string[]; domain?: string[] }
  experience?: Array<{
    title: string; company: string; start_date: string; end_date: string
    highlights?: string[]; inferred_impact?: string
  }>
  education?: Array<{ degree: string; institution: string; year?: string }>
  certifications?: string[]
  strengths?: string[]
  career_trajectory?: string
  inferred_seniority?: string
  suggested_roles?: string[]
  confidence_score?: number
}

interface ResumeProfile {
  id: string
  label: string
  parsed_json: ParsedResume | null
  parse_confidence: number | null
  created_at: string
}

function SkillBadge({ label }: { label: string }) {
  return (
    <span className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-medium border border-blue-100">
      {label}
    </span>
  )
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-blue-500">{icon}</span>
        <h2 className="font-semibold text-slate-800">{title}</h2>
      </div>
      {children}
    </div>
  )
}

export default function ResumeProfilePage() {
  const { id } = useParams<{ id: string }>()
  const [profile, setProfile] = useState<ResumeProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get(`/resumes/${id}`)
      .then(r => setProfile(r.data))
      .catch(() => setError('Could not load resume profile.'))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
    </div>
  )

  if (error || !profile) return (
    <div className="min-h-screen flex items-center justify-center text-red-500">{error}</div>
  )

  const p = profile.parsed_json
  const confidence = profile.parse_confidence ?? 0

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4">
      <div className="max-w-3xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{p?.full_name || 'Your Resume'}</h1>
            <p className="text-slate-500 text-sm mt-0.5">{profile.label} · parsed {new Date(profile.created_at).toLocaleDateString()}</p>
          </div>
          <Link
            to="/resume/upload"
            className="text-sm text-blue-600 hover:underline flex items-center gap-1"
          >
            Upload another <ChevronRight className="w-3 h-3" />
          </Link>
        </div>

        {/* Confidence warning */}
        {confidence < 0.6 && (
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
            <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-800">Parse confidence is low ({Math.round(confidence * 100)}%)</p>
              <p className="text-sm text-amber-700 mt-0.5">
                Some sections may be incomplete. Review the profile below and consider re-uploading a cleaner version of your resume.
              </p>
            </div>
          </div>
        )}

        {/* Summary */}
        {p?.summary && (
          <Section icon={<Star className="w-5 h-5" />} title="Summary">
            <p className="text-slate-600 text-sm leading-relaxed">{p.summary}</p>
          </Section>
        )}

        {/* Strengths + Seniority */}
        <Section icon={<Zap className="w-5 h-5" />} title="AI-Inferred Strengths">
          <div className="flex flex-wrap gap-2 mb-4">
            {p?.strengths?.map(s => <SkillBadge key={s} label={s} />)}
          </div>
          {p?.inferred_seniority && (
            <p className="text-sm text-slate-500">
              Inferred seniority: <span className="font-medium text-slate-700 capitalize">{p.inferred_seniority}</span>
            </p>
          )}
          {p?.career_trajectory && (
            <p className="text-sm text-slate-600 mt-2 leading-relaxed">{p.career_trajectory}</p>
          )}
        </Section>

        {/* Skills */}
        <Section icon={<Star className="w-5 h-5" />} title="Skills">
          {(['technical', 'soft', 'domain'] as const).map(cat => {
            const skills = p?.skills?.[cat] ?? []
            if (!skills.length) return null
            return (
              <div key={cat} className="mb-3">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2 capitalize">{cat}</p>
                <div className="flex flex-wrap gap-2">
                  {skills.map(s => <SkillBadge key={s} label={s} />)}
                </div>
              </div>
            )
          })}
        </Section>

        {/* Experience */}
        <Section icon={<Briefcase className="w-5 h-5" />} title="Experience">
          <div className="space-y-5">
            {p?.experience?.map((job, i) => (
              <div key={i} className="border-l-2 border-blue-200 pl-4">
                <div className="flex items-baseline justify-between">
                  <p className="font-medium text-slate-800">{job.title}</p>
                  <p className="text-xs text-slate-400">{job.start_date} – {job.end_date}</p>
                </div>
                <p className="text-sm text-blue-600 mb-2">{job.company}</p>
                {job.highlights?.map((h, j) => (
                  <p key={j} className="text-sm text-slate-600 before:content-['•'] before:mr-2 before:text-slate-400">{h}</p>
                ))}
                {job.inferred_impact && (
                  <p className="text-xs text-slate-400 mt-1 italic">{job.inferred_impact}</p>
                )}
              </div>
            ))}
          </div>
        </Section>

        {/* Education */}
        {p?.education?.length ? (
          <Section icon={<GraduationCap className="w-5 h-5" />} title="Education">
            {p.education.map((edu, i) => (
              <div key={i} className="flex justify-between items-baseline">
                <div>
                  <p className="font-medium text-slate-800 text-sm">{edu.degree}</p>
                  <p className="text-sm text-slate-500">{edu.institution}</p>
                </div>
                {edu.year && <p className="text-xs text-slate-400">{edu.year}</p>}
              </div>
            ))}
          </Section>
        ) : null}

        {/* Suggested Roles */}
        {p?.suggested_roles?.length ? (
          <Section icon={<TrendingUp className="w-5 h-5" />} title="Suggested Roles You'd Be Competitive For">
            <div className="flex flex-wrap gap-2">
              {p.suggested_roles.map(r => (
                <span key={r} className="px-3 py-1.5 bg-green-50 text-green-700 border border-green-200 rounded-full text-sm font-medium">
                  {r}
                </span>
              ))}
            </div>
          </Section>
        ) : null}

        {/* Next step CTA */}
        <div className="bg-blue-600 rounded-xl p-6 text-white text-center">
          <h3 className="text-lg font-semibold mb-1">Profile looks good? 🎉</h3>
          <p className="text-blue-100 text-sm mb-4">Set your preferences and we'll start finding matches.</p>
          <Link
            to="/onboarding/preferences"
            className="inline-block bg-white text-blue-600 font-medium px-6 py-2.5 rounded-lg hover:bg-blue-50 transition text-sm"
          >
            Set Job Preferences →
          </Link>
        </div>

      </div>
    </div>
  )
}
