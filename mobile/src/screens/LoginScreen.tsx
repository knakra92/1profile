import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { errorMessage } from '../api';
import { useSession } from '../session';
import { colors } from '../theme';
import { Button, ErrorBanner, Field } from '../ui';

export default function LoginScreen() {
  const { login, register } = useSession();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (mode === 'login') await login(email.trim(), password);
      else await register(name.trim(), email.trim(), password);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={st.wrap} keyboardShouldPersistTaps="handled">
          <View style={st.logo}>
            <Ionicons name="finger-print" size={40} color="#fff" />
          </View>
          <Text style={st.brand}>1Profile</Text>
          <Text style={st.tagline}>One profile. You decide who sees what.</Text>

          <View style={{ marginTop: 32 }}>
            <ErrorBanner message={error} />
            {mode === 'register' && <Field label="Full name" value={name} onChangeText={setName} autoComplete="name" />}
            <Field
              label="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
            />
            <Field
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder={mode === 'register' ? 'At least 8 characters' : undefined}
            />
            <Button title={mode === 'login' ? 'Sign in' : 'Create my 1Profile'} onPress={submit} loading={busy} />
            <Pressable onPress={() => setMode(mode === 'login' ? 'register' : 'login')} style={{ padding: 16 }}>
              <Text style={st.switch}>
                {mode === 'login' ? "New here? Create your 1Profile" : 'Already have an account? Sign in'}
              </Text>
            </Pressable>
          </View>

          {mode === 'login' && (
            <Pressable
              style={st.demo}
              onPress={() => {
                setEmail('alex@demo.com');
                setPassword('demo1234');
              }}
            >
              <Ionicons name="flash" size={16} color={colors.primary} />
              <Text style={st.demoText}>Use demo account (Alex Morgan)</Text>
            </Pressable>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  wrap: { padding: 24, paddingTop: 56 },
  logo: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  brand: { fontSize: 32, fontWeight: '800', textAlign: 'center', marginTop: 16, color: colors.text },
  tagline: { fontSize: 16, color: colors.muted, textAlign: 'center', marginTop: 6 },
  switch: { color: colors.primary, textAlign: 'center', fontWeight: '600', fontSize: 15 },
  demo: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
    padding: 12,
    borderRadius: 12,
  },
  demoText: { color: colors.primary, fontWeight: '600' },
});
