import { createClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

/** Single Supabase client for the whole app. The session is kept in localStorage by supabase-js. */
export const supabase = createClient(environment.supabaseUrl, environment.supabasePublishableKey);
