import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, errorMessage } from '../api';
import { dateTime, daysUntil, money, owed } from '../format';
import { useSession } from '../session';
import { colors, kindIcon, radius } from '../theme';
import { Appointment, Bill, Grant, Insight } from '../types';
import { Button, Card, IconBubble, IconName, Pill, s, SectionTitle } from '../ui';

const sectorIcon: Record<string, IconName> = {
  health: 'heart',
  finance: 'wallet',
  privacy: 'lock-closed',
  admin: 'document-text',
};

export default function HomeScreen() {
  const nav = useNavigation<any>();
  const { user, pending } = useSession();
  const [appts, setAppts] = useState<Appointment[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [insights, setInsights] = useState<Insight[] | null>(null);
  const [insightsBusy, setInsightsBusy] = useState(false);
  const [insightsError, setInsightsError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [a, b, g] = await Promise.all([
      api<Appointment[]>('/me/appointments'),
      api<Bill[]>('/me/bills'),
      api<Grant[]>('/me/grants'),
    ]);
    setAppts(a.filter((x) => x.status === 'scheduled' && new Date(x.starts_at) > new Date()));
    setBills(b.filter((x) => x.status === 'due'));
    setGrants(g);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => {});
    }, [load]),
  );

  const loadInsights = async () => {
    setInsightsBusy(true);
    setInsightsError(null);
    try {
      setInsights((await api<{ insights: Insight[] }>('/me/assistant/insights')).insights);
    } catch (e) {
      setInsightsError(errorMessage(e));
    } finally {
      setInsightsBusy(false);
    }
  };

  const next = appts[0];
  const totalDue = bills.reduce((sum, b) => sum + owed(b), 0);
  const orgs = new Set(grants.map((g) => g.provider.id)).size;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={s.screen}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load().catch(() => {}); setRefreshing(false); }} />
        }
      >
        <Text style={st.hello}>Hi, {user?.full_name.split(' ')[0]}</Text>

        <View style={st.idCard}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={st.idBrand}>1Profile</Text>
            <Ionicons name="finger-print" size={26} color="rgba(255,255,255,0.8)" />
          </View>
          <Text style={st.idName}>{user?.full_name}</Text>
          <Text style={st.idLabel}>Share code — show this at check-in</Text>
          <Text style={st.idCode} selectable>{user?.share_code}</Text>
          <Text style={st.idFoot}>Shared with {orgs} organization{orgs === 1 ? '' : 's'} · nothing is shared without your approval</Text>
        </View>

        {pending.length > 0 && (
          <Pressable onPress={() => nav.navigate('Access')}>
            <Card style={st.alert}>
              <View style={s.row}>
                <IconBubble name="hand-left" color={colors.warn} bg="#FEF3C7" />
                <View style={{ flex: 1 }}>
                  <Text style={s.title}>
                    {pending.length} access request{pending.length > 1 ? 's' : ''} waiting
                  </Text>
                  <Text style={s.muted}>{pending.map((p) => p.provider.name).join(', ')}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.muted} />
              </View>
            </Card>
          </Pressable>
        )}

        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Pressable style={{ flex: 1 }} onPress={() => nav.navigate('Health', { tab: 'appointments' })}>
            <Card style={{ minHeight: 132 }}>
              <IconBubble name="calendar" />
              <Text style={st.statLabel}>Next appointment</Text>
              {next ? (
                <>
                  <Text style={s.title} numberOfLines={1}>{next.department}</Text>
                  <Text style={s.muted}>{dateTime(next.starts_at)}</Text>
                </>
              ) : (
                <Text style={s.muted}>None scheduled</Text>
              )}
            </Card>
          </Pressable>
          <Pressable style={{ flex: 1 }} onPress={() => nav.navigate('Health', { tab: 'bills' })}>
            <Card style={{ minHeight: 132 }}>
              <IconBubble name="receipt" color={colors.success} bg={colors.successSoft} />
              <Text style={st.statLabel}>Bills due</Text>
              <Text style={st.statValue}>{money(totalDue)}</Text>
              <Text style={s.muted}>
                {bills.length ? `${bills.length} bill${bills.length > 1 ? 's' : ''} · due in ${Math.min(...bills.map((b) => (b.due_date ? daysUntil(b.due_date) : 99)))}d` : 'All paid'}
              </Text>
            </Card>
          </Pressable>
        </View>

        <SectionTitle right={insights && <Button title="Refresh" small variant="ghost" onPress={loadInsights} loading={insightsBusy} />}>
          For you
        </SectionTitle>
        <Card>
          {insights === null && !insightsBusy && (
            <View style={{ gap: 12 }}>
              <View style={s.row}>
                <IconBubble name="sparkles" />
                <Text style={[s.body, { flex: 1 }]}>
                  Get personal recommendations across health, bills and privacy from your 1Profile assistant.
                </Text>
              </View>
              {insightsError && <Text style={{ color: colors.danger, fontSize: 13 }}>{insightsError}</Text>}
              <Button title="Generate insights" icon="sparkles" onPress={loadInsights} />
            </View>
          )}
          {insightsBusy && (
            <View style={{ alignItems: 'center', padding: 20, gap: 10 }}>
              <ActivityIndicator color={colors.primary} />
              <Text style={s.muted}>Reviewing your profile…</Text>
            </View>
          )}
          {!insightsBusy && insights?.length === 0 && <Text style={s.muted}>No recommendations right now.</Text>}
          {!insightsBusy &&
            insights?.map((i, idx) => (
              <View key={idx} style={[st.insight, idx > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
                <IconBubble name={sectorIcon[i.sector] ?? 'bulb'} />
                <View style={{ flex: 1, gap: 2 }}>
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                    <Text style={[s.title, { flex: 1 }]}>{i.title}</Text>
                    {i.priority === 'high' && <Pill text="High" tone="danger" />}
                  </View>
                  <Text style={s.body}>{i.detail}</Text>
                </View>
              </View>
            ))}
        </Card>

        <SectionTitle>Who can see your data</SectionTitle>
        <Card>
          {grants.length === 0 && <Text style={s.muted}>No one. Approve a request to share.</Text>}
          {[...new Map(grants.map((g) => [g.provider.id, g.provider])).values()].map((p, idx) => (
            <Pressable key={p.id} onPress={() => nav.navigate('Access', { tab: 'shared' })}>
              <View style={[s.row, { paddingVertical: 10 }, idx > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
                <IconBubble name={(kindIcon[p.kind] ?? 'briefcase') as IconName} />
                <View style={{ flex: 1 }}>
                  <Text style={s.title}>{p.name}</Text>
                  <Text style={s.muted}>{grants.filter((g) => g.provider.id === p.id).length} sections shared</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.faint} />
              </View>
            </Pressable>
          ))}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  hello: { fontSize: 28, fontWeight: '800', color: colors.text, marginBottom: 14, marginTop: 4 },
  idCard: { backgroundColor: colors.primary, borderRadius: radius.lg + 4, padding: 20, marginBottom: 14 },
  idBrand: { color: '#fff', fontWeight: '800', fontSize: 18, letterSpacing: 0.3 },
  idName: { color: '#fff', fontSize: 20, fontWeight: '600', marginTop: 18 },
  idLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 14, textTransform: 'uppercase', letterSpacing: 0.6 },
  idCode: { color: '#fff', fontSize: 34, fontWeight: '800', letterSpacing: 4, marginTop: 2, fontVariant: ['tabular-nums'] },
  idFoot: { color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 12 },
  alert: { backgroundColor: colors.warnSoft, borderWidth: 1, borderColor: '#FDE68A' },
  statLabel: { fontSize: 12, color: colors.muted, marginTop: 10, marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: '600' },
  statValue: { fontSize: 22, fontWeight: '800', color: colors.text },
  insight: { flexDirection: 'row', gap: 12, paddingVertical: 12 },
});
