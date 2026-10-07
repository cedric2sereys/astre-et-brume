import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SessionService } from '../core/session.service';

type Mode = 'signin' | 'signup' | 'forgot';

const TEXTS: Record<Mode, { title: string; lead: string; submit: string }> = {
  signin: {
    title: 'Connexion',
    lead: "Entrez votre email et votre mot de passe pour accéder à l'atelier.",
    submit: "Entrer dans l'atelier",
  },
  signup: {
    title: 'Créer un compte',
    lead: 'Choisissez un email et un mot de passe pour ouvrir votre atelier.',
    submit: 'Créer mon compte',
  },
  forgot: {
    title: 'Mot de passe oublié',
    lead: 'Entrez votre email : nous vous enverrons un lien pour choisir un nouveau mot de passe.',
    submit: 'Envoyer le lien',
  },
};

@Component({
  selector: 'app-auth-page',
  imports: [FormsModule],
  template: `
    <p class="intro">
      Votre compagnon astrologique conversationnel pour une expérience consultative personnalisée,
      active et durable dans le temps.
    </p>

    <section class="card">
      <p class="eyebrow">Entrée de l'atelier</p>
      <h1 class="title">{{ texts().title }}</h1>

      @if (resetSent()) {
        <p class="lead">
          Si un compte existe pour <strong>{{ email.trim() }}</strong>, un email vient de partir avec
          un lien pour choisir un nouveau mot de passe. Pensez à regarder dans les indésirables.
        </p>
        <button class="btn btn-outline" type="button" (click)="setMode('signin')">Retour à la connexion</button>
      } @else {
        <p class="lead">{{ texts().lead }}</p>

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
          @if (mode() !== 'forgot') {
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
          }
          @if (mode() === 'signin') {
            <p class="forgot">
              <button class="link" type="button" (click)="setMode('forgot')">Mot de passe oublié ?</button>
            </p>
          }

          @if (error()) {
            <p class="error" role="alert">{{ error() }}</p>
          }

          <button class="btn btn-gold" type="submit" [disabled]="loading()">
            {{ loading() ? 'Un instant…' : texts().submit }}
          </button>
        </form>

        <p class="switch">
          @if (mode() === 'signin') {
            <button class="link link-mono" type="button" (click)="setMode('signup')">
              Pas encore de compte ? En créer un
            </button>
          } @else {
            <button class="link link-mono" type="button" (click)="setMode('signin')">
              {{ mode() === 'signup' ? 'Déjà un compte ? Se connecter' : 'Retour à la connexion' }}
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
  `,
})
export class AuthPage {
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);

  readonly mode = signal<Mode>('signin');
  readonly texts = computed(() => TEXTS[this.mode()]);
  readonly error = signal<string | null>(null);
  readonly loading = signal(false);
  readonly resetSent = signal(false);
  email = '';
  password = '';

  setMode(mode: Mode): void {
    this.mode.set(mode);
    this.error.set(null);
    this.resetSent.set(false);
  }

  async submit(): Promise<void> {
    if (this.loading()) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email.trim())) {
      this.error.set('Veuillez saisir une adresse email valide.');
      return;
    }
    if (this.mode() !== 'forgot' && this.password.length < 6) {
      this.error.set('Le mot de passe doit contenir au moins 6 caractères.');
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
