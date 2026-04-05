import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminGetMe, setAdminUnauthorizedHandler } from '../api/client'
import AdminPanel from '../components/Admin/AdminPanel'
import { useToast } from '../hooks/useToast'

/**
 * Admin dashboard entry point. There's no separate admin login form anymore
 * — admins log in through the main /login using their email + admin password.
 * If no admin session exists when this page loads, we bounce to /login.
 */
export default function AdminPage() {
  const navigate = useNavigate()
  const [checking, setChecking] = useState(true)
  const [authenticated, setAuthenticated] = useState(false)
  const { toasts, removeToast } = useToast()

  useEffect(() => {
    adminGetMe()
      .then(() => {
        setAuthenticated(true)
        setChecking(false)
      })
      .catch(() => {
        // No admin session — send them to the unified login page.
        navigate('/login', { replace: true, state: { from: 'admin' } })
      })
  }, [navigate])

  // If any admin API call later returns 401 (session expired), bounce back
  // to /login rather than showing a separate admin-only form.
  useEffect(() => {
    setAdminUnauthorizedHandler(() => {
      setAuthenticated(false)
      navigate('/login', { replace: true })
    })
    return () => setAdminUnauthorizedHandler(null)
  }, [navigate])

  if (checking) {
    return (
      <div className="admin-scope">
        <div className="login-page">
          <div className="login-card">
            <div className="login-logo">B8N6 ADMIN</div>
            <div className="login-tagline" style={{ textAlign: 'center' }}>
              <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2, marginRight: 8 }} />
              Checking session…
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!authenticated) {
    // Effect will redirect; render nothing while navigating.
    return null
  }

  return (
    <div className="admin-scope">
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`} onClick={() => removeToast(t.id)}>
            {t.message}
          </div>
        ))}
      </div>
      <AdminPanel onLogout={() => navigate('/login', { replace: true })} />
    </div>
  )
}
