import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SessionService } from '../core/session.service';

const CONFIRM_WORD = 'SUPPRIMER';

@Component({
  selector: 'app-account-page',
  imports: [FormsModule],
  template: `
    <section class="wrap">
      <p class="eyebrow">Mon compte</p>
      <h1 class="title">{{ session.pseudo() ?? 'Votre compte' }}</h1>
      <p class="lead">Connecté avec <strong>{{ session.email() }}</strong></p>

      <button class="link back" type="button" (click)="back()">← Retour à l'atelier</button>

      <div class="card danger">
        <h2>Supprimer mon compte</h2>
        <p>
          Cette action est <strong>définitive</strong>. Elle efface votre compte et toutes vos
          données : pseudo, date, heure et lieu de naissance, conversations, messages et calculs
          astrologiques enregistrés. Rien ne pourra être récupéré.
        </p>
        <form (ngSubmit)="deleteAccount()" novalidate>
          <label class="field">
            <span class="field-label">Pour confirmer, tapez {{ confirmWord }}</span>
            <input class="input" name="confirm" autocomplete="off" [placeholder]="confirmWord"
              [(ngModel)]="typed" />
          </label>
          @if (error()) {
            <p class="error" role="alert">{{ error() }}</p>
          }
          <button class="btn btn-danger" type="submit" [disabled]="typed.trim() !== confirmWord || deleting()">
            {{ deleting() ? 'Suppression…' : 'Supprimer définitivement mon compte' }}
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

  readonly confirmWord = CONFIRM_WORD;
  readonly deleting = signal(false);
  readonly error = signal<string | null>(null);
  typed = '';

  async deleteAccount(): Promise<void> {
    if (this.typed.trim() !== CONFIRM_WORD || this.deleting()) return;
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
