import { Injectable, effect, inject, signal } from '@angular/core';
import { I18n, TKey } from './i18n';

// The Web Speech API's recognition part is not in TypeScript's DOM types yet.
interface RecognitionResult {
  readonly isFinal: boolean;
  readonly 0: { readonly transcript: string };
}
interface RecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: ArrayLike<RecognitionResult>;
}
interface RecognitionErrorEvent extends Event {
  readonly error: string;
}
interface Recognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

const Ctor: RecognitionCtor | undefined =
  typeof window === 'undefined'
    ? undefined
    : ((window as unknown as Record<string, RecognitionCtor | undefined>)['SpeechRecognition'] ??
      (window as unknown as Record<string, RecognitionCtor | undefined>)['webkitSpeechRecognition']);

/** Android Chrome repeats the words in continuous mode: there, each dictation is one phrase. */
const ANDROID = typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);

/**
 * Dictation with the browser's speech recognition (free, no key). The browser sends the
 * audio to its own service (Google for Chrome, Microsoft for Edge), not to our server.
 * Unavailable in Firefox and Brave: the 🎤 button is then hidden.
 */
@Injectable({ providedIn: 'root' })
export class DictationService {
  private readonly i18n = inject(I18n);
  private recognition: Recognition | null = null;

  /** Brave has the API but blocks Google's recognition service behind it: it never works there. */
  readonly supported = Ctor !== undefined && !('brave' in navigator);
  readonly listening = signal(false);
  /** Why dictation stopped with a problem (microphone refused, service unreachable…). */
  readonly error = signal<TKey | null>(null);

  constructor() {
    // Words are recognised in the interface language: switching it ends the dictation.
    effect(() => {
      this.i18n.lang();
      this.stop();
    });
  }

  /** Starts listening; onText receives everything heard so far in this dictation. */
  start(onText: (text: string) => void): void {
    if (!Ctor || this.listening()) return;
    this.error.set(null);
    const r = new Ctor();
    r.lang = this.i18n.locale;
    r.continuous = !ANDROID;
    r.interimResults = true;
    r.onresult = (e) => {
      // Rebuilt from all the results each time: words still being recognised change as you speak.
      let text = '';
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
      onText(text.replace(/\s+/g, ' ').trim());
    };
    r.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      this.error.set(
        e.error === 'not-allowed' || e.error === 'service-not-allowed'
          ? 'dictation.err.denied'
          : e.error === 'audio-capture'
            ? 'dictation.err.noMic'
            : 'dictation.err.unavailable',
      );
    };
    r.onend = () => {
      if (this.recognition === r) {
        this.recognition = null;
        this.listening.set(false);
      }
    };
    this.recognition = r;
    this.listening.set(true);
    try {
      r.start();
    } catch {
      this.recognition = null;
      this.listening.set(false);
      this.error.set('dictation.err.unavailable');
    }
  }

  /** Stops listening; what was heard stays in the message box. */
  stop(): void {
    const r = this.recognition;
    if (!r) return;
    this.recognition = null;
    this.listening.set(false);
    r.stop(); // the last words heard may still arrive, through onText
  }

  /** Stops at once and ignores anything still being recognised (the message was sent…). */
  cancel(): void {
    const r = this.recognition;
    if (!r) return;
    this.recognition = null;
    this.listening.set(false);
    r.onresult = null;
    r.abort();
  }
}
