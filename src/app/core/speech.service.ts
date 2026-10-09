import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { I18n, Lang } from './i18n';
import { markdownToText } from './markdown.pipe';

const AUTO_READ_KEY = 'astre-et-brume.autoRead';
const voiceKey = (lang: Lang) => `astre-et-brume.voice.${lang}`;

/**
 * Human-sounding voices: Edge's "Natural" (online) voices, Chrome's Google voices,
 * Apple's "Enhanced"/"Premium" ones. The others are the robotic voices built into the system.
 */
export function isNaturalVoice(v: SpeechSynthesisVoice): boolean {
  return /natural|online|google|enhanced|premium|neural/i.test(v.name);
}

/** Voices the owner found the most natural, chosen automatically when the browser has them. */
const FAVOURITES = /vivienne/i;

/** Higher is better: favourites, then natural voices, then the exact region (fr-FR, en-GB). */
function score(v: SpeechSynthesisVoice, locale: string): number {
  const name = v.name;
  return (
    (FAVOURITES.test(name) ? 16 : 0) +
    (/natural|neural/i.test(name) ? 8 : 0) +
    (isNaturalVoice(v) ? 4 : 0) +
    (v.lang.replace('_', '-') === locale ? 2 : 0) +
    (v.default ? 1 : 0)
  );
}

/** Chrome stops long utterances after ~15 s, so replies are read as a queue of short pieces. */
const MAX_PIECE = 220;

function splitForSpeech(text: string): string[] {
  const pieces: string[] = [];
  for (const sentence of text.match(/[^.!?…\n]+[.!?…]*\s*/g) ?? []) {
    const s = sentence.trim();
    if (!s) continue;
    const last = pieces.length - 1;
    if (last >= 0 && pieces[last].length + s.length < MAX_PIECE) pieces[last] += ' ' + s;
    else pieces.push(s);
  }
  return pieces;
}

/**
 * Reads the agent's replies aloud with the browser's built-in voices (Web Speech API:
 * free, no key, nothing sent to our server). Hidden where the browser has no speech synthesis.
 */
@Injectable({ providedIn: 'root' })
export class SpeechService {
  private readonly i18n = inject(I18n);
  private readonly synth: SpeechSynthesis | null =
    typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;

  readonly supported = this.synth !== null;
  /** Id of the message being read, or null. */
  readonly speakingId = signal<string | null>(null);
  /** Read each new reply aloud as soon as it is complete (remembered on this device). */
  readonly autoRead = signal(this.load(AUTO_READ_KEY) === 'true');

  private readonly allVoices = signal<SpeechSynthesisVoice[]>([]);
  /** The voices chosen on /compte (voiceURI), per interface language; '' = automatic. */
  private readonly chosen = signal<Record<Lang, string>>({
    fr: this.load(voiceKey('fr')) ?? '',
    en: this.load(voiceKey('en')) ?? '',
  });

  /** Voices for the interface language, best first. */
  readonly voices = computed(() => {
    const locale = this.i18n.locale;
    const lang = this.i18n.lang();
    return this.allVoices()
      .filter((v) => v.lang.toLowerCase().startsWith(lang))
      .sort((a, b) => score(b, locale) - score(a, locale) || a.name.localeCompare(b.name));
  });
  /** The chosen voice for the interface language ('' = automatic, the best one available). */
  readonly voiceURI = computed(() => this.chosen()[this.i18n.lang()]);

  constructor() {
    if (this.synth) {
      const synth = this.synth;
      // Edge can list the same voice twice: keep one of each. A voice problem must never
      // break the page: at worst the browser's default voice is used.
      const refresh = () => {
        try {
          this.allVoices.set([...new Map((synth.getVoices() ?? []).map((v) => [v.voiceURI, v])).values()]);
        } catch (e) {
          console.warn('Reading the voices failed', e);
        }
      };
      refresh();
      // Voices often load after the page. The on… property works in every browser, unlike
      // addEventListener on older iPhone Safari.
      try {
        synth.onvoiceschanged = refresh;
      } catch {
        // no notification: the voices read above are used
      }
    }
    effect(() => this.save(AUTO_READ_KEY, String(this.autoRead())));
    // A reply read in one language should not continue after switching to the other.
    effect(() => {
      this.i18n.lang();
      this.stop();
    });
  }

  /** Reads a reply (Markdown) aloud, stopping whatever was being read. */
  speak(id: string, markdown: string): void {
    if (!this.synth) return;
    this.stop();
    const pieces = splitForSpeech(markdownToText(markdown));
    if (!pieces.length) return;
    const lang = this.i18n.locale;
    const voice = this.currentVoice();
    this.speakingId.set(id);
    pieces.forEach((piece, i) => {
      const u = new SpeechSynthesisUtterance(piece);
      u.lang = voice?.lang ?? lang;
      if (voice) u.voice = voice;
      if (i === pieces.length - 1) {
        u.onend = () => this.speakingId() === id && this.speakingId.set(null);
      }
      u.onerror = () => this.speakingId() === id && this.speakingId.set(null);
      this.synth!.speak(u);
    });
  }

  stop(): void {
    if (!this.synth) return;
    this.speakingId.set(null);
    this.synth.cancel();
  }

  /**
   * Phones only allow speech that starts from a tap. Calling this during the tap on "Send"
   * lets the reply be read automatically once it arrives.
   */
  unlock(): void {
    if (!this.synth || !this.autoRead() || this.synth.speaking) return;
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    this.synth.speak(u);
  }

  /** Chooses the voice for the interface language ('' = automatic); remembered on this device. */
  setVoice(uri: string): void {
    const lang = this.i18n.lang();
    this.chosen.update((c) => ({ ...c, [lang]: uri }));
    this.save(voiceKey(lang), uri);
  }

  /** The chosen voice if this browser still has it, otherwise the best one available. */
  currentVoice(): SpeechSynthesisVoice | undefined {
    const voices = this.voices();
    return voices.find((v) => v.voiceURI === this.voiceURI()) ?? voices[0];
  }

  private load(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  private save(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      // not remembered on this device; the choice still applies for this visit
    }
  }
}
