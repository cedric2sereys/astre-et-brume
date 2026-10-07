import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Header } from './layout/header';
import { Starfield } from './layout/starfield';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Header, Starfield],
  template: `
    <app-starfield />
    <div class="shell">
      <app-header />
      <main><router-outlet /></main>
    </div>
  `,
  styles: `
    .shell {
      position: relative;
      z-index: 1;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    main {
      flex: 1;
      display: flex;
      flex-direction: column;
      padding: 0 1rem 1rem;
    }
  `,
})
export class App {}
