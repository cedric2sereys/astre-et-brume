import { Injectable, computed, signal } from '@angular/core';
import { AuthError } from '@supabase/supabase-js';
import { MIN_PASSWORD_LENGTH, TKey } from './i18n';
import { supabase } from './supabase';

export interface BirthChart {
  date: string; // yyyy-mm-dd
  time: string; // HH:mm, 24h (00:00 = midnight)
  place: string; // label chosen from the OpenStreetMap results
  latitude: number;
  longitude: number;
  timezone: string; // IANA name, e.g. Europe/Paris
  houseSystem: HouseSystem;
}

export const HOUSE_SYSTEMS = ['placidus', 'koch', 'whole_sign', 'equal'] as const;
export type HouseSystem = (typeof HOUSE_SYSTEMS)[number];

/** Local birth date-time in ISO 8601 (no offset: the offset comes from `timezone`). */
export function birthDateTimeIso(chart: BirthChart): string {
  return `${chart.date}T${chart.time}:00`;
}

/**
 * What's wrong with a new password, or null if it follows the rule. Must match Supabase →
 * Authentication → Email: "Minimum password length" = 8 and "Password requirements" = letters
 * and digits. Supabase enforces it; this only gives a clear message before sending.
 */
export function passwordProblem(password: string): TKey | null {
  if (password.length < MIN_PASSWORD_LENGTH) return 'pw.tooShort';
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return 'pw.lettersDigits';
  return null;
}

/** Turns Supabase auth errors into a message key for the user. */
function authErrorMessage(error: AuthError): TKey {
  switch (error.code) {
    case 'invalid_credentials':
      return 'authErr.invalidCredentials';
    case 'user_already_exists':
    case 'email_exists':
      return 'authErr.exists';
    case 'weak_password':
      return 'authErr.weak';
    case 'same_password':
      return 'authErr.same';
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return 'authErr.rateLimit';
    default:
      return 'authErr.generic';
  }
}

interface ProfileRow {
  pseudo: string;
  birth_date: string | null;
  birth_time: string | null; // "HH:MM:SS" from Postgres
  birth_place: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
  house_system: HouseSystem | null;
}

const SAVE_ERROR: TKey = 'save.failed';

/**
 * Holds the signed-in user (Supabase Auth) and their profile (public.profiles):
 * nickname and birth data are loaded after login and saved as soon as they are entered.
 */
@Injectable({ providedIn: 'root' })
export class SessionService {
  readonly userId = signal<string | null>(null);
  readonly email = signal<string | null>(null);
  readonly pseudo = signal<string | null>(null);
  readonly chart = signal<BirthChart | null>(null);

  readonly isLoggedIn = computed(() => this.userId() !== null);

  /** Resolves once the stored Supabase session and its profile have been restored. Guards wait on it. */
  readonly ready: Promise<void>;

  constructor() {
    this.ready = supabase.auth.getSession().then(async ({ data }) => {
      if (data.session) await this.startSession(data.session.user.id, data.session.user.email);
    });
    // Signed out elsewhere (other tab, expired session).
    supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') this.clear();
    });
  }

  /** Returns an error message, or null on success. */
  async signIn(email: string, password: string): Promise<TKey | null> {
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) return authErrorMessage(error);
    await this.startSession(data.user.id, data.user.email);
    return null;
  }

  /** Returns an error message, or null on success. */
  async signUp(email: string, password: string): Promise<TKey | null> {
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
    if (error) return authErrorMessage(error);
    // Email confirmation is off on this project, so sign-up returns a session right away.
    if (!data.session || !data.user) return 'authErr.confirmEmail';
    await this.startSession(data.user.id, data.user.email);
    return null;
  }

  async signOut(): Promise<void> {
    await supabase.auth.signOut();
    this.clear();
  }

  /**
   * Emails a link to /nouveau-mot-de-passe. Returns an error message, or null.
   * Succeeds even for unknown emails, so the form doesn't reveal who has an account.
   */
  async requestPasswordReset(email: string): Promise<TKey | null> {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/nouveau-mot-de-passe`,
    });
    return error ? authErrorMessage(error) : null;
  }

  /**
   * Permanently deletes the signed-in user's account and all their data (see migration 004),
   * then signs out locally. Returns an error message, or null.
   */
  async deleteAccount(): Promise<TKey | null> {
    const { error } = await supabase.rpc('delete_my_account');
    if (error) {
      console.error('Deleting account failed', error);
      return 'account.delete.failed';
    }
    // The session no longer exists on the server: just forget it in this browser.
    await supabase.auth.signOut({ scope: 'local' });
    this.clear();
    return null;
  }

  /** Sets a new password for the signed-in user (reached from the reset link). */
  async updatePassword(password: string): Promise<TKey | null> {
    const { error } = await supabase.auth.updateUser({ password });
    return error ? authErrorMessage(error) : null;
  }

  /** Saves the nickname (creates the profile on first visit). Returns an error message, or null. */
  async setPseudo(pseudo: string): Promise<TKey | null> {
    const id = this.userId();
    if (!id) return SAVE_ERROR;
    const { error } = await supabase
      .from('profiles')
      .upsert({ id, pseudo: pseudo.trim() }, { onConflict: 'id' });
    if (error) {
      console.error('Saving pseudo failed', error);
      return SAVE_ERROR;
    }
    this.pseudo.set(pseudo.trim());
    return null;
  }

  /** Saves the birth data on the profile. Returns an error message, or null. */
  async saveChart(chart: BirthChart): Promise<TKey | null> {
    const id = this.userId();
    if (!id) return SAVE_ERROR;
    const { error } = await supabase
      .from('profiles')
      .update({
        birth_date: chart.date,
        birth_time: chart.time,
        birth_place: chart.place,
        latitude: chart.latitude,
        longitude: chart.longitude,
        timezone: chart.timezone,
        house_system: chart.houseSystem,
      })
      .eq('id', id);
    if (error) {
      console.error('Saving birth chart failed', error);
      return SAVE_ERROR;
    }
    this.chart.set(chart);
    return null;
  }

  private async startSession(userId: string, email: string | undefined): Promise<void> {
    this.userId.set(userId);
    this.email.set(email ?? null);
    await this.loadProfile(userId);
  }

  private async loadProfile(userId: string): Promise<void> {
    const { data, error } = await supabase
      .from('profiles')
      .select('pseudo, birth_date, birth_time, birth_place, latitude, longitude, timezone, house_system')
      .eq('id', userId)
      .maybeSingle<ProfileRow>();
    if (error) {
      console.error('Loading profile failed', error);
      return;
    }
    this.pseudo.set(data?.pseudo ?? null);
    const complete =
      data?.birth_date && data.birth_time && data.birth_place && data.latitude != null &&
      data.longitude != null && data.timezone && data.house_system;
    this.chart.set(
      complete
        ? {
            date: data.birth_date!,
            time: data.birth_time!.slice(0, 5),
            place: data.birth_place!,
            latitude: data.latitude!,
            longitude: data.longitude!,
            timezone: data.timezone!,
            houseSystem: data.house_system!,
          }
        : null,
    );
  }

  private clear(): void {
    this.userId.set(null);
    this.email.set(null);
    this.pseudo.set(null);
    this.chart.set(null);
  }
}
