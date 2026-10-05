import { Component, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SessionService } from '../core/session.service';
import { AgentError, AgentService } from '../core/agent.service';
import { ChatHistoryService } from '../core/chat-history.service';
import { MarkdownPipe } from '../core/markdown.pipe';

interface Message {
  from: 'agent' | 'user';
  text: string;
}

const GREETING =
  'Bonjour, comment puis-je t’aider ? Souhaites-tu que je te donne ton horoscope du jour personnalisé ?';

@Component({
  selector: 'app-conversation-page',
  imports: [FormsModule, MarkdownPipe],
  template: `
    <section class="wrap">
      <header class="card profile">
        <span class="avatar">{{ initial() }}</span>
        <div class="who">
          <div class="name">
            {{ session.pseudo() }} · {{ city() }}
          </div>
          @if (chart(); as c) {
            <div class="details">
              {{ formatDate(c.date) }} {{ c.time }} · {{ c.timezone }} · {{ c.houseSystem }}
            </div>
          }
        </div>
        <button class="pill" type="button" (click)="newChart()">Nouveau relevé</button>
      </header>

      <div class="messages" aria-live="polite">
        @for (m of messages(); track $index) {
          @if (m.from === 'agent') {
            <div class="bubble agent">
              <span class="eyebrow">L'agent</span>
              <div class="md" [innerHTML]="m.text | markdown"></div>
            </div>
          } @else {
            <div class="bubble user"><p>{{ m.text }}</p></div>
          }
        }
        @if (typing()) {
          <div class="bubble agent typing">
            <span class="eyebrow">L'agent</span>
            <p>Je suis en train de consulter les astres, un tout petit peu de patience…<span class="dots"><span></span><span></span><span></span></span></p>
          </div>
        }
        <div #end></div>
      </div>

      @if (error()) {
        <p class="error" role="alert">{{ error() }}</p>
      }
      <form class="composer" (ngSubmit)="send()">
        <textarea
          class="input"
          name="draft"
          rows="1"
          placeholder="Posez votre question aux astres…"
          [(ngModel)]="draft"
          (keydown.enter)="onEnter($event)"
        ></textarea>
        <button class="btn btn-gold" type="submit" [disabled]="!draft.trim() || typing()">Envoyer</button>
      </form>
    </section>
  `,
  styles: `
    :host { display: block; }
    .wrap {
      width: min(100%, 892px);
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      min-height: calc(100vh - 150px);
    }

    .profile {
      display: flex; align-items: center; gap: 1.3rem;
      padding: 1.1rem 1.4rem;
      border-radius: 14px;
    }
    .avatar {
      width: 56px; height: 56px; flex: none;
      border: 1px solid var(--gold-dim); border-radius: 50%;
      display: grid; place-items: center;
      font-family: var(--font-display); font-size: 1.5rem; color: var(--gold-soft);
      text-transform: uppercase;
    }
    .who { flex: 1; min-width: 0; }
    .name { font-size: 1.2rem; font-weight: 500; }
    .details {
      font-family: var(--font-mono); font-size: 0.85rem; color: var(--muted);
      margin-top: 0.2rem;
    }
    .pill {
      flex: none;
      background: transparent;
      border: 1px solid var(--gold-dim);
      border-radius: 999px;
      padding: 0.45rem 0.9rem;
      font-family: var(--font-mono); font-size: 0.78rem;
      letter-spacing: 0.15em; text-transform: uppercase;
      color: var(--gold-soft);
      cursor: pointer;
      &:hover { background: rgba(193, 160, 94, 0.08); }
    }

    .messages { flex: 1; display: flex; flex-direction: column; gap: 1.4rem; padding: 1.8rem 0; }
    .bubble { max-width: 80%; border-radius: 14px; }
    .bubble p { margin: 0; line-height: 1.75; white-space: pre-line; font-size: 1.1rem; }
    .agent {
      align-self: flex-start;
      background: var(--card-2);
      border: 1px solid var(--border);
      padding: 1.3rem 1.5rem;
    }
    .agent .eyebrow { display: block; font-size: 0.72rem; margin-bottom: 0.6rem; }
    .user {
      align-self: flex-end;
      background: var(--gold);
      color: #16140f;
      padding: 0.9rem 1.4rem;
    }

    .typing p { color: var(--muted); font-style: italic; }
    .dots { display: inline-flex; gap: 5px; margin-left: 0.5rem; vertical-align: middle; }
    .dots span {
      width: 7px; height: 7px; border-radius: 50%;
      background: var(--gold-soft);
      animation: blink 1.2s infinite ease-in-out;
    }
    .dots span:nth-child(2) { animation-delay: 0.2s; }
    .dots span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes blink { 0%, 80%, 100% { opacity: 0.2; } 40% { opacity: 1; } }

    .composer {
      position: sticky; bottom: 1rem;
      display: flex; gap: 0.8rem; align-items: flex-end;
      background: var(--card); border: 1px solid var(--border);
      border-radius: 14px; padding: 0.7rem;
    }
    .composer .input { resize: none; border: none; background: transparent; box-shadow: none; }
    .composer .btn { width: auto; flex: none; padding-inline: 1.5rem; }

    @media (max-width: 640px) {
      .profile { flex-wrap: wrap; gap: 1rem; }
      .who { flex: 1 1 calc(100% - 56px - 1rem); }
      .details { font-size: 0.78rem; }
      .pill { width: 100%; }
      .bubble { max-width: 92%; }
    }
  `,
})
export class ConversationPage {
  protected readonly session = inject(SessionService);
  private readonly router = inject(Router);
  private readonly history = inject(ChatHistoryService);
  private readonly agent = inject(AgentService);
  private readonly end = viewChild<ElementRef<HTMLElement>>('end');

  readonly chart = this.session.chart;
  readonly city = computed(() => this.chart()?.place.split(',')[0] ?? '');
  readonly initial = computed(() => (this.session.pseudo() ?? '?').charAt(0));
  readonly typing = signal(false);
  readonly error = signal<string | null>(null);
  // The greeting always opens the conversation; it is not stored. Saved history follows it.
  readonly messages = signal<Message[]>([{ from: 'agent', text: GREETING }]);
  draft = '';

  constructor() {
    effect(() => {
      this.messages();
      this.typing();
      queueMicrotask(() => this.end()?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'end' }));
    });
    this.loadHistory();
  }

  private async loadHistory(): Promise<void> {
    try {
      const saved = await this.history.load();
      this.messages.set([
        { from: 'agent', text: GREETING },
        ...saved.map((m): Message => ({ from: m.role === 'user' ? 'user' : 'agent', text: m.content })),
      ]);
    } catch (e) {
      console.error('Loading chat history failed', e);
      this.error.set("L'historique de la conversation n'a pas pu être chargé.");
    }
  }

  formatDate(iso: string): string {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }

  onEnter(event: Event): void {
    const e = event as KeyboardEvent;
    if (e.shiftKey) return;
    e.preventDefault();
    this.send();
  }

  async send(): Promise<void> {
    const text = this.draft.trim();
    if (!text || this.typing()) return;
    this.draft = '';
    this.error.set(null);
    this.messages.update((list) => [...list, { from: 'user', text }]);
    this.typing.set(true);

    try {
      // The server saves both messages once the reply exists.
      const reply = await this.agent.ask(text);
      this.messages.update((list) => [...list, { from: 'agent', text: reply }]);
    } catch (e) {
      console.error('Agent call failed', e);
      // Nothing was saved: take the message back so it can be sent again.
      this.messages.update((list) => list.slice(0, -1));
      this.draft = text;
      this.error.set(e instanceof AgentError ? e.message : AgentError.GENERIC);
    } finally {
      this.typing.set(false);
    }
  }

  newChart(): void {
    this.router.navigateByUrl('/releve');
  }
}
