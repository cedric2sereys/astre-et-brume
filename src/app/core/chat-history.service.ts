import { Injectable } from '@angular/core';
import { supabase } from './supabase';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** Reads the signed-in user's messages in public.chat_messages (RLS limits rows to them). */
@Injectable({ providedIn: 'root' })
export class ChatHistoryService {
  async load(): Promise<ChatMessage[]> {
    const { data, error } = await supabase
      .from('chat_messages')
      .select('role, content')
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(500);
    if (error) throw error;
    return data as ChatMessage[];
  }
}
