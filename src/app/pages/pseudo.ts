import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { I18n, TKey } from '../core/i18n';
import { SessionService } from '../core/session.service';

@Component({
  selector: 'app-pseudo-page',
  imports: [FormsModule],
  template: `
    <section class="card">
      <p class="eyebrow">{{ i18n.t('pseudo.eyebrow') }}</p>
      <h1 class="title">{{ i18n.t('pseudo.title') }}</h1>
      <p class="lead">{{ i18n.t('pseudo.lead') }}</p>

      <form (ngSubmit)="submit()">
        <input
          class="input"
          name="pseudo"
          [placeholder]="i18n.t('pseudo.placeholder')"
          maxlength="32"
          autocomplete="nickname"
          autofocus
          [(ngModel)]="pseudo"
        />
        @if (error(); as error) {
          <p class="error submit-error" role="alert">{{ i18n.t(error) }}</p>
        }
        <button class="btn btn-gold" type="submit" [disabled]="!pseudo.trim() || saving()">
          {{ i18n.t(saving() ? 'common.wait' : 'common.continue') }}
        </button>
      </form>
    </section>
  `,
  styles: `
    :host { flex: 1; display: grid; place-items: center; padding-bottom: 6vh; }
    .card { width: min(100%, 628px); }
    .lead { margin-bottom: 1.6rem; }
    .input { border-color: var(--gold-dim); }
    .btn { margin-top: 1.4rem; }
    .submit-error { margin: 1rem 0 -0.4rem; }
  `,
})
export class PseudoPage {
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  protected readonly i18n = inject(I18n);

  readonly saving = signal(false);
  readonly error = signal<TKey | null>(null);
  pseudo = this.session.pseudo() ?? '';

  async submit(): Promise<void> {
    if (!this.pseudo.trim() || this.saving()) return;
    this.saving.set(true);
    this.error.set(null);
    const error = await this.session.setPseudo(this.pseudo);
    this.saving.set(false);
    if (error) this.error.set(error);
    else this.router.navigateByUrl('/releve');
  }
}
