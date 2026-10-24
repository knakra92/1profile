import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { api, errorMessage } from '../api';
import { detectBrand, FieldSpec, FORMS } from '../profileForms';
import { useSession } from '../session';
import { colors } from '../theme';
import { Profile } from '../types';
import { Button, Card, Empty, ErrorBanner, Field, s } from '../ui';

export default function ProfileSectionScreen() {
  const { scope } = useRoute<any>().params as { scope: string };
  const nav = useNavigation<any>();
  const { scopes } = useSession();
  const info = scopes[scope];
  const spec = FORMS[scope];
  const [value, setValue] = useState<any>(null);
  const [editing, setEditing] = useState<number | 'new' | null>(null); // list item being edited
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (info) nav.setOptions({ title: info.label });
  }, [nav, info]);

  useEffect(() => {
    api<Profile>('/me/profile').then((p) => setValue(p[scope])).catch((e) => setError(errorMessage(e)));
  }, [scope]);

  const save = async (next: any) => {
    setSaving(true);
    setError(null);
    try {
      await api(`/me/profile/${scope}`, { method: 'PUT', body: { data: next } });
      setValue(next);
      setEditing(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  if (value === null) return <View style={{ flex: 1, backgroundColor: colors.bg }}><ErrorBanner message={error} /></View>;

  const isList = info?.shape === 'list';

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }} keyboardVerticalOffset={90}>
      <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={s.screen} keyboardShouldPersistTaps="handled">
        <Text style={[s.muted, { marginBottom: 14 }]}>{info?.description}</Text>
        <ErrorBanner message={error} />
        {saved && (
          <View style={st.saved}>
            <Ionicons name="checkmark-circle" size={18} color={colors.success} />
            <Text style={{ color: colors.success, fontWeight: '600' }}>Saved. Providers you share this with see it now.</Text>
          </View>
        )}

        {!isList && <ObjectForm fields={spec.fields} initial={value} saving={saving} onSave={save} />}

        {isList && editing === null && (
          <>
            {value.length === 0 && <Empty icon="add-circle-outline" title={`No ${spec.itemNoun ?? 'item'}s yet`} />}
            {value.map((item: any, idx: number) => (
              <Card key={idx}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  {scope === 'payment' && <Ionicons name="card" size={26} color={colors.primary} />}
                  <View style={{ flex: 1 }}>
                    <Text style={s.title}>{spec.itemTitle?.(item)}</Text>
                    <Text style={s.muted}>{spec.itemSubtitle?.(item)}</Text>
                  </View>
                  {scope !== 'payment' && (
                    <Pressable hitSlop={10} onPress={() => setEditing(idx)}>
                      <Ionicons name="create-outline" size={20} color={colors.primary} />
                    </Pressable>
                  )}
                  <Pressable hitSlop={10} onPress={() => save(value.filter((_: any, i: number) => i !== idx))}>
                    <Ionicons name="trash-outline" size={20} color={colors.danger} />
                  </Pressable>
                </View>
              </Card>
            ))}
            <Button title={`Add ${spec.itemNoun ?? 'item'}`} icon="add" variant="secondary" onPress={() => setEditing('new')} />
          </>
        )}

        {isList && editing !== null && scope === 'payment' && (
          <AddCardForm saving={saving} onCancel={() => setEditing(null)} onSave={(card) => save([...value, card])} />
        )}

        {isList && editing !== null && scope !== 'payment' && (
          <Card>
            <ObjectForm
              fields={spec.fields}
              initial={editing === 'new' ? {} : value[editing]}
              saving={saving}
              submitLabel={editing === 'new' ? `Add ${spec.itemNoun}` : 'Save'}
              onCancel={() => setEditing(null)}
              onSave={(item) => save(editing === 'new' ? [...value, item] : value.map((v: any, i: number) => (i === editing ? item : v)))}
            />
          </Card>
        )}

        {editing === null && isList && (
          <Button title="Done" variant="ghost" onPress={() => nav.goBack()} />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function ObjectForm({
  fields,
  initial,
  onSave,
  onCancel,
  saving,
  submitLabel = 'Save',
}: {
  fields: FieldSpec[];
  initial: Record<string, any>;
  onSave: (v: Record<string, any>) => void;
  onCancel?: () => void;
  saving: boolean;
  submitLabel?: string;
}) {
  const [draft, setDraft] = useState<Record<string, any>>(() => ({ ...initial }));
  const set = (k: string, v: any) => setDraft((d) => ({ ...d, [k]: v }));

  const submit = () => {
    const out: Record<string, any> = { ...draft };
    for (const f of fields) {
      if (f.kind === 'lines' && typeof out[f.key] === 'string') {
        out[f.key] = out[f.key].split('\n').map((l: string) => l.trim()).filter(Boolean);
      }
      if (out[f.key] === '') delete out[f.key];
    }
    onSave(out);
  };

  return (
    <View>
      {fields.map((f) =>
        f.kind === 'bool' ? (
          <View key={f.key} style={st.boolRow}>
            <Text style={s.title}>{f.label}</Text>
            <Switch value={!!draft[f.key]} onValueChange={(v) => set(f.key, v)} trackColor={{ true: colors.primary }} />
          </View>
        ) : (
          <Field
            key={f.key}
            label={f.label}
            placeholder={f.placeholder}
            keyboardType={f.keyboard}
            autoCapitalize={f.keyboard === 'email-address' ? 'none' : 'sentences'}
            multiline={f.kind === 'lines'}
            value={Array.isArray(draft[f.key]) ? draft[f.key].join('\n') : (draft[f.key] ?? '').toString()}
            onChangeText={(t) => set(f.key, t)}
          />
        ),
      )}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {onCancel && (
          <View style={{ flex: 1 }}>
            <Button title="Cancel" variant="secondary" onPress={onCancel} />
          </View>
        )}
        <View style={{ flex: 1.5 }}>
          <Button title={submitLabel} onPress={submit} loading={saving} />
        </View>
      </View>
    </View>
  );
}

/**
 * Demo card capture. In production this is a payment-processor SDK sheet (e.g. Stripe) that returns a
 * token; the full card number never reaches 1Profile servers, which keeps us out of PCI scope.
 */
function AddCardForm({ onSave, onCancel, saving }: { onSave: (card: any) => void; onCancel: () => void; saving: boolean }) {
  const [label, setLabel] = useState('');
  const [number, setNumber] = useState('');
  const [exp, setExp] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const digits = number.replace(/\D/g, '');
    const m = exp.match(/^(\d{1,2})\s*\/\s*(\d{2,4})$/);
    if (digits.length < 13) return setError('Enter a valid card number');
    if (!m || +m[1] < 1 || +m[1] > 12) return setError('Expiry should look like 08/29');
    const year = m[2].length === 2 ? 2000 + +m[2] : +m[2];
    const brand = detectBrand(digits);
    onSave({
      label: label || `${brand} card`,
      brand,
      last4: digits.slice(-4),
      exp_month: +m[1],
      exp_year: year,
      vault_token: `tok_sim_${Date.now().toString(36)}`,
    });
  };

  return (
    <Card>
      <View style={st.pci}>
        <Ionicons name="lock-closed" size={16} color={colors.success} />
        <Text style={{ color: colors.success, flex: 1, fontSize: 13 }}>
          Your card number is tokenized on this device. 1Profile stores only the brand, last 4 digits and a vault token.
        </Text>
      </View>
      <ErrorBanner message={error} />
      <Field label="Nickname" value={label} onChangeText={setLabel} placeholder="Personal Visa" />
      <Field label="Card number" value={number} onChangeText={setNumber} keyboardType="number-pad" placeholder="4242 4242 4242 4242" />
      <Field label="Expiry" value={exp} onChangeText={setExp} placeholder="MM/YY" keyboardType="numbers-and-punctuation" />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Button title="Cancel" variant="secondary" onPress={onCancel} />
        </View>
        <View style={{ flex: 1.5 }}>
          <Button title="Add card" icon="card" onPress={submit} loading={saving} />
        </View>
      </View>
    </Card>
  );
}

const st = StyleSheet.create({
  boolRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  saved: { flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: colors.successSoft, padding: 12, borderRadius: 12, marginBottom: 12 },
  pci: { flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: colors.successSoft, padding: 10, borderRadius: 10, marginBottom: 14 },
});
