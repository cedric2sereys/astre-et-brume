import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { environment } from '../../environments/environment';
import { I18n, Lang } from './i18n';
import { markdownToText } from './markdown.pipe';
import { supabase } from './supabase';

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

/**
 * Gradium's library voices (docs.gradium.ai → Flagship voices), read through our "voice" Edge
 * Function. The first of each language is the automatic choice.
 */
export interface HostedVoice {
  id: string;
  name: string;
}
export const GRADIUM_VOICES: Record<Lang, HostedVoice[]> = {
  fr: [
    { id: 'FXxJ9mANRq6BCTX5', name: 'Noémie' },
    { id: 'iEu63s1rhn_kegTr', name: 'Gaspard' },
    { id: 'ZeSg853xFACESHHI', name: 'Coralie' },
    { id: 'YhIHaAfQ0cQPDV9R', name: 'Solène' },
    { id: 's048cR1l2Jmu4k3B', name: 'Maëlys' },
    { id: '6oIkS98REoVZ1dEw', name: 'Apolline' },
    { id: 'Tek4tJXiX6_yvXq7', name: 'Augustin' },
    { id: 'YKeBw3OV1RgpdhLh', name: 'Jules' },
    { id: 'biuhvu17TxVKOcyy', name: 'Marius' },
    { id: '25AzBFyp6svYnJsj', name: 'Damien' },
  ],
  en: [
    { id: '4rdlkbxRv4m3UQTW', name: 'Tilly' },
    { id: 'POBHtemksfWQbng0', name: 'Garrett' },
    { id: '6PWnV0Nq4wu7RVBT', name: 'Maeve' },
    { id: 'GgfEkEJtxZR7gnpy', name: 'Freya' },
    { id: '4SZHfMpw-p46Ywgs', name: 'Harper' },
    { id: 'YVzbrdWnnu9FgRn5', name: 'Sunnie' },
    { id: 'dME3IWyZBvmh1n1q', name: 'Toby' },
    { id: 's_k3kLBbgeK9-xUg', name: 'Freddie' },
    { id: 'kfzLbcdE_yXgLeUI', name: 'Archie' },
    { id: '6MFfc37kq0sBjBjy', name: 'Sterling' },
  ],
};
/** Hosted voices are stored as "gradium:<id>" next to the browser voices' voiceURI. */
const GRADIUM_PREFIX = 'gradium:';

/** Chrome stops long utterances after ~15 s, so replies are read as a queue of short pieces. */
const MAX_PIECE = 220;
/** Hosted voices get bigger pieces (fewer requests); the "voice" function accepts up to 600. */
const MAX_HOSTED_PIECE = 450;
/** …except the first two, kept short so the reading starts quickly while the rest is prepared. */
const FIRST_HOSTED_PIECE = 150;
const SECOND_HOSTED_PIECE = 300;

function splitForSpeech(text: string, max = MAX_PIECE): string[] {
  const pieces: string[] = [];
  for (const sentence of text.match(/[^.!?…\n]+[.!?…]*\s*/g) ?? []) {
    // A very long sentence is cut between words so it still fits.
    for (const s of sentence.trim().match(new RegExp(`.{1,${max}}(\\s|$)`, 'g')) ?? []) {
      const part = s.trim();
      if (!part) continue;
      const last = pieces.length - 1;
      if (last >= 0 && pieces[last].length + part.length < max) pieces[last] += ' ' + part;
      else pieces.push(part);
    }
  }
  return pieces;
}

/** Pieces for a hosted voice: growing sizes, so each is ready before the previous one ends. */
function splitForHosted(text: string): string[] {
  const [first, ...rest] = splitForSpeech(text, FIRST_HOSTED_PIECE);
  if (!first) return [];
  const [second, ...others] = splitForSpeech(rest.join(' '), SECOND_HOSTED_PIECE);
  if (!second) return [first];
  return [first, second, ...splitForSpeech(others.join(' '), MAX_HOSTED_PIECE)];
}

/** One piece of a reply as audio, and who made it ("gradium" or "elevenlabs"). */
interface Piece {
  url: string;
  provider: string;
}

/** Why hosted voices are not used right now (shown on /compte), or null when they work. */
export type HostedState = null | 'daily' | 'monthly' | 'off';

const CACHE_SIZE = 15; // replies

/**
 * Reads the agent's replies aloud. With a Gradium voice (the default), each piece of the reply is
 * turned into audio by our "voice" Edge Function within the free allowances (Gradium, then
 * ElevenLabs); when that is refused or fails, the browser's built-in voices (Web Speech API:
 * free, no key) take over. Voice code must
 * never break the app: every failure ends in the browser voice or in silence.
 */
@Injectable({ providedIn: 'root' })
export class SpeechService {
  private readonly i18n = inject(I18n);
  private readonly synth: SpeechSynthesis | null =
    typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
  private readonly audio: HTMLAudioElement | null = createAudio();
  /** A short silence, played during a tap so phones then allow the reply's audio to start later. */
  private silence: string | null = null;
  /** Opus is much smaller; Safari before iOS 18.4 cannot play it, so it gets WAV. */
  private readonly format = canPlayOpus(this.audio) ? 'opus' : 'wav';

  readonly supported = this.synth !== null || this.audio !== null;
  /** Id of the message being read, or null. */
  readonly speakingId = signal<string | null>(null);
  /** Read each new reply aloud as soon as it is complete (remembered on this device). */
  readonly autoRead = signal(this.load(AUTO_READ_KEY) === 'true');
  /** Set when hosted voices were refused (daily cap, monthly budget) or are not set up. */
  readonly hostedState = signal<HostedState>(null);
  /** Messages read (at least partly) by ElevenLabs, whose free plan requires crediting it. */
  readonly elevenLabsIds = signal<ReadonlySet<string>>(new Set());

  private readonly allVoices = signal<SpeechSynthesisVoice[]>([]);
  /** The voices chosen on /compte, per interface language: '' = automatic, "gradium:<id>" or a voiceURI. */
  private readonly chosen = signal<Record<Lang, string>>({
    fr: this.load(voiceKey('fr')) ?? '',
    en: this.load(voiceKey('en')) ?? '',
  });

  /** Browser voices for the interface language, best first. */
  readonly voices = computed(() => {
    const locale = this.i18n.locale;
    const lang = this.i18n.lang();
    return this.allVoices()
      .filter((v) => v.lang.toLowerCase().startsWith(lang))
      .sort((a, b) => score(b, locale) - score(a, locale) || a.name.localeCompare(b.name));
  });
  /** Gradium voices for the interface language (the first one is the automatic choice). */
  readonly hostedVoices = computed(() => (this.audio ? GRADIUM_VOICES[this.i18n.lang()] : []));
  /** The chosen voice for the interface language ('' = automatic). */
  readonly voiceURI = computed(() => this.chosen()[this.i18n.lang()]);
  /** The Gradium voice to use, or null when a browser voice was chosen. */
  readonly hostedVoice = computed<HostedVoice | null>(() => {
    const uri = this.voiceURI();
    const voices = this.hostedVoices();
    if (!uri) return voices[0] ?? null;
    if (!uri.startsWith(GRADIUM_PREFIX)) return null;
    return voices.find((v) => v.id === uri.slice(GRADIUM_PREFIX.length)) ?? voices[0] ?? null;
  });

  /** Changes on every speak/stop, so a reading that was replaced stops quietly. */
  private run = 0;
  /** Ends the piece being played (resolves its promise) when the reading is stopped. */
  private endPiece: (() => void) | null = null;
  /** Replies already received as audio this visit (voice + text → pieces), so replaying costs nothing. */
  private readonly cache = new Map<string, Piece[]>();

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
    this.stop();
    const text = markdownToText(markdown);
    const hosted = this.hostedState() === 'off' ? null : this.hostedVoice();
    if (hosted && this.audio) {
      const pieces = splitForHosted(text);
      if (!pieces.length) return;
      // speak() runs during a tap: unlock both players now, the audio arrives later.
      this.primeAudio();
      this.primeSynth();
      this.speakingId.set(id);
      void this.speakHosted(id, pieces, hosted, this.run).catch((e) => {
        console.warn('Hosted voice failed', e);
        if (this.speakingId() === id) this.speakingId.set(null);
      });
    } else {
      this.speakBrowser(id, splitForSpeech(text));
    }
  }

  stop(): void {
    this.run++;
    this.speakingId.set(null);
    try {
      this.audio?.pause();
      this.endPiece?.();
      this.synth?.cancel();
    } catch {
      // nothing playing
    }
  }

  /**
   * Phones only allow speech that starts from a tap. Calling this during the tap on "Send"
   * lets the reply be read automatically once it arrives.
   */
  unlock(): void {
    if (!this.autoRead()) return;
    if (this.hostedVoice()) this.primeAudio();
    this.primeSynth();
  }

  /** Chooses the voice for the interface language ('' = automatic); remembered on this device. */
  setVoice(uri: string): void {
    const lang = this.i18n.lang();
    this.chosen.update((c) => ({ ...c, [lang]: uri }));
    this.save(voiceKey(lang), uri);
  }

  /** The value stored for a Gradium voice in the voice list. */
  hostedValue(v: HostedVoice): string {
    return GRADIUM_PREFIX + v.id;
  }

  /** The chosen browser voice if this browser still has it, otherwise the best one available. */
  currentVoice(): SpeechSynthesisVoice | undefined {
    const voices = this.voices();
    return voices.find((v) => v.voiceURI === this.voiceURI()) ?? voices[0];
  }

  // --- Browser voice -------------------------------------------------------------

  private speakBrowser(id: string, pieces: string[]): void {
    if (!this.synth || !pieces.length) {
      if (this.speakingId() === id) this.speakingId.set(null);
      return;
    }
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

  private primeSynth(): void {
    if (!this.synth || this.synth.speaking) return;
    try {
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      this.synth.speak(u);
    } catch {
      // not needed on this browser
    }
  }

  // --- Hosted voice (Gradium) -----------------------------------------------------

  /**
   * Plays the pieces one after the other, fetching the next while the current one plays.
   * The whole reply is read by one voice: the provider that read the first piece reads the rest.
   */
  private async speakHosted(id: string, pieces: string[], voice: HostedVoice, run: number): Promise<void> {
    const key = `${voice.id}|${this.i18n.lang()}|${this.format}|${pieces.join(' ')}`;
    const cached = this.cache.get(key);
    const loaded: Piece[] = [];
    let provider: string | null = null;
    const loads: Promise<Piece | null>[] = [];
    const unpinned = new Set<number>(); // pieces asked for before the voice was known
    // Characters from piece i to the end: what must still fit when a piece picks the voice.
    const remaining = (i: number) => pieces.slice(i).join(' ').length;
    const load = (i: number) => {
      if (cached) return (loads[i] ??= Promise.resolve(cached[i]));
      if (!loads[i] && !provider) unpinned.add(i);
      return (loads[i] ??= this.fetchPiece(pieces[i], voice, provider, provider ? 0 : remaining(i)));
    };
    // The second piece is asked for at once, before the voice is known: it is checked below.
    void load(0);
    if (pieces.length > 1) void load(1);
    for (let i = 0; i < pieces.length; i++) {
      let piece = await load(i);
      if (run !== this.run) return;
      if (provider && unpinned.has(i) && piece?.provider !== provider) {
        // Rare: refused, or read by another voice than the first piece's: ask that voice again.
        if (piece) URL.revokeObjectURL(piece.url);
        piece = await this.fetchPiece(pieces[i], voice, provider, 0);
        if (run !== this.run) return;
      }
      if (!piece) {
        // Refused or failed: the browser voice reads the rest of the reply.
        this.speakBrowser(id, splitForSpeech(pieces.slice(i).join(' ')));
        return;
      }
      provider = piece.provider;
      loaded[i] = piece;
      if (!cached && loaded.length === pieces.length) this.remember(key, loaded);
      if (piece.provider === 'elevenlabs' && !this.elevenLabsIds().has(id)) {
        this.elevenLabsIds.update((ids) => new Set(ids).add(id));
      }
      if (i + 1 < pieces.length) void load(i + 1);
      const played = await this.play(piece.url);
      if (run !== this.run) return;
      if (!played) {
        this.speakBrowser(id, splitForSpeech(pieces.slice(i).join(' ')));
        return;
      }
    }
    if (this.speakingId() === id) this.speakingId.set(null);
  }

  /**
   * The audio of one piece, or null if hosted voices cannot read it. The first piece of a reply
   * sends the reply's length (`replyChars`) so the server picks a voice that can read all of it;
   * the following ones send the `provider` that read the first.
   */
  private async fetchPiece(
    text: string,
    voice: HostedVoice,
    provider: string | null,
    replyChars: number,
    retry = true,
  ): Promise<Piece | null> {
    if (this.hostedState() === 'off') return null;
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return null;
    let res: Response;
    try {
      res = await fetch(`${environment.supabaseUrl}/functions/v1/voice`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: environment.supabasePublishableKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          voice_id: voice.id,
          lang: this.i18n.lang(),
          format: this.format,
          ...(provider ? { provider } : { reply_chars: replyChars }),
        }),
      });
    } catch {
      return null; // network down
    }
    if (!res.ok) {
      const error = (await res.json().catch(() => ({})))?.error;
      // Only a first piece was offered to every provider: that tells why hosted voices are not used.
      if (!provider && error === 'quota_daily') this.hostedState.set('daily');
      else if (!provider && error === 'quota_monthly') this.hostedState.set('monthly');
      else if (error === 'not_configured' || res.status === 404) this.hostedState.set('off');
      else if (error === 'busy' && retry) {
        // The free plans read only a few pieces at once for the whole app: wait a moment.
        await new Promise((r) => setTimeout(r, 1200));
        return this.fetchPiece(text, voice, provider, replyChars, false);
      }
      return null;
    }
    if (!provider) this.hostedState.set(null); // a shorter reply can fit after a refusal
    return {
      url: URL.createObjectURL(await res.blob()),
      provider: res.headers.get('x-voice-provider') ?? 'gradium',
    };
  }

  /** Keeps a reply's audio for this visit, so replaying it costs nothing. */
  private remember(key: string, pieces: Piece[]): void {
    this.cache.set(key, [...pieces]);
    if (this.cache.size > CACHE_SIZE) {
      const [oldKey, old] = this.cache.entries().next().value!;
      this.cache.delete(oldKey);
      old.forEach((p) => URL.revokeObjectURL(p.url));
    }
  }

  /** Plays one piece; true when it played to the end (or was stopped), false if it failed. */
  private play(url: string): Promise<boolean> {
    const audio = this.audio!;
    return new Promise((resolve) => {
      const done = (ok: boolean) => {
        audio.onended = audio.onerror = null;
        this.endPiece = null;
        resolve(ok);
      };
      this.endPiece = () => done(true);
      audio.onended = () => done(true);
      audio.onerror = () => done(false);
      audio.src = url;
      audio.play().catch(() => done(false));
    });
  }

  private primeAudio(): void {
    const audio = this.audio;
    if (!audio) return;
    try {
      audio.src = this.silence ??= URL.createObjectURL(silentWav());
      audio.play().catch(() => undefined);
    } catch {
      // not needed on this browser
    }
  }

  // --- Remembered choices -------------------------------------------------------------

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

function createAudio(): HTMLAudioElement | null {
  try {
    return typeof Audio !== 'undefined' ? new Audio() : null;
  } catch {
    return null;
  }
}

/** 0.1 s of silence as a WAV file (8 kHz, 16-bit, mono). */
function silentWav(): Blob {
  const samples = 800;
  const view = new DataView(new ArrayBuffer(44 + samples * 2));
  const ascii = (offset: number, s: string) => [...s].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + samples * 2, true);
  ascii(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 8000, true);
  view.setUint32(28, 16000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, samples * 2, true);
  return new Blob([view.buffer], { type: 'audio/wav' });
}

function canPlayOpus(audio: HTMLAudioElement | null): boolean {
  try {
    return !!audio?.canPlayType('audio/ogg; codecs="opus"');
  } catch {
    return false;
  }
}
