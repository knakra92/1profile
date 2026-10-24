export type Provider = { id: number; name: string; kind: string; city: string | null; verified: boolean };

export type User = {
  id: number;
  email: string;
  full_name: string;
  role: 'member' | 'provider';
  share_code: string | null;
  provider: Provider | null;
};

export type ScopeInfo = { label: string; description: string; group: string; shape: 'object' | 'list' };
export type ScopeCatalog = Record<string, ScopeInfo>;

export type Profile = Record<string, any>;

export type AccessRequest = {
  id: number;
  provider: Provider;
  scopes: string[];
  approved_scopes: string[];
  purpose: string;
  duration_days: number;
  status: 'pending' | 'approved' | 'partial' | 'denied';
  created_at: string;
  responded_at: string | null;
};

export type Grant = { id: number; provider: Provider; scope: string; granted_at: string; expires_at: string };

export type AuditEvent = {
  id: number;
  provider: Provider | null;
  actor_name: string | null;
  action: string;
  scopes: string[];
  detail: string | null;
  created_at: string;
};

export type Appointment = {
  id: number;
  provider: Provider;
  starts_at: string;
  department: string | null;
  clinician: string | null;
  reason: string | null;
  location: string | null;
  status: string;
};

export type Bill = {
  id: number;
  provider: Provider;
  description: string;
  amount_cents: number;
  insurance_covered_cents: number;
  issued_at: string;
  due_date: string | null;
  status: 'due' | 'paid';
  paid_at: string | null;
};

export type LabValue = { name: string; value: number | string; unit?: string; ref_range?: string; flag: string };
export type LabResult = {
  id: number;
  provider: Provider;
  test_name: string;
  collected_at: string;
  results: LabValue[];
  notes: string | null;
};

export type Insight = { sector: string; title: string; detail: string; priority: 'high' | 'medium' | 'low' };
