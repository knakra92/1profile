import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api } from '../api';
import { summarize } from '../profileForms';
import { useSession } from '../session';
import { colors } from '../theme';
import { Grant, Profile } from '../types';
import { Button, Card, IconBubble, IconName, s, SectionTitle } from '../ui';

const scopeIcon: Record<string, IconName> = {
  identity: 'person',
  contact: 'call',
  addresses: 'home',
  emergency_contacts: 'people',
  insurance: 'shield-checkmark',
  'medical.allergies': 'warning',
  'medical.medications': 'medical',
  'medical.conditions': 'fitness',
  'medical.history': 'document-text',
  'medical.immunizations': 'bandage',
  payment: 'card',
};

export default function ProfileScreen() {
  const nav = useNavigation<any>();
  const { scopes, user, logout } = useSession();
  const [profile, setProfile] = useState<Profile>({});
  const [grants, setGrants] = useState<Grant[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [p, g] = await Promise.all([api<Profile>('/me/profile'), api<Grant[]>('/me/grants')]);
    setProfile(p);
    setGrants(g);
  }, []);

  useFocusEffect(useCallback(() => { load().catch(() => {}); }, [load]));

  const groups = [...new Set(Object.values(scopes).map((x) => x.group))];

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={s.screen}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load().catch(() => {}); setRefreshing(false); }} />}
    >
      <Card style={st.tip}>
        <Ionicons name="sync" size={18} color={colors.primary} />
        <Text style={[s.body, { flex: 1 }]}>
          Update once here. Everyone you’ve shared a section with sees the latest version automatically.
        </Text>
      </Card>
      {groups.map((group) => (
        <View key={group}>
          <SectionTitle>{group}</SectionTitle>
          <Card style={{ paddingVertical: 4 }}>
            {Object.entries(scopes)
              .filter(([, info]) => info.group === group)
              .map(([scope, info], idx) => {
                const sharedWith = new Set(grants.filter((g) => g.scope === scope).map((g) => g.provider.name)).size;
                return (
                  <Pressable
                    key={scope}
                    onPress={() => nav.navigate('ProfileSection', { scope, title: info.label })}
                    style={[st.row, idx > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}
                  >
                    <IconBubble name={scopeIcon[scope] ?? 'ellipse'} color={scope === 'medical.allergies' ? colors.danger : colors.primary} bg={scope === 'medical.allergies' ? colors.dangerSoft : colors.primarySoft} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.title}>{info.label}</Text>
                      <Text style={s.muted} numberOfLines={1}>{summarize(scope, profile[scope])}</Text>
                    </View>
                    {sharedWith > 0 && (
                      <View style={st.shared}>
                        <Ionicons name="eye" size={12} color={colors.muted} />
                        <Text style={st.sharedText}>{sharedWith}</Text>
                      </View>
                    )}
                    <Ionicons name="chevron-forward" size={18} color={colors.faint} />
                  </Pressable>
                );
              })}
          </Card>
        </View>
      ))}
      <SectionTitle>Account</SectionTitle>
      <Card>
        <Text style={s.title}>{user?.full_name}</Text>
        <Text style={[s.muted, { marginBottom: 12 }]}>{user?.email}</Text>
        <Button title="Sign out" variant="secondary" icon="log-out-outline" onPress={logout} />
      </Card>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  tip: { flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: colors.primarySoft },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  shared: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#F1F5F9', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999 },
  sharedText: { fontSize: 12, color: colors.muted, fontWeight: '600' },
});
