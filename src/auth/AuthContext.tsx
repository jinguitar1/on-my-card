import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { supabase } from '../lib/supabaseClient';

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

interface AuthApi {
  status: AuthStatus;
  session: Session | null;
  /** Sends the one-time code. Auto-creates the account on first use. */
  sendCode: (email: string) => Promise<{ error: string | null }>;
  verifyCode: (email: string, code: string) => Promise<{ error: string | null }>;
  /** For a returning user who has already set a password — the code flow above
   *  remains the fallback if this fails or none has been set. */
  signInWithPassword: (email: string, password: string) => Promise<{ error: string | null }>;
  /** Sets/changes the password on the *current* session — call only while signed in. */
  setPassword: (password: string) => Promise<{ error: string | null }>;
  /** Forgot-password: sends a recovery code (reuses the OTP code UI, not a link —
   *  this app never handles deep-link redirects). Silent on an unknown email, by
   *  Supabase design, so this can't be used to probe which emails have accounts. */
  sendRecoveryCode: (email: string) => Promise<{ error: string | null }>;
  /** Verifying this signs the user in (a short-lived recovery session) — the caller
   *  should immediately prompt for a new password via `setPassword`. */
  verifyRecoveryCode: (email: string, code: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthApi | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');

  useEffect(() => {
    let alive = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSession(data.session);
      setStatus(data.session ? 'signedIn' : 'signedOut');
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setStatus(next ? 'signedIn' : 'signedOut');
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const sendCode = useCallback(async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim().toLowerCase() });
    return { error: error?.message ?? null };
  }, []);

  const verifyCode = useCallback(async (email: string, code: string) => {
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: code.trim(),
      type: 'email',
    });
    return { error: error?.message ?? null };
  }, []);

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    return { error: error?.message ?? null };
  }, []);

  const setPassword = useCallback(async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });
    return { error: error?.message ?? null };
  }, []);

  const sendRecoveryCode = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase());
    return { error: error?.message ?? null };
  }, []);

  const verifyRecoveryCode = useCallback(async (email: string, code: string) => {
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: code.trim(),
      type: 'recovery',
    });
    return { error: error?.message ?? null };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const api = useMemo<AuthApi>(
    () => ({
      status,
      session,
      sendCode,
      verifyCode,
      signInWithPassword,
      setPassword,
      sendRecoveryCode,
      verifyRecoveryCode,
      signOut,
    }),
    [status, session, sendCode, verifyCode, signInWithPassword, setPassword, sendRecoveryCode, verifyRecoveryCode, signOut]
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside <AuthProvider>');
  return v;
}
