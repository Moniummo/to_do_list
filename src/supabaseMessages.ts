import dotenv from 'dotenv';
import { createClient, type RealtimeChannel } from '@supabase/supabase-js';

dotenv.config();

const SUPABASE_URL_ENV = 'SUPABASE_URL';
const SUPABASE_PUBLISHABLE_KEY_ENV = 'SUPABASE_PUBLISHABLE_KEY';
const SUPABASE_MESSAGES_TABLE = 'tasks';

export type SupabaseMessageRow = {
  id: string;
  sender_name: string | null;
  message: string;
  created_at: string;
  is_read: boolean;
  source: string | null;
  task_id: string | null;
};

type SupabaseMessageServiceOptions = {
  onMessage: (message: SupabaseMessageRow) => void;
  onError: (message: string, error?: unknown) => void;
};

type SupabaseMessageService = {
  isConfigured: boolean;
  missingEnvKeys: string[];
  start: () => Promise<void>;
  refresh: () => Promise<void>;
  stop: () => Promise<void>;
};

const SUPABASE_MESSAGE_BATCH_SIZE = 100;

const getMissingSupabaseEnvKeys = (): string[] =>
  [SUPABASE_URL_ENV, SUPABASE_PUBLISHABLE_KEY_ENV].filter(
    (key) => !process.env[key]?.trim(),
  );

export const createSupabaseMessageService = ({
  onMessage,
  onError,
}: SupabaseMessageServiceOptions): SupabaseMessageService => {
  const missingEnvKeys = getMissingSupabaseEnvKeys();

  if (missingEnvKeys.length > 0) {
    return {
      isConfigured: false,
      missingEnvKeys,
      start: async () => undefined,
      refresh: async () => undefined,
      stop: async () => undefined,
    };
  }

  const supabase = createClient(
    process.env[SUPABASE_URL_ENV] as string,
    process.env[SUPABASE_PUBLISHABLE_KEY_ENV] as string,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );

  const handledMessageIds = new Set<string>();
  let channel: RealtimeChannel | null = null;

  const markMessageAsRead = async (messageId: string): Promise<void> => {
    const { error } = await supabase
      .from(SUPABASE_MESSAGES_TABLE)
      .update({
        is_read: true,
      })
      .eq('id', messageId);

    if (error) {
      onError(`Supabase message ${messageId} could not be marked as read.`, error);
    }
  };

  const handleIncomingMessage = async (message: SupabaseMessageRow): Promise<void> => {
    if (handledMessageIds.has(message.id) || message.is_read) {
      return;
    }

    handledMessageIds.add(message.id);
    onMessage(message);
    await markMessageAsRead(message.id);
  };

  const loadUnreadMessages = async (): Promise<void> => {
    let hasMoreUnreadMessages = true;

    while (hasMoreUnreadMessages) {
      const { data, error } = await supabase
        .from(SUPABASE_MESSAGES_TABLE)
        .select('id, sender_name, message, created_at, is_read, source, task_id')
        .eq('is_read', false)
        .order('created_at', {
          ascending: true,
        })
        .limit(SUPABASE_MESSAGE_BATCH_SIZE);

      if (error) {
        onError('Supabase unread messages could not be loaded.', error);
        return;
      }

      if (!data?.length) {
        return;
      }

      for (const row of data) {
        await handleIncomingMessage(row as SupabaseMessageRow);
      }

      hasMoreUnreadMessages = data.length === SUPABASE_MESSAGE_BATCH_SIZE;
    }
  };

  return {
    isConfigured: true,
    missingEnvKeys: [],
    start: async () => {
      await loadUnreadMessages();

      if (channel) {
        return;
      }

      channel = supabase
        .channel('desktop-message-feed')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: SUPABASE_MESSAGES_TABLE,
            filter: 'is_read=eq.false',
          },
          (payload: { new: unknown }) => {
            void handleIncomingMessage(payload.new as SupabaseMessageRow);
          },
        )
        .subscribe((status: string) => {
          if (status === 'CHANNEL_ERROR') {
            onError('Supabase realtime subscription hit a channel error.');
          }

          if (status === 'TIMED_OUT') {
            onError('Supabase realtime subscription timed out.');
          }
        });
    },
    refresh: async () => {
      await loadUnreadMessages();
    },
    stop: async () => {
      handledMessageIds.clear();

      if (!channel) {
        return;
      }

      await supabase.removeChannel(channel);
      channel = null;
    },
  };
};
