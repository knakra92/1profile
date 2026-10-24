export const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8077'

const TOKEN_KEY = 'oneprofile.provider.token'

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

let onUnauthorized: () => void = () => {}
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  // Lets the AI agents show times in the viewer's timezone.
  const headers: Record<string, string> = { 'X-Timezone': Intl.DateTimeFormat().resolvedOptions().timeZone }
  const token = tokenStore.get()
  if (token) headers.Authorization = `Bearer ${token}`
  if (init.body !== undefined) headers['Content-Type'] = 'application/json'
  let res: Response
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: init.method ?? (init.body !== undefined ? 'POST' : 'GET'),
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    })
  } catch {
    throw new ApiError(0, `Cannot reach the 1Profile API at ${API_URL}`)
  }
  if (!res.ok) {
    let detail = res.statusText
    try {
      const j = await res.json()
      detail = typeof j.detail === 'string' ? j.detail : Array.isArray(j.detail) ? j.detail.map((d: { msg: string }) => d.msg).join('; ') : detail
    } catch {
      /* non-JSON error body */
    }
    if (res.status === 401 && path !== '/auth/login') onUnauthorized()
    throw new ApiError(res.status, detail)
  }
  return res.json() as Promise<T>
}

// --- types (mirror backend/app/schemas.py) ---
export interface Provider {
  id: number
  name: string
  kind: string
  city: string | null
  verified: boolean
}

export interface User {
  id: number
  email: string
  full_name: string
  role: 'member' | 'provider'
  share_code: string | null
  provider: Provider | null
}

export interface ScopeInfo {
  label: string
  description: string
  group: string
  shape: 'object' | 'list'
}
export type ScopeCatalog = Record<string, ScopeInfo>

export interface PatientSummary {
  id: number
  full_name: string
  scopes: string[]
  expires_at: string
}

export interface AccessRequest {
  id: number
  provider: Provider
  member: { id: number; full_name: string; share_code: string | null }
  scopes: string[]
  approved_scopes: string[]
  purpose: string
  duration_days: number
  status: 'pending' | 'approved' | 'partial' | 'denied'
  created_at: string
  responded_at: string | null
}

export interface PatientView {
  member: { id: number; full_name: string }
  shared: Record<string, unknown>
  withheld: string[]
}

export interface Appointment {
  id: number
  provider: Provider
  starts_at: string
  department: string | null
  clinician: string | null
  reason: string | null
  location: string | null
  status: string
}

export interface Bill {
  id: number
  provider: Provider
  description: string
  amount_cents: number
  insurance_covered_cents: number
  issued_at: string
  due_date: string | null
  status: string
  paid_at: string | null
}

export interface LabValue {
  name: string
  value: number | string
  unit?: string | null
  ref_range?: string | null
  flag: string
}

export interface LabResult {
  id: number
  provider: Provider
  test_name: string
  collected_at: string
  results: LabValue[]
  notes: string | null
}

export interface Records {
  appointments: Appointment[]
  bills: Bill[]
  results: LabResult[]
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—'
export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
export const fmtMoney = (cents: number) => `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
