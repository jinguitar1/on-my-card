import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../../auth/AuthContext';
import { Card, GhostButton, PrimaryButton, Segmented } from '../../ui/components';
import { colors, space, type } from '../../ui/theme';

type Step = 'email' | 'code' | 'setPassword' | 'forgot';
type Mode = 'code' | 'password';
/** What the 'code' step is verifying — a normal sign-in code, or a password-reset
 *  code — since both reuse the same code-entry UI and both land on 'setPassword'. */
type Via = 'signin' | 'recovery';

const MIN_PASSWORD_LEN = 6; // matches Supabase's default minimum
// App-level backstop on top of Supabase Auth's own server-side OTP rate limiting —
// without this, tapping "Send code"/"Send reset code" again the instant a request
// resolves has no cooldown at all.
const RESEND_COOLDOWN_SECONDS = 30;

/**
 * Two ways in, one screen: an emailed one-time code (works for anyone, always) or a
 * password (only once someone has set one). Presented as a modal from Settings or the
 * Card-screen banner — never gates onboarding or the main tabs.
 *
 * "Forgot password?" (password mode only) sends a *code*, not a link — this app never
 * handles deep-link redirects — via the same 'code' step used for normal sign-in, just
 * tagged `via: 'recovery'` so verifying it calls `verifyRecoveryCode` instead of
 * `verifyCode`. Either path lands on 'setPassword'; for recovery there's no "Skip",
 * since setting the new password is the entire point of that path.
 */
export default function SignInScreen({ navigation }: any) {
  const { sendCode, verifyCode, signInWithPassword, setPassword, sendRecoveryCode, verifyRecoveryCode } = useAuth();
  const [step, setStep] = useState<Step>('email');
  const [mode, setMode] = useState<Mode>('code');
  const [via, setVia] = useState<Via>('signin');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPasswordField] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown === 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const emailValid = /^\S+@\S+\.\S+$/.test(email.trim());

  async function handleSendCode() {
    setError(null);
    setBusy(true);
    const { error: err } = await sendCode(email);
    setBusy(false);
    if (err) setError(err);
    else {
      setCooldown(RESEND_COOLDOWN_SECONDS);
      setVia('signin');
      setStep('code');
    }
  }

  async function handleSendRecoveryCode() {
    setError(null);
    setBusy(true);
    const { error: err } = await sendRecoveryCode(email);
    setBusy(false);
    if (err) setError(err);
    else {
      setCooldown(RESEND_COOLDOWN_SECONDS);
      setVia('recovery');
      setStep('code');
    }
  }

  async function handleVerify() {
    setError(null);
    setBusy(true);
    const { error: err } = via === 'recovery' ? await verifyRecoveryCode(email, code) : await verifyCode(email, code);
    setBusy(false);
    if (err) setError(err);
    else setStep('setPassword'); // for 'signin' this is a one-time, skippable offer; for 'recovery' it's the point
  }

  async function handlePasswordSignIn() {
    setError(null);
    setBusy(true);
    const { error: err } = await signInWithPassword(email, password);
    setBusy(false);
    if (err) setError('Wrong email or password. Switch to "Code," or tap "Forgot password?" below.');
    else navigation.goBack();
  }

  async function handleSavePassword() {
    setPasswordError(null);
    if (newPassword.length < MIN_PASSWORD_LEN) {
      setPasswordError(`At least ${MIN_PASSWORD_LEN} characters.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Those don't match.");
      return;
    }
    setBusy(true);
    const { error: err } = await setPassword(newPassword);
    setBusy(false);
    if (err) setPasswordError(err);
    else navigation.goBack();
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <Text style={[type.quietDisplay, { fontSize: 26 }]}>Sign in</Text>
          <Pressable onPress={() => navigation.goBack()}>
            <Text style={styles.close}>Close</Text>
          </Pressable>
        </View>

        <View style={styles.content}>
          {step === 'email' && (
            <Card style={{ gap: space.md }}>
              <Text style={type.h2}>Back up this card</Text>
              <Segmented
                options={[
                  { value: 'code', label: 'Code' },
                  { value: 'password', label: 'Password' },
                ]}
                value={mode}
                onChange={(v) => {
                  setMode(v);
                  setError(null);
                }}
              />
              <Text style={styles.hint}>
                {mode === 'code'
                  ? "We'll email you a one-time code. Your card stays local either way; this just adds a copy in the cloud."
                  : 'Only works once you\'ve set a password (offered right after signing in with a code, or anytime in Settings).'}
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
              {mode === 'password' && (
                <TextInput
                  value={password}
                  onChangeText={setPasswordField}
                  placeholder="Password"
                  placeholderTextColor={colors.inkFaint}
                  secureTextEntry
                  textContentType="password"
                  style={styles.input}
                />
              )}
              {error && <Text style={styles.error}>{error}</Text>}
              {mode === 'code' ? (
                <PrimaryButton
                  label={busy ? 'Sending…' : cooldown > 0 ? `Resend in ${cooldown}s` : 'Send code'}
                  onPress={handleSendCode}
                  disabled={!emailValid || busy || cooldown > 0}
                />
              ) : (
                <>
                  <PrimaryButton
                    label={busy ? 'Signing in…' : 'Sign in'}
                    onPress={handlePasswordSignIn}
                    disabled={!emailValid || !password || busy}
                  />
                  <GhostButton
                    label="Forgot password?"
                    onPress={() => {
                      setError(null);
                      setStep('forgot');
                    }}
                    disabled={busy}
                  />
                </>
              )}
            </Card>
          )}

          {step === 'forgot' && (
            <Card style={{ gap: space.md }}>
              <Text style={type.h2}>Reset your password</Text>
              <Text style={styles.hint}>If there's an account with this email, we'll send a reset code.</Text>
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
              <PrimaryButton
                label={busy ? 'Sending…' : cooldown > 0 ? `Resend in ${cooldown}s` : 'Send reset code'}
                onPress={handleSendRecoveryCode}
                disabled={!emailValid || busy || cooldown > 0}
              />
              <GhostButton label="Back" onPress={() => setStep('email')} disabled={busy} />
            </Card>
          )}

          {step === 'code' && (
            <Card style={{ gap: space.md }}>
              <Text style={type.h2}>Check your email</Text>
              <Text style={styles.hint}>
                Enter the {via === 'recovery' ? 'reset ' : ''}code sent to {email}.
              </Text>
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

          {step === 'setPassword' && (
            <Card style={{ gap: space.md }}>
              <Text style={type.h2}>{via === 'recovery' ? 'Set a new password' : 'Set a password?'}</Text>
              <Text style={styles.hint}>
                {via === 'recovery'
                  ? 'Choose a new password to finish resetting.'
                  : 'Skip the code next time you sign in. Optional. You can always do this later in Settings.'}
              </Text>
              <TextInput
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="New password"
                placeholderTextColor={colors.inkFaint}
                secureTextEntry
                textContentType="newPassword"
                style={styles.input}
              />
              <TextInput
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Confirm password"
                placeholderTextColor={colors.inkFaint}
                secureTextEntry
                textContentType="newPassword"
                style={styles.input}
              />
              {passwordError && <Text style={styles.error}>{passwordError}</Text>}
              <PrimaryButton label={busy ? 'Saving…' : 'Save'} onPress={handleSavePassword} disabled={busy} />
              {via !== 'recovery' && <GhostButton label="Skip" onPress={() => navigation.goBack()} disabled={busy} />}
            </Card>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paperQuiet },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    marginBottom: space.lg,
  },
  close: { color: colors.inkQuietFaint, fontFamily: 'Manrope_700Bold', fontSize: 13 },
  content: { paddingHorizontal: space.lg },
  hint: { fontFamily: 'Manrope_500Medium', fontSize: 11, lineHeight: 16, color: colors.inkFaint },
  input: {
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.lineQuiet,
    paddingHorizontal: space.md,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: 'Manrope_700Bold',
    color: colors.ink,
  },
  codeInput: { textAlign: 'center', fontSize: 22, letterSpacing: 8, fontFamily: 'Manrope_800ExtraBold' },
  error: { color: colors.danger, fontSize: 13, fontWeight: '600' },
});
