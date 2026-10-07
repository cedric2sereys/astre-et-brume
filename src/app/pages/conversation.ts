import { Component, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SessionService } from '../core/session.service';
import { AgentError, AgentService } from '../core/agent.service';
import { Conversation, ConversationsService } from '../core/conversations.service';
import { I18n, TKey } from '../core/i18n';
import { MarkdownPipe } from '../core/markdown.pipe';

interface Message {
  from: 'agent' | 'user';
  text: string;
  /** The app's opening greeting: not stored, shown in the current interface language. */
  greeting?: boolean;
}

const GREETING: Message = { from: 'agent', text: '', greeting: true };

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
        <button class="pill" type="button" (click)="newChart()">{{ i18n.t('chat.newChart') }}</button>
      </header>

      <div class="toolbar">
        <button
          class="pill"
          type="button"
          [attr.aria-expanded]="panelOpen()"
          (click)="panelOpen.set(!panelOpen())"
        >
          {{ i18n.t('chat.myConversations', { count: conversations().length }) }}
        </button>
        <button
          class="pill"
          type="button"
          [disabled]="busy() || currentId() === null"
          (click)="startNew()"
        >
          {{ i18n.t('chat.newConversation') }}
        </button>
      </div>

      @if (panelOpen()) {
        <nav class="card list" [attr.aria-label]="i18n.t('chat.conversationsLabel')">
          @if (!conversations().length) {
            <p class="empty">{{ i18n.t('chat.noConversations') }}</p>
          }
          <ul>
            @for (c of conversations(); track c.id) {
              <li>
                <button
                  type="button"
                  [class.active]="c.id === currentId()"
                  [attr.aria-current]="c.id === currentId() ? 'true' : null"
                  [disabled]="busy()"
                  (click)="open(c.id)"
                >
                  <span class="title">{{ c.title || i18n.t('chat.untitled') }}</span>
                  <span class="when">{{ formatWhen(c.updated_at) }}</span>
                </button>
              </li>
            }
          </ul>
        </nav>
      }

      <div class="messages" aria-live="polite">
        @for (m of messages(); track $index) {
          @if (m.from === 'agent') {
            <div class="bubble agent">
              <span class="eyebrow">{{ i18n.t('chat.agent') }}</span>
              <div class="md" [innerHTML]="(m.greeting ? i18n.t('chat.greeting') : m.text) | markdown"></div>
            </div>
          } @else {
            <div class="bubble user"><p>{{ m.text }}</p></div>
          }
        }
        @if (waiting()) {
          <div class="bubble agent typing">
            <span class="eyebrow">{{ i18n.t('chat.agent') }}</span>
            <p>{{ i18n.t('chat.thinking') }}<span class="dots"><span></span><span></span><span></span></span></p>
          </div>
        }
        <div #end></div>
      </div>

      @if (error(); as error) {
        <p class="error" role="alert">{{ i18n.t(error) }}</p>
      }
      <form class="composer" (ngSubmit)="send()">
        <textarea
          class="input"
          name="draft"
          rows="1"
          [placeholder]="i18n.t('chat.placeholder')"
          [(ngModel)]="draft"
          (keydown.enter)="onEnter($event)"
        ></textarea>
        <button class="btn btn-gold" type="submit" [disabled]="!draft.trim() || busy()">
          {{ i18n.t('chat.send') }}
        </button>
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

    .pill:disabled { opacity: 0.45; cursor: not-allowed; &:hover { background: transparent; } }

    .toolbar { display: flex; gap: 0.7rem; flex-wrap: wrap; margin-top: 0.9rem; }

    .list { margin-top: 0.8rem; padding: 0.6rem; border-radius: 14px; max-height: 50vh; overflow-y: auto; }
    .list ul { list-style: none; margin: 0; padding: 0; }
    .list button {
      width: 100%;
      display: flex; justify-content: space-between; align-items: baseline; gap: 1rem;
      text-align: left;
      background: transparent; border: 1px solid transparent; border-radius: 10px;
      padding: 0.7rem 0.9rem;
      color: var(--text); cursor: pointer;
      &:hover:not(:disabled) { background: var(--card-2); }
      &.active { border-color: var(--gold-dim); background: var(--card-2); }
      &:disabled { cursor: not-allowed; opacity: 0.6; }
    }
    .list .title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .list .when { flex: none; font-family: var(--font-mono); font-size: 0.78rem; color: var(--muted); }
    .list .empty { margin: 0.5rem 0.9rem; color: var(--muted); }

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
      .toolbar .pill { width: auto; flex: 1 1 auto; }
      .list .when { display: none; }
      .bubble { max-width: 92%; }
    }
  `,
})
export class ConversationPage {
  protected readonly session = inject(SessionService);
  protected readonly i18n = inject(I18n);
  private readonly router = inject(Router);
  private readonly store = inject(ConversationsService);
  private readonly agent = inject(AgentService);
  private readonly end = viewChild<ElementRef<HTMLElement>>('end');

  readonly chart = this.session.chart;
  readonly city = computed(() => this.chart()?.place.split(',')[0] ?? '');
  readonly initial = computed(() => (this.session.pseudo() ?? '?').charAt(0));
  /** True for the whole exchange: blocks sending and switching conversations. */
  readonly busy = signal(false);
  /** True until the first words of the reply arrive (shows "consulter les astres"). */
  readonly waiting = signal(false);
  readonly error = signal<TKey | null>(null);

  readonly conversations = signal<Conversation[]>([]);
  /** The open conversation; null = a new one, created on the server with its first message. */
  readonly currentId = signal<string | null>(null);
  readonly panelOpen = signal(false);
  // The greeting always opens a conversation; it is not stored. Saved messages follow it.
  readonly messages = signal<Message[]>([GREETING]);
  draft = '';

  constructor() {
    effect(() => {
      this.messages();
      this.waiting();
      queueMicrotask(() => this.end()?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'end' }));
    });
    this.init();
  }

  /** Lists the conversations and reopens the most recent one. */
  private async init(): Promise<void> {
    try {
      const list = await this.store.list();
      this.conversations.set(list);
      if (list.length) await this.open(list[0].id);
    } catch (e) {
      console.error('Loading conversations failed', e);
      this.error.set('chat.err.list');
    }
  }

  async open(id: string): Promise<void> {
    if (this.busy()) return;
    this.currentId.set(id);
    this.panelOpen.set(false);
    this.error.set(null);
    this.messages.set([GREETING]);
    try {
      const saved = await this.store.messages(id);
      if (this.currentId() !== id) return; // another conversation was opened meanwhile
      this.messages.set([
        GREETING,
        ...saved.map((m): Message => ({ from: m.role === 'user' ? 'user' : 'agent', text: m.content })),
      ]);
    } catch (e) {
      console.error('Loading conversation failed', e);
      this.error.set('chat.err.load');
    }
  }

  startNew(): void {
    if (this.busy()) return;
    this.currentId.set(null);
    this.panelOpen.set(false);
    this.error.set(null);
    this.messages.set([GREETING]);
  }

  formatDate(iso: string): string {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }

  /** "Aujourd'hui, 14:05" / "Today, 14:05" for today, otherwise "3 oct. 2026" / "3 Oct 2026". */
  formatWhen(iso: string): string {
    const date = new Date(iso);
    if (date.toDateString() === new Date().toDateString()) {
      const time = date.toLocaleTimeString(this.i18n.locale, { hour: '2-digit', minute: '2-digit' });
      return this.i18n.t('chat.today', { time });
    }
    return date.toLocaleDateString(this.i18n.locale, { day: 'numeric', month: 'short', year: 'numeric' });
  }

  onEnter(event: Event): void {
    const e = event as KeyboardEvent;
    if (e.shiftKey) return;
    e.preventDefault();
    this.send();
  }

  async send(): Promise<void> {
    const text = this.draft.trim();
    if (!text || this.busy()) return;
    this.draft = '';
    this.error.set(null);
    const before = this.messages().length; // to take everything back if the exchange fails
    this.messages.update((list) => [...list, { from: 'user', text }]);
    this.busy.set(true);
    this.waiting.set(true);

    try {
      // The reply is shown as it is written. The server saves both messages once it is
      // complete (creating the conversation if new).
      const result = await this.agent.ask(text, this.currentId(), (piece) => {
        if (this.waiting()) {
          this.waiting.set(false);
          this.messages.update((list) => [...list, { from: 'agent', text: piece }]);
        } else {
          this.messages.update((list) => [
            ...list.slice(0, -1),
            { from: 'agent', text: list[list.length - 1].text + piece },
          ]);
        }
      });
      this.currentId.set(result.conversationId);
      // Move this conversation to the top of the list (adding it if it is new).
      this.conversations.update((list) => {
        const existing = list.find((c) => c.id === result.conversationId);
        const updated: Conversation = {
          id: result.conversationId,
          title: existing?.title ?? result.title,
          updated_at: new Date().toISOString(),
        };
        return [updated, ...list.filter((c) => c.id !== result.conversationId)];
      });
    } catch (e) {
      console.error('Agent call failed', e);
      // Nothing was saved: take the message (and any partial reply) back so it can be sent again.
      this.messages.update((list) => list.slice(0, before));
      this.draft = text;
      this.error.set(e instanceof AgentError ? e.key : 'agent.generic');
    } finally {
      this.waiting.set(false);
      this.busy.set(false);
    }
  }

  newChart(): void {
    this.router.navigateByUrl('/releve');
  }
}
