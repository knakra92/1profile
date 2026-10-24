import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { api } from '../api'
import { useSession } from '../session'

export function useModelReady() {
  const [ready, setReady] = useState<boolean | null>(null)
  useEffect(() => {
    let alive = true
    const check = () =>
      api<{ model_ready: boolean }>('/health')
        .then((h) => alive && setReady(h.model_ready))
        .catch(() => alive && setReady(false))
    check()
    const t = setInterval(check, 15000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [])
  return ready
}

/** The 1Profile mark: two shared segments and one sealed one. */
export function Mark() {
  return (
    <span className="mark" aria-hidden>
      <i />
      <i />
      <i />
    </span>
  )
}

export function Layout() {
  const { user, logout } = useSession()
  const modelReady = useModelReady()
  const { pathname } = useLocation()
  const p = user!.provider!

  // New page, new reading position.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  return (
    <>
      <header className="topbar">
        <div className="org">
          <Mark />
          <span className="org-name">{p.name}</span>
          {p.verified && <span className="org-verified">Verified</span>}
        </div>
        <nav className="nav">
          <NavLink to="/patients">Patients</NavLink>
          <NavLink to="/requests">Request access</NavLink>
        </nav>
        <div className="who">
          <span className={`ai-status ${modelReady ? 'ok' : ''}`} title={modelReady ? 'AI assistant is available' : 'AI assistant is not configured'}>
            <i /> {modelReady ? 'Assistant on' : 'Assistant off'}
          </span>
          <span className="staff">{user!.full_name}</span>
          <button className="btn quiet small" onClick={logout}>
            Sign out
          </button>
        </div>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </>
  )
}
