import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { I18n, TKey } from '../core/i18n';
import { SessionService, passwordProblem } from '../core/session.service';

/**
 * Reached from the "forgot password" email. The link signs the user in (supabase-js reads the
 * token in the URL when the app starts); this page then lets them choose a new password.
 */
@Component({
  selector: 'app-new-password-page',
  imports: [FormsModule],
  template: `
    <section class="card">
      <p class="eyebrow">{{ i18n.t('auth.eyebrow') }}</p>
      <h1 class="title">{{ i18n.t('newPassword.title') }}</h1>

      @if (checking()) {
        <p class="lead">{{ i18n.t('common.wait') }}</p>
      } @else if (!session.isLoggedIn()) {
        <p class="lead">{{ i18n.t('newPassword.invalid') }}</p>
        <button class="btn btn-outline" type="button" (click)="toLogin()">
          {{ i18n.t('auth.backToSignin') }}
        </button>
      } @else {
        <p class="lead">{{ i18n.t('newPassword.lead') }}</p>
        <form (ngSubmit)="submit()" novalidate>
          <label class="field">
            <span class="field-label">{{ i18n.t('newPassword.password') }}</span>
            <input class="input" type="password" name="password" autocomplete="new-password"
              placeholder="••••••••" [(ngModel)]="password" />
          </label>
          <label class="field">
            <span class="field-label">{{ i18n.t('newPassword.confirm') }}</span>
            <input class="input" type="password" name="confirm" autocomplete="new-password"
              placeholder="••••••••" [(ngModel)]="confirm" />
          </label>

          @if (error(); as error) {
            <p class="error" role="alert">{{ i18n.t(error) }}</p>
          }
          <button class="btn btn-gold" type="submit" [disabled]="saving()">
            {{ i18n.t(saving() ? 'common.wait' : 'newPassword.submit') }}
          </button>
        </form>
      }
    </section>
  `,
  styles: `
    :host { flex: 1; display: grid; place-items: center; padding-bottom: 6vh; }
    .card { width: min(100%, 628px); }
    .btn { margin-top: 1.1rem; }
  `,
})
export class NewPasswordPage {
  protected readonly session = inject(SessionService);
  private readonly router = inject(Router);

  protected readonly i18n = inject(I18n);
  readonly checking = signal(true);
  readonly saving = signal(false);
  readonly error = signal<TKey | null>(null);
  password = '';
  confirm = '';

  constructor() {
    this.session.ready.then(() => this.checking.set(false));
  }

  async submit(): Promise<void> {
    if (this.saving()) return;
    const problem = passwordProblem(this.password);
    if (problem) {
      this.error.set(problem);
      return;
    }
    if (this.password !== this.confirm) {
      this.error.set('pw.mismatch');
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    const error = await this.session.updatePassword(this.password);
    this.saving.set(false);
    if (error) this.error.set(error);
    else this.router.navigateByUrl('/conversation'); // the guards route to the first missing step
  }

  toLogin(): void {
    this.router.navigateByUrl('/connexion');
  }
}
