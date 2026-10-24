import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, errorMessage } from '../api';
import { date, dateTime, daysUntil, money, owed } from '../format';
import { colors } from '../theme';
import { Appointment, Bill, LabResult } from '../types';
import { Button, Card, Empty, ErrorBanner, Pill, s, Segmented } from '../ui';

type Tab = 'appointments' | 'bills' | 'results';

export default function HealthScreen() {
  const route = useRoute<any>();
  const nav = useNavigation<any>();
  const tab: Tab = route.params?.tab ?? 'appointments';
  const setTab = (t: Tab) => nav.setParams({ tab: t });
  const [appts, setAppts] = useState<Appointment[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [results, setResults] = useState<LabResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [a, b, r] = await Promise.all([
        api<Appointment[]>('/me/appointments'),
        api<Bill[]>('/me/bills'),
        api<LabResult[]>('/me/results'),
      ]);
      setAppts(a);
      setBills(b);
      setResults(r);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const pay = async (bill: Bill) => {
    setPaying(bill.id);
    try {
      await api(`/me/bills/${bill.id}/pay`, { body: {} });
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPaying(null);
    }
  };

  const ask = (prompt: string) => nav.navigate('Assistant', { prompt, nonce: Date.now() });

  const upcoming = appts.filter((a) => a.status === 'scheduled' && new Date(a.starts_at) > new Date());
  const past = appts.filter((a) => !upcoming.includes(a)).reverse();
  const due = bills.filter((b) => b.status === 'due');
  const flagged = (r: LabResult) => r.results.filter((v) => v.flag !== 'normal').length;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={s.screen}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      >
        <Text style={st.h1}>Health & bills</Text>
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'appointments', label: 'Visits' },
            { value: 'bills', label: 'Bills', badge: due.length },
            { value: 'results', label: 'Results' },
          ]}
        />
        <ErrorBanner message={error} />

        {tab === 'appointments' && (
          <>
            {!appts.length && <Empty icon="calendar-outline" title="No appointments" />}
            {upcoming.map((a) => <AppointmentCard key={a.id} a={a} />)}
            {past.length > 0 && <Text style={st.sub}>Past</Text>}
            {past.map((a) => <AppointmentCard key={a.id} a={a} past />)}
          </>
        )}

        {tab === 'bills' && (
          <>
            {!bills.length && <Empty icon="receipt-outline" title="No bills" />}
            {due.length > 1 && (
              <Card style={{ backgroundColor: colors.primarySoft }}>
                <Text style={s.muted}>Total you owe</Text>
                <Text style={st.big}>{money(due.reduce((t, b) => t + owed(b), 0))}</Text>
              </Card>
            )}
            {bills.map((b) => (
              <Card key={b.id}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                  <Text style={[s.title, { flex: 1 }]}>{b.description}</Text>
                  <Pill
                    text={b.status === 'paid' ? 'Paid' : b.due_date && daysUntil(b.due_date) < 0 ? 'Overdue' : 'Due'}
                    tone={b.status === 'paid' ? 'success' : b.due_date && daysUntil(b.due_date) < 0 ? 'danger' : 'warn'}
                  />
                </View>
                <Text style={s.muted}>{b.provider.name} · issued {date(b.issued_at)}</Text>
                <View style={st.billRows}>
                  <Row label="Total charges" value={money(b.amount_cents)} />
                  <Row label="Insurance covered" value={`− ${money(b.insurance_covered_cents)}`} tone={colors.success} />
                  <Row label={b.status === 'paid' ? 'You paid' : 'You owe'} value={money(owed(b))} bold />
                </View>
                {b.status === 'due' ? (
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Button
                        title="Ask AI"
                        small
                        variant="secondary"
                        icon="sparkles"
                        onPress={() => ask(`Explain my bill "${b.description}" from ${b.provider.name}. Is anything worth questioning?`)}
                      />
                    </View>
                    <View style={{ flex: 1.4 }}>
                      <Button title={`Pay ${money(owed(b))}`} small icon="card" loading={paying === b.id} onPress={() => pay(b)} />
                    </View>
                  </View>
                ) : (
                  b.paid_at && <Text style={s.muted}>Paid {date(b.paid_at)} with card on file</Text>
                )}
                {b.status === 'due' && b.due_date && <Text style={[s.muted, { marginTop: 8 }]}>Due {date(b.due_date)}</Text>}
              </Card>
            ))}
          </>
        )}

        {tab === 'results' && (
          <>
            {!results.length && <Empty icon="flask-outline" title="No lab results" />}
            {results.length > 0 && (
              <Button
                title="Summarize my latest results"
                icon="sparkles"
                onPress={() => ask('Give me a plain-language summary of my latest lab results. What should I ask my doctor about?')}
              />
            )}
            <View style={{ height: 12 }} />
            {results.map((r) => (
              <Card key={r.id}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                  <Text style={[s.title, { flex: 1 }]}>{r.test_name}</Text>
                  {flagged(r) > 0 ? <Pill text={`${flagged(r)} flagged`} tone="warn" /> : <Pill text="All normal" tone="success" />}
                </View>
                <Text style={[s.muted, { marginBottom: 8 }]}>{r.provider.name} · {date(r.collected_at)}</Text>
                {r.results.map((v, i) => (
                  <View key={i} style={st.labRow}>
                    <Text style={[s.body, { flex: 1 }]}>{v.name}</Text>
                    <Text style={[s.body, { fontWeight: '700', color: v.flag === 'normal' ? colors.text : v.flag === 'high' ? colors.danger : colors.warn }]}>
                      {v.value} {v.unit}
                      {v.flag !== 'normal' && (
                        <Text> {v.flag === 'high' ? '▲' : '▼'}</Text>
                      )}
                    </Text>
                    <Text style={st.range}>{v.ref_range}</Text>
                  </View>
                ))}
                {r.notes && <Text style={[s.muted, { marginTop: 6 }]}>{r.notes}</Text>}
                <View style={{ marginTop: 10 }}>
                  <Button title="Explain this result" small variant="secondary" icon="sparkles" onPress={() => ask(`Explain my ${r.test_name} from ${date(r.collected_at)} in plain language.`)} />
                </View>
              </Card>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function AppointmentCard({ a, past }: { a: Appointment; past?: boolean }) {
  const d = new Date(a.starts_at);
  return (
    <Card style={past ? { opacity: 0.7 } : undefined}>
      <View style={{ flexDirection: 'row', gap: 14 }}>
        <View style={st.dateBox}>
          <Text style={st.dateMonth}>{d.toLocaleString('en-US', { month: 'short' }).toUpperCase()}</Text>
          <Text style={st.dateDay}>{d.getDate()}</Text>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={s.title}>{a.department ?? 'Visit'}</Text>
            {past && <Pill text={a.status} />}
          </View>
          <Text style={s.muted}>{dateTime(a.starts_at)}</Text>
          {a.reason && <Text style={s.body}>{a.reason}</Text>}
          <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center', marginTop: 4 }}>
            <Ionicons name="location-outline" size={14} color={colors.muted} />
            <Text style={s.muted}>{[a.provider.name, a.location].filter(Boolean).join(' · ')}</Text>
          </View>
          {a.clinician && <Text style={s.muted}>with {a.clinician}</Text>}
        </View>
      </View>
    </Card>
  );
}

function Row({ label, value, bold, tone }: { label: string; value: string; bold?: boolean; tone?: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
      <Text style={[s.body, bold && { fontWeight: '700' }]}>{label}</Text>
      <Text style={[s.body, bold && { fontWeight: '800' }, tone ? { color: tone } : null]}>{value}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  h1: { fontSize: 28, fontWeight: '800', color: colors.text, marginBottom: 14, marginTop: 4 },
  sub: { fontSize: 13, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', marginVertical: 8 },
  big: { fontSize: 28, fontWeight: '800', color: colors.text },
  billRows: { borderTopWidth: 1, borderTopColor: colors.border, marginVertical: 10, paddingTop: 8 },
  labRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.border },
  range: { width: 76, textAlign: 'right', fontSize: 12, color: colors.faint },
  dateBox: { width: 52, height: 56, borderRadius: 12, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  dateMonth: { fontSize: 11, fontWeight: '800', color: colors.primary },
  dateDay: { fontSize: 22, fontWeight: '800', color: colors.primaryDark },
});
