import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';
import { supabase } from './supabase';

/** An error whose message can be shown to the user as is. */
export class AgentError extends Error {
  static readonly GENERIC =
    "Les astres sont momentanément injoignables. Vérifiez votre connexion et réessayez.";
}

const MESSAGES: Record<string, string> = {
  busy: 'Beaucoup de monde consulte les astres en ce moment. Réessayez dans une minute.',
  profile_missing: 'Votre profil est incomplet : renseignez votre pseudo et votre relevé de naissance.',
  invalid_message: 'Ce message est vide ou trop long (4 000 caractères au maximum).',
  unauthorized: 'Votre session a expiré. Déconnectez-vous puis reconnectez-vous.',
  conversation_not_found: "Cette conversation n'existe plus. Ouvrez-en une autre ou commencez-en une nouvelle.",
  save_failed: "La conversation n'a pas pu être enregistrée. Réessayez dans un instant.",
};

const errorFor = (code: string | undefined) => new AgentError((code && MESSAGES[code]) || AgentError.GENERIC);

export interface AgentResult {
  /** The conversation the exchange was saved in (newly created when none was given). */
  conversationId: string;
  /** Set only when a new conversation was created. */
  title: string | null;
}

type StreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'done'; conversation_id: string; title: string | null }
  | { type: 'error'; error: string };

/**
 * Talks to the "chat" Edge Function, which streams the agent's reply as it is written
 * (newline-delimited JSON) and saves the exchange once it is complete.
 */
@Injectable({ providedIn: 'root' })
export class AgentService {
  /**
   * `conversationId` null starts a new conversation. `onText` receives each piece of the reply.
   * Throws an AgentError if anything fails; in that case nothing was saved.
   */
  async ask(
    message: string,
    conversationId: string | null,
    onText: (text: string) => void,
  ): Promise<AgentResult> {
    // supabase.functions.invoke waits for the whole body, so the stream is read with fetch.
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw errorFor('unauthorized');

    let res: Response;
    try {
      res = await fetch(`${environment.supabaseUrl}/functions/v1/chat`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: environment.supabasePublishableKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message,
          conversation_id: conversationId,
          // The time zone decides which day "today's horoscope" is for.
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
    } catch {
      throw errorFor(undefined); // network down
    }

    // Errors found before the reply starts come back as plain JSON with an error status.
    if (!res.ok || !res.body) {
      const body = await res.json().catch(() => ({}));
      throw errorFor(body?.error);
    }

    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = '';
    for (;;) {
      const { value, done } = await reader.read().catch(() => ({ value: undefined, done: true }));
      if (value) buffer += value;
      const lines = buffer.split('\n');
      buffer = done ? '' : lines.pop()!; // keep an incomplete last line for the next read
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line) as StreamEvent;
        if (event.type === 'delta') onText(event.text);
        else if (event.type === 'done') return { conversationId: event.conversation_id, title: event.title };
        else if (event.type === 'error') throw errorFor(event.error);
      }
      if (done) break;
    }
    // The stream ended without "done" (connection cut): nothing was saved.
    throw errorFor(undefined);
  }
}
