import dotenv from 'dotenv';
import { createClient, type RealtimeChannel } from '@supabase/supabase-js';
import type { WebsiteTaskEditSuggestion } from './types';

dotenv.config();

const SUPABASE_URL_ENV = 'SUPABASE_URL';
const SUPABASE_PUBLISHABLE_KEY_ENV = 'SUPABASE_PUBLISHABLE_KEY';
const SUPABASE_TASK_EDIT_SUGGESTIONS_TABLE_ENV = 'SUPABASE_TASK_EDIT_SUGGESTIONS_TABLE';
const DEFAULT_SUPABASE_TASK_EDIT_SUGGESTIONS_TABLE = 'task_edit_suggestions';

export type SupabaseTaskEditSuggestionRow = {
  id: string;
  sender_name: string | null;
  shared_task_id: string;
  local_task_id: string;
  task_title_snapshot: string;
  change_title: boolean;
  suggested_title: string | null;
  change_notes: boolean;
  suggested_notes: string | null;
  change_due_at: boolean;
  suggested_due_at: string | null;
  change_reminder_at: boolean;
  suggested_reminder_at: string | null;
  change_priority: boolean;
  suggested_priority: 'auto' | 'high' | 'medium' | 'low' | null;
  created_at: string;
  status: 'pending' | 'accepted' | 'dismissed';
  reviewed_at: string | null;
  source: string | null;
};

type SupabaseTaskEditSuggestionServiceOptions = {
  onChanged: () => void;
  onSuggestion?: (suggestion: WebsiteTaskEditSuggestion) => void;
  onError: (message: string, error?: unknown) => void;
};

export type SupabaseTaskEditSuggestionService = {
  isConfigured: boolean;
  missingEnvKeys: string[];
  start: () => Promise<void>;
  stop: () => Promise<void>;
  listPending: () => Promise<WebsiteTaskEditSuggestion[]>;
  getPendingById: (id: string) => Promise<WebsiteTaskEditSuggestion | null>;
  accept: (id: string) => Promise<void>;
  dismiss: (id: string) => Promise<void>;
};

const getMissingSupabaseEnvKeys = (): string[] =>
  [SUPABASE_URL_ENV, SUPABASE_PUBLISHABLE_KEY_ENV].filter(
    (key) => !process.env[key]?.trim(),
  );

const getTaskEditSuggestionsTableName = (): string =>
  process.env[SUPABASE_TASK_EDIT_SUGGESTIONS_TABLE_ENV]?.trim() ||
  DEFAULT_SUPABASE_TASK_EDIT_SUGGESTIONS_TABLE;

const mapTaskEditSuggestionRow = (
  row: SupabaseTaskEditSuggestionRow,
): WebsiteTaskEditSuggestion => ({
  id: row.id,
  senderName: row.sender_name ?? undefined,
  sharedTaskId: row.shared_task_id,
  localTaskId: row.local_task_id,
  taskTitleSnapshot: row.task_title_snapshot,
  changeTitle: row.change_title,
  suggestedTitle: row.suggested_title ?? undefined,
  changeNotes: row.change_notes,
  suggestedNotes: row.suggested_notes ?? undefined,
  changeDueAt: row.change_due_at,
  suggestedDueAt: row.suggested_due_at ?? undefined,
  changeReminderAt: row.change_reminder_at,
  suggestedReminderAt: row.suggested_reminder_at ?? undefined,
  changePriority: row.change_priority,
  suggestedPriority: row.suggested_priority ?? undefined,
  createdAt: row.created_at,
  status: row.status,
  reviewedAt: row.reviewed_at ?? undefined,
  source: row.source ?? undefined,
});

export const createSupabaseTaskEditSuggestionService = ({
  onChanged,
  onSuggestion,
  onError,
}: SupabaseTaskEditSuggestionServiceOptions): SupabaseTaskEditSuggestionService => {
  const missingEnvKeys = getMissingSupabaseEnvKeys();

  if (missingEnvKeys.length > 0) {
    return {
      isConfigured: false,
      missingEnvKeys,
      start: async () => undefined,
      stop: async () => undefined,
      listPending: async () => [],
      getPendingById: async () => null,
      accept: async () => undefined,
      dismiss: async () => undefined,
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

  const taskEditSuggestionsTable = getTaskEditSuggestionsTableName();
  let channel: RealtimeChannel | null = null;

  const listPending = async (): Promise<WebsiteTaskEditSuggestion[]> => {
    const { data, error } = await supabase
      .from(taskEditSuggestionsTable)
      .select(
        'id, sender_name, shared_task_id, local_task_id, task_title_snapshot, change_title, suggested_title, change_notes, suggested_notes, change_due_at, suggested_due_at, change_reminder_at, suggested_reminder_at, change_priority, suggested_priority, created_at, status, reviewed_at, source',
      )
      .eq('status', 'pending')
      .order('created_at', {
        ascending: false,
      })
      .limit(500);

    if (error) {
      onError('Supabase task edit suggestions could not be loaded.', error);
      throw error;
    }

    return (data ?? []).map((row: unknown) =>
      mapTaskEditSuggestionRow(row as SupabaseTaskEditSuggestionRow),
    );
  };

  const getPendingById = async (id: string): Promise<WebsiteTaskEditSuggestion | null> => {
    const { data, error } = await supabase
      .from(taskEditSuggestionsTable)
      .select(
        'id, sender_name, shared_task_id, local_task_id, task_title_snapshot, change_title, suggested_title, change_notes, suggested_notes, change_due_at, suggested_due_at, change_reminder_at, suggested_reminder_at, change_priority, suggested_priority, created_at, status, reviewed_at, source',
      )
      .eq('id', id)
      .eq('status', 'pending')
      .limit(1);

    if (error) {
      onError(`Supabase task edit suggestion ${id} could not be loaded.`, error);
      throw error;
    }

    const row = (data?.[0] ?? null) as SupabaseTaskEditSuggestionRow | null;

    if (!row) {
      return null;
    }

    return mapTaskEditSuggestionRow(row);
  };

  const reviewSuggestion = async (
    id: string,
    status: 'accepted' | 'dismissed',
  ): Promise<void> => {
    const { error } = await supabase
      .from(taskEditSuggestionsTable)
      .update({
        status,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) {
      onError(`Supabase task edit suggestion ${id} could not be marked ${status}.`, error);
      throw error;
    }
  };

  return {
    isConfigured: true,
    missingEnvKeys: [],
    start: async () => {
      if (channel) {
        return;
      }

      channel = supabase
        .channel('desktop-task-edit-suggestion-feed')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: taskEditSuggestionsTable,
          },
          (payload: { eventType?: unknown; new?: unknown }) => {
            if (payload.eventType === 'INSERT' && payload.new) {
              const nextSuggestion = mapTaskEditSuggestionRow(
                payload.new as SupabaseTaskEditSuggestionRow,
              );

              if (nextSuggestion.status === 'pending') {
                onSuggestion?.(nextSuggestion);
              }
            }

            onChanged();
          },
        )
        .subscribe((status: string) => {
          if (status === 'CHANNEL_ERROR') {
            onError('Supabase task edit suggestion realtime subscription hit a channel error.');
          }

          if (status === 'TIMED_OUT') {
            onError('Supabase task edit suggestion realtime subscription timed out.');
          }
        });
    },
    stop: async () => {
      if (!channel) {
        return;
      }

      await supabase.removeChannel(channel);
      channel = null;
    },
    listPending,
    getPendingById,
    accept: async (id: string) => {
      await reviewSuggestion(id, 'accepted');
    },
    dismiss: async (id: string) => {
      await reviewSuggestion(id, 'dismissed');
    },
  };
};
