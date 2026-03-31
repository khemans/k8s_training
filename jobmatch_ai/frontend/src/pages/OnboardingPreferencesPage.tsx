import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../lib/api'
import toast from 'react-hot-toast'
import { Loader2, Sparkles } from 'lucide-react'

const SENIORITY_OPTIONS = ['entry', 'mid', 'senior', 'lead', 'manager', 'director', 'executive']
const STATUS_OPTIONS = [
  { value: 'active',   label: '🔍 Actively looking' },
  { value: 'passive',  label: '👀 Casually exploring' },
  { value: 'urgent',   label: '⚡ Urgent — within 30 days' },
]
const REMOTE_OPTIONS = ['Remote', 'Hybrid', 'On-site', 'No preference']

export default function OnboardingPreferencesPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [prefilling, setPrefilling] = useState(true)
  const [suggestedRoles, setSuggestedRoles] = useState<string[]>([])

  const [status, setStatus] = useState('active')
  const [seniority, setSeniority] = useState<string[]>([])
  const [roleInput, setRoleInput] = useState('')
  const [roles, setRoles] = useState<string[]>([])
  const [locationInput, setLocationInput] = useState('')
  const [locations, setLocations] = useState<string[]>([])
  const [remote, setRemote] = useState<string[]>(['No preference'])
  const [visaSponsorship, setVisaSponsorship] = useState(false)

  // On mount: load existing preferences, then pre-fill roles from resume if no prefs yet
  useEffect(() => {
    async function prefill() {
      try {
        // First try to load existing seeker profile
        const { data: existing } = await api.get('/profile/').catch(() => ({ data: null }))

        if (existing) {
          // Populate form with saved preferences
          setStatus(existing.status ?? 'active')
          setSeniority(existing.seniority_band ? (Array.isArray(existing.seniority_band) ? existing.seniority_band : [existing.seniority_band]) : ['mid'])
          setRoles(existing.desired_roles_json ?? [])
          setLocations(existing.location_prefs_json?.locations ?? [])
          setRemote(existing.location_prefs_json?.remote_preference ? (Array.isArray(existing.location_prefs_json.remote_preference) ? existing.location_prefs_json.remote_preference : [existing.location_prefs_json.remote_preference]) : ['No preference'])
          setVisaSponsorship(existing.constraints_json?.visa_sponsorship ?? false)
          // Don't suggest roles if user already has saved preferences
          setPrefilling(false)
          return
        }
      } catch {
        // No existing profile — fall through to resume pre-fill
      }

      // No saved preferences yet — pre-fill suggested roles from the active resume
      try {
        const { data: resumes } = await api.get('/resumes/')
        const active = resumes?.find((r: any) => r.is_active) ?? resumes?.[0]
        const suggested: string[] = active?.parsed_json?.suggested_roles ?? []

        if (suggested.length > 0) {
          setSuggestedRoles(suggested)
          setRoles(suggested)

          // Also pre-fill seniority from resume if available
          const inferred = active?.parsed_json?.inferred_seniority
          if (inferred) setSeniority([inferred])
        }
      } catch {
        // No resume yet — that's fine, form stays empty
      } finally {
        setPrefilling(false)
      }
    }

    prefill()
  }, [])


  const toggleSeniority = (s: string) => {
    setSeniority(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])
  }

  const toggleRemote = (r: string) => {
    setRemote(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r])
  }

  const addRole = () => {
    const trimmed = roleInput.trim()
    if (trimmed && !roles.includes(trimmed)) setRoles([...roles, trimmed])
    setRoleInput('')
  }

  const addLocation = () => {
    const trimmed = locationInput.trim()
    if (trimmed && !locations.includes(trimmed)) setLocations([...locations, trimmed])
    setLocationInput('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await api.put('/profile/', {
        status,
        seniority_band: seniority,
        desired_roles_json: roles,
        location_prefs_json: { locations, remote_preference: remote },
        seniority_bands: seniority,
        constraints_json: { visa_sponsorship: visaSponsorship },
      })
      toast.success('Preferences saved!')
      navigate('/dashboard')
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to save preferences')
    } finally {
      setLoading(false)
    }
  }

  if (prefilling) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
          <p className="text-slate-500 text-sm">Loading your profile…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4">
      <div className="max-w-xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Set Your Preferences</h1>
          <p className="text-slate-500 mt-1 text-sm">These guide your matches — you can change them anytime.</p>
        </div>

        {/* Pre-fill notice */}
        {suggestedRoles.length > 0 && (
          <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
            <Sparkles className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-blue-800">Pre-filled from your resume</p>
              <p className="text-sm text-blue-600 mt-0.5">
                We've added the roles Claude suggested based on your experience. Remove any that don't fit or add your own.
              </p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 space-y-7">

          {/* Status */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Search status</label>
            <div className="space-y-2">
              {STATUS_OPTIONS.map(opt => (
                <label key={opt.value} className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-slate-50 transition">
                  <input type="radio" name="status" value={opt.value} checked={status === opt.value} onChange={() => setStatus(opt.value)} className="accent-blue-600" />
                  <span className="text-sm text-slate-700">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Desired roles */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Desired role types
              {suggestedRoles.length > 0 && (
                <span className="ml-2 text-xs font-normal text-blue-500 flex-inline items-center gap-1">
                  ✨ pre-filled from resume
                </span>
              )}
            </label>
            <div className="flex gap-2">
              <input
                type="text" value={roleInput} onChange={e => setRoleInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addRole())}
                placeholder="e.g. Product Manager, Frontend Engineer"
                className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button type="button" onClick={addRole}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
                Add
              </button>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {roles.map(r => (
                <span key={r} className={`flex items-center gap-1 px-3 py-1 rounded-full text-sm border ${
                  suggestedRoles.includes(r)
                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                    : 'bg-slate-50 text-slate-700 border-slate-200'
                }`}>
                  {suggestedRoles.includes(r) && <Sparkles className="w-3 h-3" />}
                  {r}
                  <button type="button" onClick={() => setRoles(roles.filter(x => x !== r))}
                    className="text-slate-400 hover:text-slate-600 ml-1">×</button>
                </span>
              ))}
            </div>
          </div>

          {/* Seniority */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Seniority band
              {suggestedRoles.length > 0 && (
                <span className="ml-2 text-xs font-normal text-blue-500">✨ pre-filled from resume</span>
              )}
            </label>
            <div className="flex flex-wrap gap-2">
              {SENIORITY_OPTIONS.map(s => (
                <button key={s} type="button" onClick={() => toggleSeniority(s)}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium border transition capitalize ${
                    seniority.includes(s)
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-slate-600 border-slate-300 hover:border-blue-400'
                  }`}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Location */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Preferred locations</label>
            <div className="flex gap-2">
              <input
                type="text" value={locationInput} onChange={e => setLocationInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addLocation())}
                placeholder="e.g. San Francisco, CA or New York"
                className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button type="button" onClick={addLocation}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
                Add
              </button>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {locations.map(l => (
                <span key={l} className="flex items-center gap-1 px-3 py-1 bg-slate-100 text-slate-700 rounded-full text-sm">
                  {l}
                  <button type="button" onClick={() => setLocations(locations.filter(x => x !== l))}
                    className="text-slate-400 hover:text-slate-600 ml-1">×</button>
                </span>
              ))}
            </div>
          </div>

          {/* Remote preference */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Work arrangement</label>
            <div className="flex flex-wrap gap-2">
              {REMOTE_OPTIONS.map(r => (
                <button key={r} type="button" onClick={() => toggleRemote(r)}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium border transition ${
                    remote.includes(r)
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-slate-600 border-slate-300 hover:border-blue-400'
                  }`}>
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Visa sponsorship */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={visaSponsorship}
              onChange={e => setVisaSponsorship(e.target.checked)}
              className="w-4 h-4 accent-blue-600" />
            <span className="text-sm text-slate-700">I require visa sponsorship</span>
          </label>

          <button
            type="submit" disabled={loading}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
              : 'Save Preferences & Continue →'
            }
          </button>
        </form>
      </div>
    </div>
  )
}
