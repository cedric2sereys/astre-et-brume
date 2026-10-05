import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SessionService } from '../core/session.service';

@Component({
  selector: 'app-auth-page',
  imports: [FormsModule],
  template: `
    <section class="card">
      <p class="eyebrow">Entrée de l'atelier</p>
      <h1 class="title">{{ mode() === 'signin' ? 'Connexion' : 'Créer un compte' }}</h1>
      <p class="lead">
        @if (mode() === 'signin') {
          Entrez votre email et votre mot de passe pour accéder à l'atelier.
        } @else {
          Choisissez un email et un mot de passe pour ouvrir votre atelier.
        }
      </p>

      <form (ngSubmit)="submit()" novalidate>
        <label class="field">
          <span class="field-label">Email</span>
          <input
            class="input"
            type="email"
            name="email"
            autocomplete="email"
            placeholder="vous@exemple.fr"
            [(ngModel)]="email"
          />
        </label>
        <label class="field">
          <span class="field-label">Mot de passe</span>
          <input
            class="input"
            type="password"
            name="password"
            [autocomplete]="mode() === 'signin' ? 'current-password' : 'new-password'"
            placeholder="••••••••"
            [(ngModel)]="password"
          />
        </label>

        @if (error()) {
          <p class="error" role="alert">{{ error() }}</p>
        }

        <button class="btn btn-gold" type="submit" [disabled]="loading()">
          @if (loading()) {
            Un instant…
          } @else {
            {{ mode() === 'signin' ? "Entrer dans l'atelier" : 'Créer mon compte' }}
          }
        </button>
      </form>

      <p class="switch">
        <button class="link link-mono" type="button" (click)="toggleMode()">
          {{ mode() === 'signin' ? 'Pas encore de compte ? En créer un' : 'Déjà un compte ? Se connecter' }}
        </button>
      </p>
    </section>
  `,
  styles: `
    :host { flex: 1; display: grid; place-items: center; padding-bottom: 6vh; }
    .card { width: min(100%, 628px); }
    .btn { margin-top: 1.1rem; }
    .switch { text-align: center; margin: 1.8rem 0 0; }
  `,
})
export class AuthPage {
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);

  readonly mode = signal<'signin' | 'signup'>('signin');
  readonly error = signal<string | null>(null);
  readonly loading = signal(false);
  email = '';
  password = '';

  toggleMode(): void {
    this.mode.update((m) => (m === 'signin' ? 'signup' : 'signin'));
    this.error.set(null);
  }

  async submit(): Promise<void> {
    if (this.loading()) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email.trim())) {
      this.error.set('Veuillez saisir une adresse email valide.');
      return;
    }
    if (this.password.length < 6) {
      this.error.set('Le mot de passe doit contenir au moins 6 caractères.');
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    const error =
      this.mode() === 'signin'
        ? await this.session.signIn(this.email, this.password)
        : await this.session.signUp(this.email, this.password);
    this.loading.set(false);

    if (error) this.error.set(error);
    else this.router.navigateByUrl('/pseudo');
  }
}
