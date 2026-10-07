import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MIN_PASSWORD_LENGTH, SessionService } from '../core/session.service';

/**
 * Reached from the "forgot password" email. The link signs the user in (supabase-js reads the
 * token in the URL when the app starts); this page then lets them choose a new password.
 */
@Component({
  selector: 'app-new-password-page',
  imports: [FormsModule],
  template: `
    <section class="card">
      <p class="eyebrow">Entrée de l'atelier</p>
      <h1 class="title">Nouveau mot de passe</h1>

      @if (checking()) {
        <p class="lead">Un instant…</p>
      } @else if (!session.isLoggedIn()) {
        <p class="lead">
          Ce lien n'est plus valide : il a peut-être expiré ou déjà servi. Demandez-en un nouveau
          depuis la page de connexion.
        </p>
        <button class="btn btn-outline" type="button" (click)="toLogin()">Retour à la connexion</button>
      } @else {
        <p class="lead">Choisissez votre nouveau mot de passe ({{ minLength }} caractères au minimum).</p>
        <form (ngSubmit)="submit()" novalidate>
          <label class="field">
            <span class="field-label">Nouveau mot de passe</span>
            <input class="input" type="password" name="password" autocomplete="new-password"
              placeholder="••••••••" [(ngModel)]="password" />
          </label>
          <label class="field">
            <span class="field-label">Confirmez-le</span>
            <input class="input" type="password" name="confirm" autocomplete="new-password"
              placeholder="••••••••" [(ngModel)]="confirm" />
          </label>

          @if (error()) {
            <p class="error" role="alert">{{ error() }}</p>
          }
          <button class="btn btn-gold" type="submit" [disabled]="saving()">
            {{ saving() ? 'Un instant…' : 'Enregistrer et entrer' }}
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

  readonly minLength = MIN_PASSWORD_LENGTH;
  readonly checking = signal(true);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  password = '';
  confirm = '';

  constructor() {
    this.session.ready.then(() => this.checking.set(false));
  }

  async submit(): Promise<void> {
    if (this.saving()) return;
    if (this.password.length < MIN_PASSWORD_LENGTH) {
      this.error.set(`Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.`);
      return;
    }
    if (this.password !== this.confirm) {
      this.error.set('Les deux mots de passe ne sont pas identiques.');
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
