import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { useSemesterBootstrap } from './hooks/useSemesterBootstrap'
import AuthPage from './pages/Auth'
import ResetPassword from './pages/ResetPassword'
import InviteRedemptionBanner from './components/InviteRedemptionBanner'
import Timeline from './pages/Timeline'
import CalendarPage from './pages/Calendar'
import Courses from './pages/Courses'
import CourseDetail from './pages/CourseDetail'
import Import from './pages/Import'
import AcademicCalendar from './pages/AcademicCalendar'

function Loading({ message }: { message?: string }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-main">
      <div className="w-8 h-8 rounded-full border-2 border-accent border-t-transparent animate-spin" />
      {message && <div className="text-xs text-dim">{message}</div>}
    </div>
  )
}

function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const { done: bootstrapDone, error: bootstrapError } = useSemesterBootstrap()
  if (loading) return <Loading />
  if (!user) return <Navigate to="/auth" replace />
  if (!bootstrapDone) return <Loading message="正在为你初始化学期数据…" />
  if (bootstrapError) {
    // Non-fatal — let the user into the app; each view already handles
    // the "no semester" empty state. Just log for debugging.
    console.warn('[bootstrap]', bootstrapError)
  }
  return <>{children}</>
}

function AppRoutes() {
  const { user, loading, isRecoverySession } = useAuth()
  if (loading) return <Loading />
  return (
    <>
      {user && <InviteRedemptionBanner />}
      <Routes>
        <Route
          path="/auth"
          element={user && !isRecoverySession ? <Navigate to="/" replace /> : <AuthPage />}
        />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/" element={<Protected><Timeline /></Protected>} />
        <Route path="/calendar" element={<Protected><CalendarPage /></Protected>} />
        <Route path="/courses" element={<Protected><Courses /></Protected>} />
        <Route path="/courses/:id" element={<Protected><CourseDetail /></Protected>} />
        <Route path="/import" element={<Protected><Import /></Protected>} />
        <Route path="/academic" element={<Protected><AcademicCalendar /></Protected>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
