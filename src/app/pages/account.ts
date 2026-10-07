import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { I18n, TKey } from '../core/i18n';
import { SessionService } from '../core/session.service';

@Component({
  selector: 'app-account-page',
  imports: [FormsModule],
  template: `
    <section class="wrap">
      <p class="eyebrow">{{ i18n.t('account.eyebrow') }}</p>
      <h1 class="title">{{ session.pseudo() ?? i18n.t('account.titleFallback') }}</h1>
      <p class="lead">{{ i18n.t('account.signedInAs') }} <strong>{{ session.email() }}</strong></p>

      <button class="link back" type="button" (click)="back()">{{ i18n.t('account.back') }}</button>

      <div class="card danger">
        <h2>{{ i18n.t('account.delete.title') }}</h2>
        <p>
          {{ i18n.t('account.delete.before') }}
          <strong>{{ i18n.t('account.delete.strong') }}</strong>{{ i18n.t('account.delete.after') }}
        </p>
        <form (ngSubmit)="deleteAccount()" novalidate>
          <label class="field">
            <span class="field-label">{{ i18n.t('account.delete.confirmLabel', { word: confirmWord() }) }}</span>
            <input class="input" name="confirm" autocomplete="off" [placeholder]="confirmWord()"
              [(ngModel)]="typed" />
          </label>
          @if (error(); as error) {
            <p class="error" role="alert">{{ i18n.t(error) }}</p>
          }
          <button class="btn btn-danger" type="submit" [disabled]="!confirmed() || deleting()">
            {{ i18n.t(deleting() ? 'account.delete.deleting' : 'account.delete.submit') }}
          </button>
        </form>
      </div>
    </section>
  `,
  styles: `
    :host { display: block; }
    .wrap { width: min(100%, 680px); margin: 4vh auto 0; }
    .lead { margin-bottom: 1rem; }
    strong { color: var(--gold-soft); font-weight: 500; }
    .back { margin-bottom: 2rem; }
    .danger { border-color: rgba(227, 155, 139, 0.35); padding: 2rem; }
    .danger h2 { font-family: var(--font-display); font-weight: 500; font-size: 1.6rem; margin: 0 0 0.8rem; }
    .danger p { color: var(--muted); line-height: 1.7; margin: 0 0 1.4rem; }
    .danger strong { color: #e39b8b; }
    .btn-danger {
      background: transparent;
      color: #e39b8b;
      border-color: rgba(227, 155, 139, 0.6);
      &:hover:not(:disabled) { background: rgba(227, 155, 139, 0.1); }
    }
  `,
})
export class AccountPage {
  protected readonly session = inject(SessionService);
  private readonly router = inject(Router);

  protected readonly i18n = inject(I18n);

  /** SUPPRIMER in French, DELETE in English. */
  readonly confirmWord = () => this.i18n.t('account.delete.word');
  readonly deleting = signal(false);
  readonly error = signal<TKey | null>(null);
  typed = '';

  confirmed(): boolean {
    return this.typed.trim().toUpperCase() === this.confirmWord();
  }

  async deleteAccount(): Promise<void> {
    if (!this.confirmed() || this.deleting()) return;
    this.deleting.set(true);
    this.error.set(null);
    const error = await this.session.deleteAccount();
    this.deleting.set(false);
    if (error) this.error.set(error);
    else this.router.navigateByUrl('/connexion');
  }

  back(): void {
    this.router.navigateByUrl('/conversation'); // the guards route to the first missing step
  }
}
