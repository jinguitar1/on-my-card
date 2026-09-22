import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../../auth/AuthContext';
import { Card, GhostButton, PrimaryButton } from '../../ui/components';
import { colors, space, type } from '../../ui/theme';

type Step = 'email' | 'code';

/**
 * Email + one-time code, two steps in one screen. Presented as a modal from Settings
 * (or the Card-screen backup banner) — never gates onboarding or the main tabs.
 *
 * The code's length isn't hardcoded to 6 — Supabase's email-OTP length depends on
 * project config (we've seen 8 digits in practice), so the input just accepts
 * whatever comes back and lets the server be the source of truth on validity.
 */
export default function SignInScreen({ navigation }: any) {
  const { sendCode, verifyCode } = useAuth();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailValid = /^\S+@\S+\.\S+$/.test(email.trim());

  async function handleSendCode() {
    setError(null);
    setBusy(true);
    const { error: err } = await sendCode(email);
    setBusy(false);
    if (err) setError(err);
    else setStep('code');
  }

  async function handleVerify() {
    setError(null);
    setBusy(true);
    const { error: err } = await verifyCode(email, code);
    setBusy(false);
    if (err) setError(err);
    else navigation.goBack();
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <Text style={type.display}>Sign in</Text>
          <Pressable onPress={() => navigation.goBack()}>
            <Text style={styles.close}>Close</Text>
          </Pressable>
        </View>

        <View style={styles.content}>
          {step === 'email' ? (
            <Card style={{ gap: space.md }}>
              <Text style={type.h2}>Back up this card</Text>
              <Text style={styles.hint}>
                No password — we'll email you a one-time code. Your card stays local either way; this just adds a
                copy in the cloud.
              </Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="you@email.com"
                placeholderTextColor={colors.inkFaint}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
                style={styles.input}
              />
              {error && <Text style={styles.error}>{error}</Text>}
              <PrimaryButton label={busy ? 'Sending…' : 'Send code'} onPress={handleSendCode} disabled={!emailValid || busy} />
            </Card>
          ) : (
            <Card style={{ gap: space.md }}>
              <Text style={type.h2}>Check your email</Text>
              <Text style={styles.hint}>Enter the code sent to {email}.</Text>
              <TextInput
                value={code}
                onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 10))}
                placeholder="Enter code"
                placeholderTextColor={colors.inkFaint}
                keyboardType="number-pad"
                style={[styles.input, styles.codeInput]}
              />
              {error && <Text style={styles.error}>{error}</Text>}
              <PrimaryButton label={busy ? 'Verifying…' : 'Verify'} onPress={handleVerify} disabled={code.length < 6 || busy} />
              <GhostButton label="Use a different email" onPress={() => setStep('email')} disabled={busy} />
            </Card>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    marginBottom: space.lg,
  },
  close: { color: colors.inkSoft, fontWeight: '700', fontSize: 14 },
  content: { paddingHorizontal: space.lg },
  hint: { ...type.tiny, lineHeight: 16 },
  input: {
    backgroundColor: colors.cardSunk,
    borderRadius: 10,
    paddingHorizontal: space.md,
    paddingVertical: 12,
    fontSize: 15,
    fontWeight: '600',
    color: colors.ink,
  },
  codeInput: { textAlign: 'center', fontSize: 22, letterSpacing: 8, fontWeight: '800' },
  error: { color: colors.danger, fontSize: 13, fontWeight: '600' },
});
