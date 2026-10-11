import { Component, DestroyRef, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { I18n, TKey } from '../core/i18n';
import { SpeechService } from '../core/speech.service';

const SEEN_KEY = 'astre-et-brume.tour';

interface Step {
  /** The element pointed at: the last one marked data-tour="…" on the page. */
  target: string;
  text: TKey;
}

const STEPS: Step[] = [
  { target: 'listen', text: 'tour.listen' },
  { target: 'autoread', text: 'tour.autoRead' },
  { target: 'account', text: 'tour.account' },
];

/**
 * A one-time tour of the reading voice, shown once per device on the conversation page: small
 * bubbles pointing at 🔊, "Lecture auto" and "Mon compte" (where the voice is chosen).
 * It never blocks the page: a missing button skips its step, any problem ends the tour.
 */
@Component({
  selector: 'app-tour',
  template: `
    @if (step(); as s) {
      @if (ring(); as r) {
        <div class="ring" [style.top.px]="r.top" [style.left.px]="r.left"
          [style.width.px]="r.width" [style.height.px]="r.height"></div>
      }
      <div #bubble class="bubble" role="dialog" [attr.aria-label]="i18n.t('tour.title')"
        [class.above]="place().above" [style.top.px]="place().top" [style.left.px]="place().left">
        <span class="arrow" [style.left.px]="place().arrow"></span>
        <p>{{ i18n.t(s.text, { account: i18n.t('header.account') }) }}</p>
        <div class="actions">
          <span class="count">{{ index() + 1 }} / {{ steps.length }}</span>
          @if (index() < steps.length - 1) {
            <button class="link" type="button" (click)="finish()">{{ i18n.t('tour.skip') }}</button>
            <button class="next" type="button" (click)="next()">{{ i18n.t('tour.next') }}</button>
          } @else {
            <button class="next" type="button" (click)="finish()">{{ i18n.t('tour.done') }}</button>
          }
        </div>
      </div>
    }
  `,
  styles: `
    .ring {
      position: fixed; z-index: 50; pointer-events: none;
      border: 2px solid var(--gold); border-radius: 999px;
      box-shadow: 0 0 0 4px rgba(193, 160, 94, 0.25);
      transition: all 0.25s ease;
    }
    .bubble {
      position: fixed; z-index: 51;
      width: min(300px, calc(100vw - 24px));
      background: var(--card-2);
      border: 1px solid var(--gold-dim);
      border-radius: 12px;
      padding: 1rem 1.1rem 0.8rem;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
      transition: top 0.25s ease, left 0.25s ease;
    }
    .arrow {
      position: absolute; top: -7px; width: 12px; height: 12px; margin-left: -6px;
      background: var(--card-2);
      border-left: 1px solid var(--gold-dim); border-top: 1px solid var(--gold-dim);
      transform: rotate(45deg);
    }
    .above .arrow { top: auto; bottom: -7px; transform: rotate(225deg); }
    p { margin: 0 0 0.8rem; line-height: 1.6; font-size: 1.02rem; color: var(--text); }
    .actions { display: flex; align-items: center; gap: 0.9rem; }
    .count { margin-right: auto; font-family: var(--font-mono); font-size: 0.75rem; color: var(--muted); }
    .link {
      background: none; border: none; padding: 0; cursor: pointer;
      font: inherit; font-size: 0.92rem; color: var(--muted);
      &:hover { color: var(--gold-soft); }
    }
    .next {
      background: var(--gold); color: #16140f;
      border: none; border-radius: 999px; padding: 0.4rem 1rem; cursor: pointer;
      font: inherit; font-size: 0.92rem;
    }
  `,
})
export class Tour {
  protected readonly i18n = inject(I18n);
  private readonly speech = inject(SpeechService);
  private readonly bubble = viewChild<ElementRef<HTMLElement>>('bubble');

  protected readonly steps = STEPS;
  readonly index = signal(-1);
  readonly step = computed(() => STEPS[this.index()] ?? null);
  readonly ring = signal<{ top: number; left: number; width: number; height: number } | null>(null);
  readonly place = signal({ top: -9999, left: 0, arrow: 0, above: false });

  private readonly reposition = () => this.position();

  constructor() {
    if (!this.speech.supported || this.load() === 'done') return;
    // Wait for the conversation to load and scroll into place.
    const timer = setTimeout(() => this.show(0), 900);
    addEventListener('resize', this.reposition);
    addEventListener('scroll', this.reposition, true);
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(timer);
      removeEventListener('resize', this.reposition);
      removeEventListener('scroll', this.reposition, true);
    });
  }

  next(): void {
    this.show(this.index() + 1);
  }

  finish(): void {
    this.index.set(-1);
    this.ring.set(null);
    this.save();
  }

  /** Shows step i, or the next one whose button is on the page; finishes after the last. */
  private show(i: number): void {
    try {
      while (i < STEPS.length && !this.target(i)) i++;
      if (i >= STEPS.length) {
        this.finish();
        return;
      }
      this.index.set(i);
      this.target(i)!.scrollIntoView({ block: 'center', behavior: 'smooth' });
      // Once the bubble is drawn (its height is known) and while the page scrolls.
      requestAnimationFrame(() => this.position());
      setTimeout(() => this.position(), 450);
    } catch (e) {
      console.warn('Tour failed', e);
      this.finish();
    }
  }

  private target(i: number): HTMLElement | null {
    const all = document.querySelectorAll<HTMLElement>(`[data-tour="${STEPS[i].target}"]`);
    return all[all.length - 1] ?? null;
  }

  /** Puts the ring around the button and the bubble below it (above when there is no room). */
  private position(): void {
    const i = this.index();
    const el = i >= 0 ? this.target(i) : null;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const pad = 4;
    this.ring.set({ top: r.top - pad, left: r.left - pad, width: r.width + pad * 2, height: r.height + pad * 2 });

    const box = this.bubble()?.nativeElement;
    const width = box?.offsetWidth ?? 300;
    const height = box?.offsetHeight ?? 120;
    const gap = 14;
    const above = r.bottom + gap + height > innerHeight && r.top - gap - height > 0;
    const center = r.left + r.width / 2;
    const left = Math.min(Math.max(12, center - width / 2), innerWidth - width - 12);
    this.place.set({
      top: above ? r.top - gap - height : r.bottom + gap,
      left,
      arrow: Math.min(Math.max(16, center - left), width - 16),
      above,
    });
  }

  private load(): string | null {
    try {
      return localStorage.getItem(SEEN_KEY);
    } catch {
      return null;
    }
  }

  private save(): void {
    try {
      localStorage.setItem(SEEN_KEY, 'done');
    } catch {
      // shown again on the next visit
    }
  }
}
