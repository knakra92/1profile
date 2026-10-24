import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { LoginPage } from './pages/Login'
import { PatientPage } from './pages/Patient'
import { PatientsPage } from './pages/Patients'
import { RequestsPage } from './pages/Requests'
import { useSession } from './session'

export default function App() {
  const { user, loading } = useSession()
  if (loading) return <div className="center muted">Loading…</div>
  if (!user) return <LoginPage />
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/patients" element={<PatientsPage />} />
        <Route path="/patients/:id" element={<PatientPage />} />
        <Route path="/requests" element={<RequestsPage />} />
        <Route path="*" element={<Navigate to="/patients" replace />} />
      </Route>
    </Routes>
  )
}
