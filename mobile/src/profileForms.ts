// Form layout for each profile scope. Object scopes edit one record; list scopes edit many items.

export type FieldSpec = {
  key: string;
  label: string;
  placeholder?: string;
  kind?: 'text' | 'number' | 'lines' | 'bool';
  keyboard?: 'default' | 'phone-pad' | 'email-address' | 'number-pad';
};

export type FormSpec = {
  fields: FieldSpec[];
  itemTitle?: (item: any) => string;
  itemSubtitle?: (item: any) => string;
  itemNoun?: string;
};

export const FORMS: Record<string, FormSpec> = {
  identity: {
    fields: [
      { key: 'legal_name', label: 'Legal name' },
      { key: 'date_of_birth', label: 'Date of birth', placeholder: 'YYYY-MM-DD' },
      { key: 'sex', label: 'Sex' },
      { key: 'pronouns', label: 'Pronouns' },
      { key: 'preferred_language', label: 'Preferred language' },
    ],
  },
  contact: {
    fields: [
      { key: 'phone', label: 'Phone', keyboard: 'phone-pad' },
      { key: 'email', label: 'Email', keyboard: 'email-address' },
    ],
  },
  addresses: {
    itemNoun: 'address',
    itemTitle: (a) => a.label || 'Address',
    itemSubtitle: (a) => [a.line1, a.line2, [a.city, a.state].filter(Boolean).join(', '), a.postal_code].filter(Boolean).join(' · '),
    fields: [
      { key: 'label', label: 'Label', placeholder: 'Home, Work, Mailing…' },
      { key: 'line1', label: 'Street address' },
      { key: 'line2', label: 'Apt, suite (optional)' },
      { key: 'city', label: 'City' },
      { key: 'state', label: 'State / region' },
      { key: 'postal_code', label: 'Postal code' },
      { key: 'country', label: 'Country', placeholder: 'US' },
      { key: 'primary', label: 'Primary address', kind: 'bool' },
    ],
  },
  emergency_contacts: {
    itemNoun: 'contact',
    itemTitle: (c) => c.name || 'Contact',
    itemSubtitle: (c) => [c.relationship, c.phone].filter(Boolean).join(' · '),
    fields: [
      { key: 'name', label: 'Name' },
      { key: 'relationship', label: 'Relationship' },
      { key: 'phone', label: 'Phone', keyboard: 'phone-pad' },
    ],
  },
  insurance: {
    itemNoun: 'plan',
    itemTitle: (p) => p.carrier || 'Plan',
    itemSubtitle: (p) => [p.plan, p.member_id && `ID ${p.member_id}`].filter(Boolean).join(' · '),
    fields: [
      { key: 'carrier', label: 'Carrier' },
      { key: 'plan', label: 'Plan' },
      { key: 'member_id', label: 'Member ID' },
      { key: 'group_number', label: 'Group number' },
      { key: 'primary', label: 'Primary plan', kind: 'bool' },
    ],
  },
  'medical.allergies': {
    itemNoun: 'allergy',
    itemTitle: (a) => a.substance || 'Allergy',
    itemSubtitle: (a) => [a.reaction, a.severity].filter(Boolean).join(' · '),
    fields: [
      { key: 'substance', label: 'Substance' },
      { key: 'reaction', label: 'Reaction' },
      { key: 'severity', label: 'Severity', placeholder: 'mild, moderate, severe' },
    ],
  },
  'medical.medications': {
    itemNoun: 'medication',
    itemTitle: (m) => m.name || 'Medication',
    itemSubtitle: (m) => [m.dose, m.frequency].filter(Boolean).join(' · '),
    fields: [
      { key: 'name', label: 'Name' },
      { key: 'dose', label: 'Dose' },
      { key: 'frequency', label: 'Frequency' },
    ],
  },
  'medical.conditions': {
    itemNoun: 'condition',
    itemTitle: (c) => c.name || 'Condition',
    itemSubtitle: (c) => [c.since && `since ${c.since}`, c.status].filter(Boolean).join(' · '),
    fields: [
      { key: 'name', label: 'Condition' },
      { key: 'since', label: 'Since (year)' },
      { key: 'status', label: 'Status', placeholder: 'active, managed, resolved' },
    ],
  },
  'medical.history': {
    fields: [
      { key: 'surgeries', label: 'Surgeries', kind: 'lines', placeholder: 'One per line, e.g. Appendectomy (2012)' },
      { key: 'hospitalizations', label: 'Hospitalizations', kind: 'lines', placeholder: 'One per line' },
      { key: 'family_history', label: 'Family history', kind: 'lines', placeholder: 'One per line' },
      { key: 'smoking', label: 'Smoking' },
      { key: 'alcohol', label: 'Alcohol' },
    ],
  },
  'medical.immunizations': {
    itemNoun: 'vaccine',
    itemTitle: (v) => v.vaccine || 'Vaccine',
    itemSubtitle: (v) => v.date || '',
    fields: [
      { key: 'vaccine', label: 'Vaccine' },
      { key: 'date', label: 'Date', placeholder: 'YYYY-MM-DD' },
    ],
  },
  payment: {
    itemNoun: 'card',
    itemTitle: (c) => c.label || `${c.brand} card`,
    itemSubtitle: (c) => `${c.brand} •••• ${c.last4} · exp ${String(c.exp_month).padStart(2, '0')}/${c.exp_year}`,
    fields: [], // cards use a dedicated add-card form; see ProfileSectionScreen
  },
};

export function summarize(scope: string, value: any): string {
  const spec = FORMS[scope];
  if (Array.isArray(value)) {
    if (!value.length) return 'Not added yet';
    return value.map((v) => spec?.itemTitle?.(v) ?? '').filter(Boolean).slice(0, 3).join(', ') + (value.length > 3 ? ` +${value.length - 3}` : '');
  }
  const filled = spec?.fields.filter((f) => {
    const v = value?.[f.key];
    return Array.isArray(v) ? v.length : v !== undefined && v !== '' && v !== null;
  });
  if (!filled?.length) return 'Not added yet';
  const first = value[filled[0].key];
  return Array.isArray(first) ? `${filled.length} of ${spec.fields.length} filled` : String(first);
}

export function detectBrand(number: string) {
  const n = number.replace(/\D/g, '');
  if (/^4/.test(n)) return 'Visa';
  if (/^(5[1-5]|2[2-7])/.test(n)) return 'Mastercard';
  if (/^3[47]/.test(n)) return 'Amex';
  if (/^6(011|5)/.test(n)) return 'Discover';
  return 'Card';
}
