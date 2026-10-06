import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { SessionService } from '../core/session.service';

@Component({
  selector: 'app-header',
  template: `
    <header>
      <div class="brand">
        <span class="logo" aria-hidden="true"><span class="dot"></span></span>
        <div>
          <div class="name">Astre &amp; Brume</div>
          <div class="tagline">Atelier céleste</div>
        </div>
      </div>
      <nav class="meta">
        <span class="credit">Ciel du jour · FreeAstroAPI</span>
        @if (session.isLoggedIn()) {
          <button class="logout" type="button" (click)="account()">Mon compte</button>
          <button class="logout" type="button" (click)="signOut()">Déconnexion</button>
        }
      </nav>
    </header>
  `,
  styles: `
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      padding: 1.9rem 2.2rem;
      position: relative;
      z-index: 2;
    }
    .brand { display: flex; align-items: center; gap: 1.1rem; }
    .logo {
      width: 50px; height: 50px; flex: none;
      border: 1px solid var(--gold-dim);
      border-radius: 50%;
      display: grid; place-items: center;
    }
    .dot {
      width: 12px; height: 12px;
      border: 1.5px solid var(--gold);
      border-radius: 50%;
      display: grid; place-items: center;
    }
    .dot::after {
      content: ''; width: 3px; height: 3px;
      background: var(--gold); border-radius: 50%;
    }
    .name {
      font-family: var(--font-display);
      font-size: 1.65rem;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      line-height: 1.1;
    }
    .tagline {
      font-family: var(--font-mono);
      font-size: 0.78rem;
      letter-spacing: 0.35em;
      text-transform: uppercase;
      color: var(--muted);
      margin-top: 0.3rem;
    }
    .meta {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      align-items: center;
      gap: 0.8rem;
      font-family: var(--font-mono);
      font-size: 0.78rem;
      letter-spacing: 0.3em;
      text-transform: uppercase;
      color: var(--muted);
    }
    .credit { margin-right: 0.8rem; }
    .logout {
      background: none;
      border: 1px solid var(--border);
      border-radius: 999px;
      padding: 0.4rem 0.9rem;
      font: inherit;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      color: var(--muted);
      cursor: pointer;
      &:hover { color: var(--gold-soft); border-color: var(--gold-dim); }
    }
    @media (max-width: 640px) {
      header { padding: 1.2rem 1rem; }
      .credit { display: none; }
      .name { font-size: 1.3rem; }
      .meta { gap: 0.4rem; }
      .logout { letter-spacing: 0.1em; padding: 0.35rem 0.7rem; }
    }
  `,
})
export class Header {
  protected readonly session = inject(SessionService);
  private readonly router = inject(Router);

  account(): void {
    this.router.navigateByUrl('/compte');
  }

  async signOut(): Promise<void> {
    await this.session.signOut();
    this.router.navigateByUrl('/connexion');
  }
}
