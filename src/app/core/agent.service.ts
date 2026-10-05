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
};

/** Talks to the "chat" Edge Function, which calls the AI agent and saves the exchange. */
@Injectable({ providedIn: 'root' })
export class AgentService {
  async ask(message: string): Promise<string> {
    const { data, error } = await supabase.functions.invoke<{ reply: string }>('chat', {
      // The time zone decides which day "today's horoscope" is for.
      body: { message, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
    });
    if (error) {
      let code: string | undefined;
      if (error instanceof FunctionsHttpError) {
        code = await error.context.json().then((b: { error?: string }) => b.error, () => undefined);
      }
      throw new AgentError((code && MESSAGES[code]) || AgentError.GENERIC);
    }
    if (!data?.reply) throw new AgentError(AgentError.GENERIC);
    return data.reply;
  }
}
