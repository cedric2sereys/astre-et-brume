import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { I18n, TKey } from '../core/i18n';
import { SessionService, passwordProblem } from '../core/session.service';

type Mode = 'signin' | 'signup' | 'forgot';

@Component({
  selector: 'app-auth-page',
  imports: [FormsModule],
  template: `
    <p class="intro">{{ i18n.t('auth.intro') }}</p>

    <section class="card">
      <p class="eyebrow">{{ i18n.t('auth.eyebrow') }}</p>
      <h1 class="title">{{ i18n.t(key('title')) }}</h1>

      @if (resetSent()) {
        <p class="lead">
          {{ i18n.t('auth.resetSent.before') }} <strong>{{ email.trim() }}</strong>{{ i18n.t('auth.resetSent.after') }}
        </p>
        <button class="btn btn-outline" type="button" (click)="setMode('signin')">
          {{ i18n.t('auth.backToSignin') }}
        </button>
      } @else {
        <p class="lead">{{ i18n.t(key('lead')) }}</p>

        <form (ngSubmit)="submit()" novalidate>
          <!-- Side by side on wide screens, stacked on phones -->
          <div class="creds" [class.single]="mode() === 'forgot'">
            <label class="field">
              <span class="field-label">{{ i18n.t('auth.email') }}</span>
              <input
                class="input"
                type="email"
                name="email"
                autocomplete="email"
                [placeholder]="i18n.t('auth.emailPlaceholder')"
                [(ngModel)]="email"
              />
            </label>
            @if (mode() !== 'forgot') {
              <label class="field">
                <span class="field-label">{{ i18n.t('auth.password') }}</span>
                <input
                  class="input"
                  type="password"
                  name="password"
                  [autocomplete]="mode() === 'signin' ? 'current-password' : 'new-password'"
                  placeholder="••••••••"
                  [(ngModel)]="password"
                />
              </label>
            }
          </div>
          @if (mode() === 'signin') {
            <p class="forgot">
              <button class="link" type="button" (click)="setMode('forgot')">
                {{ i18n.t('auth.forgotLink') }}
              </button>
            </p>
          }

          @if (error(); as error) {
            <p class="error" role="alert">{{ i18n.t(error) }}</p>
          }

          <button class="btn btn-gold" type="submit" [disabled]="loading()">
            {{ loading() ? i18n.t('common.wait') : i18n.t(key('submit')) }}
          </button>
        </form>

        <p class="switch">
          @if (mode() === 'signin') {
            <button class="link link-mono" type="button" (click)="setMode('signup')">
              {{ i18n.t('auth.toSignup') }}
            </button>
          } @else {
            <button class="link link-mono" type="button" (click)="setMode('signin')">
              {{ i18n.t(mode() === 'signup' ? 'auth.toSignin' : 'auth.backToSignin') }}
            </button>
          }
        </p>
      }
    </section>
  `,
  styles: `
    :host {
      flex: 1;
      display: grid;
      place-items: center;
      align-content: center;
      gap: 2rem;
      padding-bottom: 6vh;
    }
    .intro {
      width: min(100%, 628px);
      margin: 0;
      text-align: center;
      font-family: var(--font-display);
      font-style: italic;
      font-size: clamp(1.3rem, 2.6vw, 1.6rem);
      line-height: 1.45;
      color: var(--gold-soft);
      text-wrap: balance;
    }
    .card { width: min(100%, 628px); }
    .btn { margin-top: 1.1rem; }
    .forgot { margin: -0.4rem 0 0.4rem; text-align: right; font-size: 0.95rem; }
    .switch { text-align: center; margin: 1.8rem 0 0; }
    strong { color: var(--gold-soft); font-weight: 500; }

    /* Computers: wider and more compact, so the whole form fits without scrolling
       on a typical laptop window (~650 px of visible height). Phones keep the layout above. */
    @media (min-width: 900px) {
      :host { gap: 1rem; padding-bottom: 0; }
      .intro, .card { width: min(100%, 760px); }
      .intro { font-size: 1.55rem; }
      .card { padding: 1.9rem 2.8rem 1.6rem; }
      .card .eyebrow { margin-bottom: 0.5rem; }
      .card .title { margin-bottom: 0.5rem; }
      .card .lead { margin-bottom: 1.2rem; }
      .creds { display: grid; grid-template-columns: 1fr 1fr; gap: 1.2rem; }
      .creds.single { grid-template-columns: 1fr; }
      .creds .field { margin-bottom: 0.6rem; }
      .forgot { margin: 0 0 0.2rem; }
      .btn { margin-top: 0.6rem; }
      .switch { margin-top: 1.1rem; }
    }
  `,
})
export class AuthPage {
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  protected readonly i18n = inject(I18n);

  readonly mode = signal<Mode>('signin');
  readonly error = signal<TKey | null>(null);
  readonly loading = signal(false);
  readonly resetSent = signal(false);
  email = '';
  password = '';

  /** Text key for the current mode, e.g. key('title') → 'auth.signup.title'. */
  key(part: 'title' | 'lead' | 'submit'): TKey {
    return `auth.${this.mode()}.${part}` as TKey;
  }

  setMode(mode: Mode): void {
    this.mode.set(mode);
    this.error.set(null);
    this.resetSent.set(false);
  }

  async submit(): Promise<void> {
    if (this.loading()) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email.trim())) {
      this.error.set('auth.err.email');
      return;
    }
    // New accounts must follow the password rule. Sign-in only needs a password: older
    // accounts may still have one created under the previous, weaker rule.
    const problem = this.mode() === 'signup' ? passwordProblem(this.password) : null;
    if (problem) {
      this.error.set(problem);
      return;
    }
    if (this.mode() === 'signin' && !this.password) {
      this.error.set('auth.err.password');
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    const mode = this.mode();
    const error =
      mode === 'forgot'
        ? await this.session.requestPasswordReset(this.email)
        : mode === 'signin'
          ? await this.session.signIn(this.email, this.password)
          : await this.session.signUp(this.email, this.password);
    this.loading.set(false);

    if (error) this.error.set(error);
    else if (mode === 'forgot') this.resetSent.set(true);
    else this.router.navigateByUrl('/pseudo');
  }
}
