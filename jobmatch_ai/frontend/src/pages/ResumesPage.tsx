import { useEffect, useState, useCallback } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import api from '../lib/api'
import toast from 'react-hot-toast'
import { useDropzone } from 'react-dropzone'
import {
  FileText,
  Star,
  Trash2,
  Upload,
  Loader2,
  CheckCircle,
  Plus,
  Pencil,
  X,
  AlertTriangle,
} from 'lucide-react'

interface ResumeProfile {
  id: string
  label: string
  parse_confidence: number | null
  is_active: boolean
  created_at: string
  parsed_json?: { full_name?: string } | null
}

function ConfidenceBadge({ score }: { score: number | null }) {
  if (score == null) return null
  const pct = Math.round(score * 100)
  const color = pct >= 80 ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : pct >= 60 ? 'bg-amber-50 text-amber-700 border-amber-200'
    : 'bg-red-50 text-red-700 border-red-200'
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${color}`}>
      {pct}% parsed
    </span>
  )
}

function UploadModal({ onClose, onUploaded }: { onClose: () => void; onUploaded: () => void }) {
  const [tab, setTab] = useState<'upload' | 'paste'>('upload')
  const [label, setLabel] = useState('')
  const [pasteText, setPasteText] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const onDrop = useCallback(async (accepted: File[]) => {
    const file = accepted[0]
    if (!file) return
    setLoading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('label', label || 'Resume')
      const { data } = await api.post('/resumes/upload', form)
      toast.success('Resume uploaded and parsed!')
      onUploaded()
      onClose()
      navigate(`/profile/resume/${data.id}`)
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Upload failed')
    } finally {
      setLoading(false)
    }
  }, [label, navigate, onUploaded, onClose])

  const { getRootProps, getInputProps, isDragActive, acceptedFiles } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/msword': ['.doc'],
    },
    maxFiles: 1,
    disabled: loading,
  })

  const handlePaste = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pasteText.trim()) return
    setLoading(true)
    try {
      const form = new FormData()
      form.append('text', pasteText)
      form.append('label', label || 'Resume')
      const { data } = await api.post('/resumes/paste', form)
      toast.success('Resume parsed!')
      onUploaded()
      onClose()
      navigate(`/profile/resume/${data.id}`)
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to parse')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={() => !loading && onClose()} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-900">Add New Resume</h2>
          <button type="button" onClick={() => !loading && onClose()} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-slate-700 mb-1">Label <span className="text-slate-400 font-normal">(optional)</span></label>
          <input
            type="text"
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="e.g. Engineering Track, Product Manager"
            className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={loading}
          />
        </div>

        <div className="flex gap-1 p-1 bg-slate-100 rounded-lg mb-4">
          {(['upload', 'paste'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition ${
                tab === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {t === 'upload' ? '📎 Upload file' : '📋 Paste text'}
            </button>
          ))}
        </div>

        {tab === 'upload' && (
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition ${
              isDragActive ? 'border-blue-500 bg-blue-50' : 'border-slate-300 hover:border-blue-400 hover:bg-slate-50'
            } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <input {...getInputProps()} />
            {loading ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                <p className="text-slate-600 font-medium text-sm">Parsing with AI…</p>
              </div>
            ) : acceptedFiles.length > 0 ? (
              <div className="flex flex-col items-center gap-2">
                <CheckCircle className="w-8 h-8 text-green-500" />
                <p className="text-slate-700 text-sm font-medium">{acceptedFiles[0].name}</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload className="w-8 h-8 text-slate-400" />
                <p className="text-slate-700 font-medium text-sm">{isDragActive ? 'Drop it here!' : 'Drag & drop or click to browse'}</p>
                <p className="text-slate-400 text-xs">PDF or Word (.docx) · Max 10 MB</p>
              </div>
            )}
          </div>
        )}

        {tab === 'paste' && (
          <form onSubmit={handlePaste} className="space-y-3">
            <textarea
              value={pasteText}
              onChange={e => setPasteText(e.target.value)}
              placeholder="Paste your resume text here…"
              rows={10}
              className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading || !pasteText.trim()}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold text-sm rounded-xl flex items-center justify-center gap-2"
            >
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Parsing…</> : <><FileText className="w-4 h-4" /> Parse Resume</>}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

export default function ResumesPage() {
  const [resumes, setResumes] = useState<ResumeProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({})
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [editingLabel, setEditingLabel] = useState<string | null>(null)
  const [editLabelValue, setEditLabelValue] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const fetchResumes = async () => {
    try {
      const { data } = await api.get('/resumes/')
      setResumes(data)
    } catch {
      toast.error('Failed to load resumes')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchResumes() }, [])

  const setActive = async (id: string) => {
    setActionLoading(prev => ({ ...prev, [id]: true }))
    try {
      await api.patch(`/resumes/${id}/set-active`)
      setResumes(prev => prev.map(r => ({ ...r, is_active: r.id === id })))
      toast.success('Default resume updated')
    } catch {
      toast.error('Failed to set default')
    } finally {
      setActionLoading(prev => ({ ...prev, [id]: false }))
    }
  }

  const deleteResume = async (id: string) => {
    setActionLoading(prev => ({ ...prev, [id]: true }))
    try {
      await api.delete(`/resumes/${id}`)
      setResumes(prev => {
        const remaining = prev.filter(r => r.id !== id)
        // If we deleted the active one, the backend auto-promoted — re-fetch to get accurate state
        const hadActive = prev.find(r => r.id === id)?.is_active
        if (hadActive && remaining.length > 0) fetchResumes()
        return remaining
      })
      setDeleteConfirm(null)
      toast.success('Resume deleted')
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to delete')
    } finally {
      setActionLoading(prev => ({ ...prev, [id]: false }))
    }
  }

  const saveLabel = async (id: string) => {
    const label = editLabelValue.trim()
    if (!label) { setEditingLabel(null); return }
    setActionLoading(prev => ({ ...prev, [id]: true }))
    try {
      const form = new FormData()
      form.append('label', label)
      await api.patch(`/resumes/${id}/label`, form)
      setResumes(prev => prev.map(r => r.id === id ? { ...r, label } : r))
      setEditingLabel(null)
      toast.success('Label updated')
    } catch {
      toast.error('Failed to update label')
    } finally {
      setActionLoading(prev => ({ ...prev, [id]: false }))
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
    </div>
  )

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">My Resumes</h1>
          <p className="text-slate-500 text-sm mt-1">Manage your resume profiles. The default resume is used for match scoring.</p>
        </div>
        <button
          type="button"
          onClick={() => setShowUploadModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl shadow-sm transition"
        >
          <Plus className="w-4 h-4" /> Add Resume
        </button>
      </div>

      {resumes.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <FileText className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-600 font-medium">No resumes yet</p>
          <button
            type="button"
            onClick={() => setShowUploadModal(true)}
            className="mt-4 text-sm text-blue-600 hover:underline"
          >
            Upload your first resume →
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {resumes.map(resume => (
            <div
              key={resume.id}
              className={`bg-white rounded-xl border p-5 transition ${
                resume.is_active ? 'border-blue-400 ring-1 ring-blue-200' : 'border-slate-200'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className={`mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    resume.is_active ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-400'
                  }`}>
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    {editingLabel === resume.id ? (
                      <div className="flex items-center gap-2 mb-1">
                        <input
                          type="text"
                          value={editLabelValue}
                          onChange={e => setEditLabelValue(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') saveLabel(resume.id)
                            if (e.key === 'Escape') setEditingLabel(null)
                          }}
                          className="px-2 py-1 border border-slate-300 rounded-lg text-sm font-semibold focus:ring-2 focus:ring-blue-500 focus:border-transparent w-48"
                          autoFocus
                        />
                        <button onClick={() => saveLabel(resume.id)} className="text-xs text-blue-600 hover:underline font-medium">Save</button>
                        <button onClick={() => setEditingLabel(null)} className="text-xs text-slate-400 hover:underline">Cancel</button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-slate-900 text-sm">{resume.label}</span>
                        {resume.is_active && (
                          <span className="flex items-center gap-1 text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                            <Star className="w-3 h-3 fill-blue-600" /> Default
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => { setEditingLabel(resume.id); setEditLabelValue(resume.label) }}
                          className="text-slate-300 hover:text-slate-500 transition"
                          title="Rename"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-slate-400">
                        Added {new Date(resume.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                      <ConfidenceBadge score={resume.parse_confidence} />
                      {resume.parse_confidence != null && resume.parse_confidence < 0.6 && (
                        <span className="flex items-center gap-1 text-xs text-amber-600">
                          <AlertTriangle className="w-3 h-3" /> Low confidence — consider re-uploading
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Link
                    to={`/profile/resume/${resume.id}`}
                    className="text-xs text-blue-600 hover:underline font-medium"
                  >
                    View
                  </Link>
                  {!resume.is_active && (
                    <button
                      type="button"
                      onClick={() => setActive(resume.id)}
                      disabled={actionLoading[resume.id]}
                      className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition"
                    >
                      {actionLoading[resume.id] ? <Loader2 className="w-3 h-3 animate-spin" /> : <Star className="w-3 h-3" />}
                      Set default
                    </button>
                  )}
                  {deleteConfirm === resume.id ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">Delete?</span>
                      <button
                        onClick={() => deleteResume(resume.id)}
                        disabled={actionLoading[resume.id]}
                        className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
                      >
                        {actionLoading[resume.id] ? 'Deleting…' : 'Yes'}
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(null)}
                        className="text-xs text-slate-400 hover:underline"
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setDeleteConfirm(resume.id)}
                      disabled={actionLoading[resume.id] || resumes.length <= 1}
                      className="text-slate-300 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed transition"
                      title={resumes.length <= 1 ? "Can't delete your only resume" : "Delete resume"}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showUploadModal && (
        <UploadModal
          onClose={() => setShowUploadModal(false)}
          onUploaded={fetchResumes}
        />
      )}
    </div>
  )
}
