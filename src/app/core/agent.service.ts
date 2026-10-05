import { Injectable } from '@angular/core';
import { FunctionsHttpError } from '@supabase/supabase-js';
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

export interface AgentReply {
  reply: string;
  /** The conversation the exchange was saved in (newly created when none was given). */
  conversationId: string;
  /** Set only when a new conversation was created. */
  title: string | null;
}

/** Talks to the "chat" Edge Function, which calls the AI agent and saves the exchange. */
@Injectable({ providedIn: 'root' })
export class AgentService {
  /** `conversationId` null starts a new conversation. */
  async ask(message: string, conversationId: string | null): Promise<AgentReply> {
    const { data, error } = await supabase.functions.invoke<{
      reply: string;
      conversation_id: string;
      title: string | null;
    }>('chat', {
      body: {
        message,
        conversation_id: conversationId,
        // The time zone decides which day "today's horoscope" is for.
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
    });
    if (error) {
      let code: string | undefined;
      if (error instanceof FunctionsHttpError) {
        code = await error.context.json().then((b: { error?: string }) => b.error, () => undefined);
      }
      throw new AgentError((code && MESSAGES[code]) || AgentError.GENERIC);
    }
    if (!data?.reply || !data.conversation_id) throw new AgentError(AgentError.GENERIC);
    return { reply: data.reply, conversationId: data.conversation_id, title: data.title };
  }
}
