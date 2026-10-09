import { Injectable, effect, inject, signal } from '@angular/core';
import { I18n } from './i18n';
import { markdownToText } from './markdown.pipe';

const AUTO_READ_KEY = 'astre-et-brume.autoRead';

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

  private voices: SpeechSynthesisVoice[] = [];

  constructor() {
    if (this.synth) {
      const refresh = () => (this.voices = this.synth!.getVoices());
      refresh();
      this.synth.addEventListener('voiceschanged', refresh); // voices often load after the page
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
    const voice = this.voiceFor(lang);
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

  /** A voice for the interface language: the browser's default one if it fits, else the first. */
  private voiceFor(locale: string): SpeechSynthesisVoice | undefined {
    const lang = locale.slice(0, 2);
    const matching = this.voices.filter((v) => v.lang.toLowerCase().startsWith(lang));
    return (
      matching.find((v) => v.default) ??
      matching.find((v) => v.lang.replace('_', '-') === locale) ??
      matching[0]
    );
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
