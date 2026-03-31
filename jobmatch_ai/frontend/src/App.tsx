import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './hooks/useAuth'
import AppLayout from './components/AppLayout'
import { ErrorBoundary } from './components/ErrorBoundary'

import LoginPage from './pages/LoginPage'
import ResumeUploadPage from './pages/ResumeUploadPage'
import ResumeProfilePage from './pages/ResumeProfilePage'
import ResumesPage from './pages/ResumesPage'
import OnboardingPreferencesPage from './pages/OnboardingPreferencesPage'
import DashboardPage from './pages/DashboardPage'
import JobsPage from './pages/JobsPage'
import TrackerPage from './pages/TrackerPage'
import CoverLetterPage from './pages/CoverLetterPage'
import CalendarPage from './pages/CalendarPage'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth()
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
  return session ? <>{children}</> : <Navigate to="/login" replace />
}

function AppRoutes() {
  const { session } = useAuth()
  return (
    <Routes>
      <Route path="/login" element={session ? <Navigate to="/dashboard" replace /> : <LoginPage />} />
      <Route path="/dashboard" element={<ProtectedRoute><AppLayout><ErrorBoundary><DashboardPage /></ErrorBoundary></AppLayout></ProtectedRoute>} />
      <Route path="/jobs" element={<ProtectedRoute><AppLayout><ErrorBoundary><JobsPage /></ErrorBoundary></AppLayout></ProtectedRoute>} />
      <Route path="/tracker" element={<ProtectedRoute><AppLayout><ErrorBoundary><TrackerPage /></ErrorBoundary></AppLayout></ProtectedRoute>} />
      <Route path="/cover-letter" element={<ProtectedRoute><AppLayout><ErrorBoundary><CoverLetterPage /></ErrorBoundary></AppLayout></ProtectedRoute>} />
      <Route path="/calendar" element={<ProtectedRoute><AppLayout><ErrorBoundary><CalendarPage /></ErrorBoundary></AppLayout></ProtectedRoute>} />
      <Route path="/resume/upload" element={<ProtectedRoute><AppLayout><ErrorBoundary><ResumeUploadPage /></ErrorBoundary></AppLayout></ProtectedRoute>} />
      <Route path="/resumes" element={<ProtectedRoute><AppLayout><ErrorBoundary><ResumesPage /></ErrorBoundary></AppLayout></ProtectedRoute>} />
      <Route path="/profile/resume/:id" element={<ProtectedRoute><AppLayout><ErrorBoundary><ResumeProfilePage /></ErrorBoundary></AppLayout></ProtectedRoute>} />
      <Route path="/onboarding/preferences" element={<ProtectedRoute><AppLayout><ErrorBoundary><OnboardingPreferencesPage /></ErrorBoundary></AppLayout></ProtectedRoute>} />
      <Route path="*" element={<Navigate to={session ? "/dashboard" : "/login"} replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <Toaster position="top-right" />
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
