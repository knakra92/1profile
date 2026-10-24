import { Ionicons } from '@expo/vector-icons';
import { ComponentProps, ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { colors, radius, shadow } from './theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <View style={s.sectionTitleRow}>
      <Text style={s.sectionTitle}>{children}</Text>
      {right}
    </View>
  );
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  loading,
  disabled,
  small,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  small?: boolean;
}) {
  const v = buttonVariants[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        s.button,
        small && s.buttonSmall,
        { backgroundColor: v.bg, borderColor: v.border },
        (pressed || disabled) && { opacity: disabled ? 0.45 : 0.8 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.fg} />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={small ? 15 : 18} color={v.fg} />}
          <Text style={[s.buttonText, small && { fontSize: 14 }, { color: v.fg }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

const buttonVariants = {
  primary: { bg: colors.primary, fg: '#fff', border: colors.primary },
  secondary: { bg: colors.card, fg: colors.text, border: colors.border },
  danger: { bg: colors.dangerSoft, fg: colors.danger, border: colors.dangerSoft },
  ghost: { bg: 'transparent', fg: colors.primary, border: 'transparent' },
};

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput placeholderTextColor={colors.faint} style={[s.input, props.multiline && s.inputMulti]} {...props} />
    </View>
  );
}

export function Pill({ text, tone = 'neutral' }: { text: string; tone?: 'neutral' | 'success' | 'danger' | 'warn' | 'primary' }) {
  const t = pillTones[tone];
  return (
    <View style={[s.pill, { backgroundColor: t.bg }]}>
      <Text style={[s.pillText, { color: t.fg }]}>{text}</Text>
    </View>
  );
}

const pillTones = {
  neutral: { bg: '#F1F5F9', fg: colors.muted },
  success: { bg: colors.successSoft, fg: colors.success },
  danger: { bg: colors.dangerSoft, fg: colors.danger },
  warn: { bg: colors.warnSoft, fg: colors.warn },
  primary: { bg: colors.primarySoft, fg: colors.primary },
};

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; badge?: number }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={s.segmented}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} style={[s.segment, active && s.segmentActive]}>
            <Text style={[s.segmentText, active && s.segmentTextActive]}>{o.label}</Text>
            {!!o.badge && (
              <View style={s.segBadge}>
                <Text style={s.segBadgeText}>{o.badge}</Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

export function Empty({ icon, title, body }: { icon: IconName; title: string; body?: string }) {
  return (
    <View style={s.empty}>
      <Ionicons name={icon} size={36} color={colors.faint} />
      <Text style={s.emptyTitle}>{title}</Text>
      {body && <Text style={s.emptyBody}>{body}</Text>}
    </View>
  );
}

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <View style={s.error}>
      <Ionicons name="alert-circle" size={18} color={colors.danger} />
      <Text style={s.errorText}>{message}</Text>
    </View>
  );
}

export function IconBubble({ name, color = colors.primary, bg = colors.primarySoft }: { name: IconName; color?: string; bg?: string }) {
  return (
    <View style={[s.bubble, { backgroundColor: bg }]}>
      <Ionicons name={name} size={20} color={color} />
    </View>
  );
}

export const s = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 16, marginBottom: 12, ...shadow },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, marginBottom: 10 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.6 },
  button: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    paddingHorizontal: 18,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  buttonSmall: { paddingVertical: 8, paddingHorizontal: 12 },
  buttonText: { fontSize: 16, fontWeight: '600' },
  label: { fontSize: 13, fontWeight: '600', color: colors.muted, marginBottom: 6 },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
  },
  inputMulti: { minHeight: 90, textAlignVertical: 'top' },
  pill: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, alignSelf: 'flex-start' },
  pillText: { fontSize: 12, fontWeight: '700' },
  segmented: { flexDirection: 'row', backgroundColor: '#E8ECF4', borderRadius: radius.md, padding: 3, marginBottom: 14 },
  segment: { flex: 1, flexDirection: 'row', gap: 6, paddingVertical: 8, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  segmentActive: { backgroundColor: colors.card, ...shadow },
  segmentText: { fontSize: 14, fontWeight: '600', color: colors.muted },
  segmentTextActive: { color: colors.text },
  segBadge: { backgroundColor: colors.danger, borderRadius: 999, minWidth: 18, paddingHorizontal: 5, alignItems: 'center' },
  segBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700', lineHeight: 18 },
  empty: { alignItems: 'center', paddingVertical: 40, gap: 6 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: colors.text, marginTop: 4 },
  emptyBody: { fontSize: 14, color: colors.muted, textAlign: 'center', paddingHorizontal: 24 },
  error: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    backgroundColor: colors.dangerSoft,
    padding: 12,
    borderRadius: radius.md,
    marginBottom: 12,
  },
  errorText: { color: colors.danger, flex: 1, fontSize: 14 },
  bubble: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontSize: 16, fontWeight: '600', color: colors.text },
  body: { fontSize: 14, color: colors.text, lineHeight: 20 },
  muted: { fontSize: 13, color: colors.muted },
  screen: { padding: 16, paddingBottom: 40 },
});
