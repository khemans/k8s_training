import { useEffect, useState, useRef } from 'react'
import api from '../lib/api'
import toast from 'react-hot-toast'
import {
  FileText, Sparkles, Copy, Download, RefreshCw,
  ChevronDown, Check, Loader2, Building2, MapPin,
  Star, Zap,
} from 'lucide-react'

interface JobOption {
  id: string
  title: string
  company: string
  location: string | null
  source: string
  match_score: number | null
}

const TONES = [
  {
    id: 'professional',
    label: 'Professional',
    desc: 'Polished and formal',
    emoji: '💼',
  },
  {
    id: 'conversational',
    label: 'Conversational',
    desc: 'Warm and natural',
    emoji: '💬',
  },
  {
    id: 'enthusiastic',
    label: 'Enthusiastic',
    desc: 'Energetic and passionate',
    emoji: '🚀',
  },
  {
    id: 'concise',
    label: 'Concise',
    desc: 'Brief and direct',
    emoji: '⚡',
  },
]

function scoreColor(score: number) {
  if (score >= 80) return 'text-emerald-600 bg-emerald-50 border-emerald-200'
  if (score >= 65) return 'text-blue-600 bg-blue-50 border-blue-200'
  if (score >= 50) return 'text-amber-600 bg-amber-50 border-amber-200'
  return 'text-red-500 bg-red-50 border-red-200'
}

export default function CoverLetterPage() {
  const [jobs, setJobs] = useState<JobOption[]>([])
  const [loadingJobs, setLoadingJobs] = useState(true)
  const [selectedJob, setSelectedJob] = useState<JobOption | null>(null)
  const [jobPickerOpen, setJobPickerOpen] = useState(false)
  const [tone, setTone] = useState('professional')
  const [generating, setGenerating] = useState(false)
  const [coverLetter, setCoverLetter] = useState('')
  const [copied, setCopied] = useState(false)
  const [wordCount, setWordCount] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const pickerRef = useRef<HTMLDivElement>(null)

  // Load jobs for picker
  useEffect(() => {
    api.get('/cover-letter/jobs')
      .then(r => {
        setJobs(r.data)
        if (r.data.length > 0) setSelectedJob(r.data[0])
      })
      .catch(() => toast.error('Could not load your jobs'))
      .finally(() => setLoadingJobs(false))
  }, [])

  // Close picker on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setJobPickerOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Word count
  useEffect(() => {
    const words = coverLetter.trim().split(/\s+/).filter(Boolean).length
    setWordCount(coverLetter.trim() ? words : 0)
  }, [coverLetter])

  // Auto-scroll textarea as text streams in
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.scrollTop = textareaRef.current.scrollHeight
    }
  }, [coverLetter])

  const handleGenerate = async () => {
    if (!selectedJob) {
      toast.error('Please select a job first')
      return
    }
    setGenerating(true)
    setCoverLetter('')

    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/v1/cover-letter/generate`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${await getToken()}`,
          },
          body: JSON.stringify({
            job_id: selectedJob.id,
            tone,
          }),
        }
      )

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.detail || 'Generation failed')
      }

      const reader = response.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6).trim()
          if (raw === '[DONE]') { setGenerating(false); return }
          try {
            const parsed = JSON.parse(raw)
            if (parsed.error) throw new Error(parsed.error)
            if (parsed.text) {
              setCoverLetter(prev => prev + parsed.text)
            }
          } catch {}
        }
      }
    } catch (err: any) {
      toast.error(err.message || 'Generation failed')
    } finally {
      setGenerating(false)
    }
  }

  const handleCopy = async () => {
    if (!coverLetter) return
    await navigator.clipboard.writeText(coverLetter)
    setCopied(true)
    toast.success('Copied to clipboard!')
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDownload = () => {
    if (!coverLetter || !selectedJob) return
    const filename = `cover-letter-${selectedJob.company.toLowerCase().replace(/\s+/g, '-')}.txt`
    const blob = new Blob([coverLetter], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Downloaded!')
  }

  return (
    <div className="max-w-5xl mx-auto py-8 px-4">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <FileText className="w-6 h-6 text-blue-600" />
          Cover Letter Generator
        </h1>
        <p className="text-slate-500 mt-1 text-sm">
          Pick a job, choose a tone, and Claude will write a tailored cover letter from your resume.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

        {/* Left panel — controls */}
        <div className="lg:col-span-2 space-y-5">

          {/* Job picker */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <label className="block text-sm font-semibold text-slate-700 mb-3">
              Select a job
            </label>

            {loadingJobs ? (
              <div className="flex items-center gap-2 text-slate-400 text-sm py-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading your jobs…
              </div>
            ) : jobs.length === 0 ? (
              <div className="text-sm text-slate-500 bg-slate-50 rounded-lg p-4 text-center">
                No saved or analyzed jobs yet.{' '}
                <a href="/jobs" className="text-blue-600 hover:underline">Go to Jobs</a> to save some first.
              </div>
            ) : (
              <div className="relative" ref={pickerRef}>
                <button
                  type="button"
                  onClick={() => setJobPickerOpen(o => !o)}
                  className="w-full flex items-start justify-between gap-3 px-3 py-3 border border-slate-200 rounded-xl hover:border-blue-300 transition text-left"
                >
                  {selectedJob ? (
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-800 text-sm truncate">{selectedJob.title}</p>
                      <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                        <Building2 className="w-3 h-3" /> {selectedJob.company}
                        {selectedJob.location && (
                          <span className="flex items-center gap-0.5 ml-1">
                            <MapPin className="w-3 h-3" />{selectedJob.location}
                          </span>
                        )}
                      </p>
                    </div>
                  ) : (
                    <span className="text-slate-400 text-sm">Select a job…</span>
                  )}
                  <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 mt-0.5 transition-transform ${jobPickerOpen ? 'rotate-180' : ''}`} />
                </button>

                {jobPickerOpen && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-20 max-h-72 overflow-y-auto">
                    {jobs.map(job => (
                      <button
                        key={job.id}
                        type="button"
                        onClick={() => { setSelectedJob(job); setJobPickerOpen(false) }}
                        className={`w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50 transition border-b border-slate-100 last:border-0 ${selectedJob?.id === job.id ? 'bg-blue-50' : ''}`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-slate-800 truncate">{job.title}</p>
                          <p className="text-xs text-slate-500 truncate">{job.company}</p>
                        </div>
                        {job.match_score != null ? (
                          <span className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full border ${scoreColor(job.match_score)}`}>
                            {job.match_score}
                          </span>
                        ) : (
                          <span className="shrink-0 text-xs text-slate-300">—</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Selected job match score */}
            {selectedJob?.match_score != null && (
              <div className={`mt-3 flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium ${scoreColor(selectedJob.match_score)}`}>
                <Zap className="w-3.5 h-3.5" />
                Match score: {selectedJob.match_score}/100
              </div>
            )}
          </div>

          {/* Tone picker */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <label className="block text-sm font-semibold text-slate-700 mb-3">
              Tone
            </label>
            <div className="grid grid-cols-2 gap-2">
              {TONES.map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTone(t.id)}
                  className={`flex flex-col items-start gap-0.5 px-3 py-3 rounded-xl border transition text-left ${
                    tone === t.id
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'bg-white border-slate-200 text-slate-700 hover:border-blue-300'
                  }`}
                >
                  <span className="text-base">{t.emoji}</span>
                  <span className="text-xs font-semibold">{t.label}</span>
                  <span className={`text-xs ${tone === t.id ? 'text-blue-100' : 'text-slate-400'}`}>{t.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Generate button */}
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating || !selectedJob}
            className="w-full flex items-center justify-center gap-2 py-3.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:text-slate-500 text-white font-semibold rounded-xl transition shadow-sm text-sm"
          >
            {generating ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Writing your letter…</>
            ) : coverLetter ? (
              <><RefreshCw className="w-4 h-4" /> Regenerate</>
            ) : (
              <><Sparkles className="w-4 h-4" /> Generate Cover Letter</>
            )}
          </button>

          {/* Tips */}
          <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Tips</p>
            <ul className="space-y-1.5 text-xs text-slate-500">
              <li className="flex gap-1.5"><Star className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" /> Use a high-match-score job for the best results</li>
              <li className="flex gap-1.5"><Star className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" /> Try different tones and pick the one that sounds most like you</li>
              <li className="flex gap-1.5"><Star className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" /> Always personalize — edit the letter before sending</li>
            </ul>
          </div>
        </div>

        {/* Right panel — letter output */}
        <div className="lg:col-span-3">
          <div className="bg-white rounded-xl border border-slate-200 flex flex-col h-full min-h-[560px]">

            {/* Output toolbar */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-slate-400" />
                <span className="text-sm font-medium text-slate-600">
                  {selectedJob ? `${selectedJob.title} — ${selectedJob.company}` : 'Cover Letter'}
                </span>
              </div>
              <div className="flex items-center gap-3">
                {wordCount > 0 && (
                  <span className="text-xs text-slate-400">{wordCount} words</span>
                )}
                {coverLetter && (
                  <>
                    <button
                      type="button"
                      onClick={handleCopy}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-lg hover:border-blue-300 hover:text-blue-600 transition"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                    <button
                      type="button"
                      onClick={handleDownload}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-lg hover:border-blue-300 hover:text-blue-600 transition"
                    >
                      <Download className="w-3.5 h-3.5" /> Download
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Letter text */}
            <div className="flex-1 relative">
              {!coverLetter && !generating ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-8">
                  <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mb-4">
                    <FileText className="w-7 h-7 text-blue-400" />
                  </div>
                  <p className="text-slate-500 font-medium">Your cover letter will appear here</p>
                  <p className="text-slate-400 text-sm mt-1">Select a job and click Generate</p>
                </div>
              ) : (
                <textarea
                  ref={textareaRef}
                  value={coverLetter}
                  onChange={e => setCoverLetter(e.target.value)}
                  className="w-full h-full min-h-[480px] px-6 py-5 text-sm text-slate-700 leading-relaxed resize-none focus:outline-none rounded-b-xl font-mono"
                  placeholder={generating ? '' : 'Your cover letter will appear here…'}
                  readOnly={generating}
                />
              )}

              {/* Streaming cursor */}
              {generating && coverLetter && (
                <span className="inline-block w-0.5 h-4 bg-blue-500 animate-pulse ml-0.5" />
              )}
            </div>

            {/* Edit hint */}
            {coverLetter && !generating && (
              <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 rounded-b-xl">
                <p className="text-xs text-slate-400">
                  ✏️ The letter is editable — personalize it before sending. Always review before submitting.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// Helper: get the current Supabase access token
async function getToken(): Promise<string> {
  const { supabase } = await import('../lib/supabase')
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ?? ''
}
