import { createClient, type RealtimeChannel } from '@supabase/supabase-js';
import {
  getMissingSupabaseConfigKeys,
  getSupabasePublishableKey,
  getSupabaseUrl,
} from './buildConfig';
import type { WebsiteTaskSubmission } from './types';
const SUPABASE_TASK_SUBMISSIONS_TABLE_ENV = 'SUPABASE_TASK_SUBMISSIONS_TABLE';
const DEFAULT_SUPABASE_TASK_SUBMISSIONS_TABLE = 'task_submissions';

export type SupabaseTaskSubmissionRow = {
  id: string;
  sender_name: string | null;
  title: string;
  details: string | null;
  created_at: string;
  status: 'pending' | 'accepted' | 'dismissed';
  reviewed_at: string | null;
  accepted_local_task_id: string | null;
  source: string | null;
};

type SupabaseTaskSubmissionServiceOptions = {
  onChanged: () => void;
  onSubmission?: (submission: WebsiteTaskSubmission) => void;
  onError: (message: string, error?: unknown) => void;
};

export type SupabaseTaskSubmissionService = {
  isConfigured: boolean;
  missingEnvKeys: string[];
  start: () => Promise<void>;
  stop: () => Promise<void>;
  listPending: () => Promise<WebsiteTaskSubmission[]>;
  getPendingById: (id: string) => Promise<WebsiteTaskSubmission | null>;
  accept: (id: string, acceptedLocalTaskId: string) => Promise<void>;
  dismiss: (id: string) => Promise<void>;
};

const getTaskSubmissionsTableName = (): string =>
  process.env[SUPABASE_TASK_SUBMISSIONS_TABLE_ENV]?.trim() ||
  DEFAULT_SUPABASE_TASK_SUBMISSIONS_TABLE;

const mapSubmissionRow = (
  row: SupabaseTaskSubmissionRow,
): WebsiteTaskSubmission => ({
  id: row.id,
  senderName: row.sender_name ?? undefined,
  title: row.title,
  details: row.details ?? undefined,
  createdAt: row.created_at,
  status: row.status,
  reviewedAt: row.reviewed_at ?? undefined,
  acceptedLocalTaskId: row.accepted_local_task_id ?? undefined,
  source: row.source ?? undefined,
});

export const createSupabaseTaskSubmissionService = ({
  onChanged,
  onSubmission,
  onError,
}: SupabaseTaskSubmissionServiceOptions): SupabaseTaskSubmissionService => {
  const missingEnvKeys = getMissingSupabaseConfigKeys();

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
    getSupabaseUrl() as string,
    getSupabasePublishableKey() as string,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );

  const taskSubmissionsTable = getTaskSubmissionsTableName();
  let channel: RealtimeChannel | null = null;

  const listPending = async (): Promise<WebsiteTaskSubmission[]> => {
    const { data, error } = await supabase
      .from(taskSubmissionsTable)
      .select(
        'id, sender_name, title, details, created_at, status, reviewed_at, accepted_local_task_id, source',
      )
      .eq('status', 'pending')
      .order('created_at', {
        ascending: false,
      })
      .limit(500);

    if (error) {
      onError('Supabase task submissions could not be loaded.', error);
      throw error;
    }

    return (data ?? []).map((row: unknown) =>
      mapSubmissionRow(row as SupabaseTaskSubmissionRow),
    );
  };

  const getPendingById = async (id: string): Promise<WebsiteTaskSubmission | null> => {
    const { data, error } = await supabase
      .from(taskSubmissionsTable)
      .select(
        'id, sender_name, title, details, created_at, status, reviewed_at, accepted_local_task_id, source',
      )
      .eq('id', id)
      .eq('status', 'pending')
      .limit(1);

    if (error) {
      onError(`Supabase task submission ${id} could not be loaded.`, error);
      throw error;
    }

    const row = (data?.[0] ?? null) as SupabaseTaskSubmissionRow | null;

    if (!row) {
      return null;
    }

    return mapSubmissionRow(row);
  };

  const reviewSubmission = async (
    id: string,
    status: 'accepted' | 'dismissed',
    acceptedLocalTaskId?: string,
  ): Promise<void> => {
    const { error } = await supabase
      .from(taskSubmissionsTable)
      .update({
        status,
        reviewed_at: new Date().toISOString(),
        accepted_local_task_id: acceptedLocalTaskId ?? null,
      })
      .eq('id', id);

    if (error) {
      onError(`Supabase task submission ${id} could not be marked ${status}.`, error);
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
        .channel('desktop-task-submission-feed')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: taskSubmissionsTable,
          },
          (payload: { eventType?: unknown; new?: unknown }) => {
            if (payload.eventType === 'INSERT' && payload.new) {
              const nextSubmission = mapSubmissionRow(
                payload.new as SupabaseTaskSubmissionRow,
              );

              if (nextSubmission.status === 'pending') {
                onSubmission?.(nextSubmission);
              }
            }

            onChanged();
          },
        )
        .subscribe((status: string) => {
          if (status === 'CHANNEL_ERROR') {
            onError('Supabase task submission realtime subscription hit a channel error.');
          }

          if (status === 'TIMED_OUT') {
            onError('Supabase task submission realtime subscription timed out.');
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
    accept: async (id: string, acceptedLocalTaskId: string) => {
      await reviewSubmission(id, 'accepted', acceptedLocalTaskId);
    },
    dismiss: async (id: string) => {
      await reviewSubmission(id, 'dismissed');
    },
  };
};
