import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, errorMessage } from '../api';
import { date, timeAgo } from '../format';
import { useSession } from '../session';
import { colors, kindIcon } from '../theme';
import { AccessRequest, AuditEvent, Grant, Provider } from '../types';
import { Button, Card, Empty, ErrorBanner, IconBubble, IconName, s, Segmented } from '../ui';

type Tab = 'requests' | 'shared' | 'activity';

export default function AccessScreen() {
  const route = useRoute<any>();
  const nav = useNavigation<any>();
  const { pending, refreshPending } = useSession();
  // The selected tab lives in route params so deep links and other screens can pick it.
  const tab: Tab = route.params?.tab ?? 'requests';
  const setTab = (t: Tab) => nav.setParams({ tab: t });
  const [grants, setGrants] = useState<Grant[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [g, a] = await Promise.all([api<Grant[]>('/me/grants'), api<AuditEvent[]>('/me/audit'), refreshPending()]);
      setGrants(g);
      setAudit(a);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [refreshPending]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  // Pending requests arrive by polling in the session; refresh the other lists when that count changes.
  // load() only sets state after awaiting the API.
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [pending.length]);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={s.screen}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      >
        <Text style={st.h1}>Access</Text>
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'requests', label: 'Requests', badge: pending.length },
            { value: 'shared', label: 'Shared' },
            { value: 'activity', label: 'Activity' },
          ]}
        />
        <ErrorBanner message={error} />
        {tab === 'requests' &&
          (pending.length ? (
            pending.map((r) => <RequestCard key={r.id} req={r} onDone={load} />)
          ) : (
            <Empty icon="checkmark-done-circle" title="You're all caught up" body="When a hospital, bank or other provider asks for your info, you'll review it here." />
          ))}
        {tab === 'shared' && <SharedList grants={grants} onChange={load} />}
        {tab === 'activity' && <ActivityList events={audit} />}
      </ScrollView>
    </SafeAreaView>
  );
}

function ProviderHeader({ provider, sub }: { provider: Provider; sub?: string }) {
  return (
    <View style={s.row}>
      <IconBubble name={(kindIcon[provider.kind] ?? 'briefcase') as IconName} />
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={[s.title, { flexShrink: 1 }]}>{provider.name}</Text>
          {provider.verified && <Ionicons name="checkmark-circle" size={16} color={colors.primary} />}
        </View>
        <Text style={s.muted}>{sub ?? `${provider.kind[0].toUpperCase()}${provider.kind.slice(1)} · ${provider.city ?? ''}`}</Text>
      </View>
    </View>
  );
}

function RequestCard({ req, onDone }: { req: AccessRequest; onDone: () => void }) {
  const { scopes } = useSession();
  const [selected, setSelected] = useState<Set<string>>(new Set(req.scopes));
  const [busy, setBusy] = useState<'approve' | 'deny' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggle = (scope: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(scope)) next.delete(scope);
      else next.add(scope);
      return next;
    });

  const respond = async (action: 'approve' | 'deny') => {
    setBusy(action);
    setError(null);
    try {
      await api(`/me/requests/${req.id}/${action}`, {
        body: action === 'approve' ? { scopes: req.scopes.filter((x) => selected.has(x)) } : {},
      });
      onDone();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(null);
    }
  };

  const groups = [...new Set(req.scopes.map((x) => scopes[x]?.group ?? 'Other'))];

  return (
    <Card>
      <ProviderHeader provider={req.provider} sub={`Requested ${timeAgo(req.created_at)}`} />
      <View style={st.purpose}>
        <Text style={st.purposeLabel}>Why they’re asking</Text>
        <Text style={s.body}>{req.purpose}</Text>
        <Text style={[s.muted, { marginTop: 6 }]}>Access lasts {req.duration_days} days, and you can revoke it anytime.</Text>
      </View>
      <Text style={[s.muted, { marginBottom: 4 }]}>Choose what to share</Text>
      {groups.map((group) => (
        <View key={group}>
          <Text style={st.group}>{group}</Text>
          {req.scopes
            .filter((x) => (scopes[x]?.group ?? 'Other') === group)
            .map((x) => (
              <Pressable key={x} style={st.scopeRow} onPress={() => toggle(x)}>
                <View style={{ flex: 1 }}>
                  <Text style={s.title}>{scopes[x]?.label ?? x}</Text>
                  <Text style={s.muted}>{scopes[x]?.description}</Text>
                </View>
                <Switch value={selected.has(x)} onValueChange={() => toggle(x)} trackColor={{ true: colors.primary }} />
              </Pressable>
            ))}
        </View>
      ))}
      <ErrorBanner message={error} />
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
        <View style={{ flex: 1 }}>
          <Button title="Deny" variant="secondary" onPress={() => respond('deny')} loading={busy === 'deny'} disabled={!!busy} />
        </View>
        <View style={{ flex: 1.6 }}>
          <Button
            title={selected.size === req.scopes.length ? 'Approve all' : `Share ${selected.size} of ${req.scopes.length}`}
            icon="shield-checkmark"
            onPress={() => respond('approve')}
            loading={busy === 'approve'}
            disabled={!!busy || selected.size === 0}
          />
        </View>
      </View>
    </Card>
  );
}

function SharedList({ grants, onChange }: { grants: Grant[]; onChange: () => void }) {
  const { scopes } = useSession();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<number | null>(null);

  if (!grants.length) return <Empty icon="lock-closed" title="Nothing shared" body="No organization can currently see any of your profile." />;

  const providers = [...new Map(grants.map((g) => [g.provider.id, g.provider])).values()];
  const revoke = async (key: string, path: string) => {
    setBusy(key);
    try {
      await api(path, { method: 'DELETE' });
      onChange();
    } finally {
      setBusy(null);
      setConfirming(null);
    }
  };

  return (
    <>
      {providers.map((p) => {
        const mine = grants.filter((g) => g.provider.id === p.id);
        return (
          <Card key={p.id}>
            <ProviderHeader provider={p} sub={`Access until ${date(mine[0].expires_at)}`} />
            <View style={{ marginTop: 10 }}>
              {mine.map((g) => (
                <View key={g.id} style={st.grantRow}>
                  <Ionicons name="eye-outline" size={16} color={colors.muted} />
                  <Text style={[s.body, { flex: 1 }]}>{scopes[g.scope]?.label ?? g.scope}</Text>
                  <Pressable hitSlop={10} onPress={() => revoke(`g${g.id}`, `/me/grants/${g.id}`)} disabled={!!busy}>
                    <Text style={st.revoke}>{busy === `g${g.id}` ? '…' : 'Remove'}</Text>
                  </Pressable>
                </View>
              ))}
            </View>
            <View style={{ marginTop: 10 }}>
              {confirming === p.id ? (
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Button title="Cancel" variant="secondary" small onPress={() => setConfirming(null)} />
                  </View>
                  <View style={{ flex: 1.5 }}>
                    <Button
                      title="Yes, revoke all"
                      variant="danger"
                      small
                      loading={busy === `p${p.id}`}
                      onPress={() => revoke(`p${p.id}`, `/me/providers/${p.id}/grants`)}
                    />
                  </View>
                </View>
              ) : (
                <Button title="Revoke all access" variant="danger" small icon="close-circle" onPress={() => setConfirming(p.id)} />
              )}
            </View>
          </Card>
        );
      })}
    </>
  );
}

const actionText: Record<string, { text: string; icon: IconName; tone: string }> = {
  'account.created': { text: 'Created your 1Profile', icon: 'sparkles', tone: colors.primary },
  'profile.updated': { text: 'Updated', icon: 'create', tone: colors.primary },
  'profile.viewed': { text: 'Viewed your profile', icon: 'eye', tone: colors.warn },
  'request.created': { text: 'Requested access', icon: 'hand-left', tone: colors.warn },
  'request.approved': { text: 'You approved access', icon: 'shield-checkmark', tone: colors.success },
  'request.partially_approved': { text: 'You approved partial access', icon: 'shield-half', tone: colors.success },
  'request.denied': { text: 'You denied access', icon: 'ban', tone: colors.danger },
  'grant.revoked': { text: 'You revoked access', icon: 'close-circle', tone: colors.danger },
  'grant.revoked_all': { text: 'You revoked all access', icon: 'close-circle', tone: colors.danger },
  'ai.brief_generated': { text: 'Generated an AI summary from your shared data', icon: 'sparkles', tone: colors.warn },
  'ai.question_asked': { text: "Asked their AI about your shared data", icon: 'chatbubbles', tone: colors.warn },
  'appointment.created': { text: 'Added an appointment', icon: 'calendar', tone: colors.primary },
  'bill.created': { text: 'Sent a bill', icon: 'receipt', tone: colors.primary },
  'bill.paid': { text: 'You paid a bill', icon: 'card', tone: colors.success },
  'lab_result.created': { text: 'Added a lab result', icon: 'flask', tone: colors.primary },
};

function ActivityList({ events }: { events: AuditEvent[] }) {
  const { scopes } = useSession();
  if (!events.length) return <Empty icon="time" title="No activity yet" />;
  return (
    <Card style={{ paddingVertical: 4 }}>
      {events.map((e, idx) => {
        const a = actionText[e.action] ?? { text: e.action, icon: 'ellipse' as IconName, tone: colors.muted };
        const who = e.actor_name === 'You' ? null : [e.actor_name, e.provider?.name].filter(Boolean).join(' · ');
        const scopeLabels = e.scopes.map((x) => scopes[x]?.label ?? x);
        return (
          <View key={e.id} style={[st.event, idx > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
            <Ionicons name={a.icon} size={18} color={a.tone} style={{ marginTop: 2 }} />
            <View style={{ flex: 1, gap: 2 }}>
              {who && <Text style={s.title}>{who}</Text>}
              <Text style={s.body}>
                {a.text}
                {e.action === 'profile.updated' && scopeLabels.length ? ` ${scopeLabels.join(', ')}` : ''}
                {e.action !== 'profile.updated' && e.provider && e.actor_name === 'You' ? ` · ${e.provider.name}` : ''}
              </Text>
              {e.action !== 'profile.updated' && scopeLabels.length > 0 && (
                <Text style={s.muted} numberOfLines={2}>{scopeLabels.join(', ')}</Text>
              )}
              {e.detail && <Text style={s.muted}>{e.detail}</Text>}
            </View>
            <Text style={st.time}>{timeAgo(e.created_at)}</Text>
          </View>
        );
      })}
    </Card>
  );
}

const st = StyleSheet.create({
  h1: { fontSize: 28, fontWeight: '800', color: colors.text, marginBottom: 14, marginTop: 4 },
  purpose: { backgroundColor: colors.bg, borderRadius: 12, padding: 12, marginVertical: 12 },
  purposeLabel: { fontSize: 12, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', marginBottom: 4 },
  group: { fontSize: 12, fontWeight: '700', color: colors.primary, marginTop: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  scopeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9 },
  grantRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
  revoke: { color: colors.danger, fontWeight: '600', fontSize: 14 },
  event: { flexDirection: 'row', gap: 12, paddingVertical: 12 },
  time: { fontSize: 12, color: colors.faint },
});

