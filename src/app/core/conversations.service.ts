import { Injectable } from '@angular/core';
import { supabase } from './supabase';

export interface Conversation {
  id: string;
  title: string | null;
  updated_at: string; // time of the latest message
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** Reads the signed-in user's conversations and their messages (RLS limits rows to them). */
@Injectable({ providedIn: 'root' })
export class ConversationsService {
  /** Most recently active first. */
  async list(): Promise<Conversation[]> {
    const { data, error } = await supabase
      .from('conversations')
      .select('id, title, updated_at')
      .order('updated_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    return data as Conversation[];
  }

  async messages(conversationId: string): Promise<ChatMessage[]> {
    const { data, error } = await supabase
      .from('chat_messages')
      .select('role, content')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(500);
    if (error) throw error;
    return data as ChatMessage[];
  }
}
