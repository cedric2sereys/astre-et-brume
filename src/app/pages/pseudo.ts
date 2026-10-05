import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SessionService } from '../core/session.service';

@Component({
  selector: 'app-pseudo-page',
  imports: [FormsModule],
  template: `
    <section class="card">
      <p class="eyebrow">Première visite</p>
      <h1 class="title">Comment vous appeler ?</h1>
      <p class="lead">Choisissez un pseudo : l'agent s'adressera à vous ainsi.</p>

      <form (ngSubmit)="submit()">
        <input
          class="input"
          name="pseudo"
          placeholder="Votre pseudo"
          maxlength="32"
          autocomplete="nickname"
          autofocus
          [(ngModel)]="pseudo"
        />
        @if (error()) {
          <p class="error submit-error" role="alert">{{ error() }}</p>
        }
        <button class="btn btn-gold" type="submit" [disabled]="!pseudo.trim() || saving()">
          {{ saving() ? 'Un instant…' : 'Continuer' }}
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

  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
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
