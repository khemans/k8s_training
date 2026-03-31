import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { useNavigate } from 'react-router-dom'
import api from '../lib/api'
import toast from 'react-hot-toast'
import { Upload, FileText, Loader2, CheckCircle } from 'lucide-react'

type Tab = 'upload' | 'paste'

export default function ResumeUploadPage() {
  const [tab, setTab] = useState<Tab>('upload')
  const [pasteText, setPasteText] = useState('')
  const [label, setLabel] = useState('Default')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const onDrop = useCallback(async (accepted: File[]) => {
    const file = accepted[0]
    if (!file) return
    setLoading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('label', label)
      const { data } = await api.post('/resumes/upload', form)
      toast.success('Resume parsed successfully!')
      navigate(`/profile/resume/${data.id}`)
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Upload failed')
    } finally {
      setLoading(false)
    }
  }, [label, navigate])

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

  const handlePasteSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pasteText.trim()) return
    setLoading(true)
    try {
      const form = new FormData()
      form.append('text', pasteText)
      form.append('label', label)
      const { data } = await api.post('/resumes/paste', form)
      toast.success('Resume parsed successfully!')
      navigate(`/profile/resume/${data.id}`)
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Submission failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-slate-900">Upload Your Resume</h1>
          <p className="text-slate-500 mt-2">
            We'll use AI to parse it into a structured profile — takes about 15 seconds.
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
          {/* Label */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Profile label <span className="text-slate-400">(optional)</span>
            </label>
            <input
              type="text"
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="e.g. Default, Engineering Track, Product Track"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Tabs */}
          <div className="flex gap-1 p-1 bg-slate-100 rounded-lg mb-6">
            {(['upload', 'paste'] as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition ${
                  tab === t
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {t === 'upload' ? '📎 Upload file' : '📋 Paste text'}
              </button>
            ))}
          </div>

          {tab === 'upload' && (
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition ${
                isDragActive
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-slate-300 hover:border-blue-400 hover:bg-slate-50'
              } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <input {...getInputProps()} />
              {loading ? (
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
                  <p className="text-slate-600 font-medium">Parsing your resume with AI…</p>
                  <p className="text-slate-400 text-sm">This takes about 15 seconds</p>
                </div>
              ) : acceptedFiles.length > 0 ? (
                <div className="flex flex-col items-center gap-3">
                  <CheckCircle className="w-10 h-10 text-green-500" />
                  <p className="text-slate-700 font-medium">{acceptedFiles[0].name}</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <Upload className="w-10 h-10 text-slate-400" />
                  <div>
                    <p className="text-slate-700 font-medium">
                      {isDragActive ? 'Drop it here!' : 'Drag & drop your resume'}
                    </p>
                    <p className="text-slate-400 text-sm mt-1">PDF or Word (.docx) · Max 10 MB</p>
                  </div>
                  <button
                    type="button"
                    className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition"
                  >
                    Browse files
                  </button>
                </div>
              )}
            </div>
          )}

          {tab === 'paste' && (
            <form onSubmit={handlePasteSubmit} className="space-y-4">
              <textarea
                value={pasteText}
                onChange={e => setPasteText(e.target.value)}
                placeholder="Paste the text of your resume here…"
                rows={14}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono resize-none"
              />
              <button
                type="submit"
                disabled={loading || !pasteText.trim()}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Parsing with AI…</>
                ) : (
                  <><FileText className="w-4 h-4" /> Parse Resume</>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
