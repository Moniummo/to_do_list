import { createClient } from '@supabase/supabase-js';
import {
  getMissingSupabaseConfigKeys,
  getSupabasePublishableKey,
  getSupabaseUrl,
} from './buildConfig';
import { formatRoutineRule, toLocalDateString } from './recurrence';
import type {
  AppSelection,
  PublicSharedTask,
  RoutineListItem,
  RoutineOccurrence,
  Task,
} from './types';

const SUPABASE_SHARED_TASKS_TABLE_ENV = 'SUPABASE_SHARED_TASKS_TABLE';
const DEFAULT_SUPABASE_SHARED_TASKS_TABLE = 'shared_tasks';

type SharedTaskKind = 'task' | 'routine';

type SupabaseSharedTaskPayload = {
  owner_account_id: string;
  task_id: string;
  kind: SharedTaskKind;
  source_id: string;
  title: string;
  status: 'pending' | 'completed';
  due_at: string | null;
  reminder_at: string | null;
  completed_at: string | null;
  scheduled_date: string | null;
  priority: string | null;
  rule_summary: string | null;
  visibility: 'public' | 'private';
};

type SupabaseSharedTaskRow = SupabaseSharedTaskPayload & {
  updated_at: string;
};

type SupabaseDeleteResult = {
  error: unknown;
};

type SupabaseDeleteFilterBuilder = PromiseLike<SupabaseDeleteResult> & {
  eq: (column: string, value: string) => SupabaseDeleteFilterBuilder;
};

type SupabaseSharedTaskSnapshot = {
  tasks: Task[];
  routines: RoutineListItem[];
  routineOccurrences?: RoutineOccurrence[];
};

type SupabaseSharedTaskServiceOptions = {
  accountId?: string;
  onError: (message: string, error?: unknown) => void;
};

const getSupabaseErrorMessage = (error: unknown): string | undefined => {
  if (!error || typeof error !== 'object' || !('message' in error)) {
    return undefined;
  }

  const message = (error as { message?: unknown }).message;
  return typeof message === 'string' && message.trim() ? message : undefined;
};

export type SupabaseSharedTaskService = {
  isConfigured: boolean;
  missingEnvKeys: string[];
  start: (snapshot: SupabaseSharedTaskSnapshot) => Promise<void>;
  scheduleSync: (snapshot: SupabaseSharedTaskSnapshot) => void;
  listTasksVisibleToViewer: (
    ownerAccountId: string,
    viewerAccountId: string,
    viewerPasswordHash: string,
  ) => Promise<PublicSharedTask[]>;
  stop: () => Promise<void>;
};

export const getSharedTaskId = (selection: AppSelection): string =>
  `${selection.kind}:${selection.id}`;

const getCompletedRoutineSharedTaskId = (occurrenceId: string): string =>
  `routine-completed:${occurrenceId}`;

export const getSelectionFromSharedTaskId = (
  sharedTaskId?: string | null,
): AppSelection | undefined => {
  if (!sharedTaskId) {
    return undefined;
  }

  if (sharedTaskId.startsWith('task:')) {
    return {
      kind: 'task',
      id: sharedTaskId.slice('task:'.length),
    };
  }

  if (sharedTaskId.startsWith('routine:')) {
    return {
      kind: 'routine',
      id: sharedTaskId.slice('routine:'.length),
    };
  }

  return undefined;
};

const getSharedTasksTableName = (): string =>
  process.env[SUPABASE_SHARED_TASKS_TABLE_ENV]?.trim() || DEFAULT_SUPABASE_SHARED_TASKS_TABLE;

const buildSharedTaskPayloads = ({
  accountId,
  tasks,
  routines,
  routineOccurrences = [],
}: SupabaseSharedTaskSnapshot & { accountId: string }): SupabaseSharedTaskPayload[] => {
  const today = toLocalDateString(new Date());
  const taskPayloads = tasks
    .filter((task) => {
      if (task.status === 'pending') {
        return true;
      }

      return (
        task.status === 'completed' &&
        task.completedAt !== undefined &&
        toLocalDateString(new Date(task.completedAt)) === today
      );
    })
    .map((task) => ({
      owner_account_id: accountId,
      task_id: getSharedTaskId({
        kind: 'task',
        id: task.id,
      }),
      kind: 'task' as const,
      source_id: task.id,
      title: task.title,
      status: task.status === 'completed' ? 'completed' as const : 'pending' as const,
      due_at: task.dueAt ?? null,
      reminder_at: task.reminderAt ?? null,
      completed_at: task.completedAt ?? null,
      scheduled_date: null,
      priority: task.priority ?? null,
      rule_summary: null,
      visibility: task.visibility === 'private' ? 'private' as const : 'public' as const,
    }));

  const activeRoutinePayloads = routines
    .filter(
      (item) =>
        item.currentOccurrence !== undefined && item.currentOccurrence.status === 'pending',
    )
    .map((item) => ({
      owner_account_id: accountId,
      task_id: getSharedTaskId({
        kind: 'routine',
        id: item.template.id,
      }),
      kind: 'routine' as const,
      source_id: item.template.id,
      title: item.template.title,
      status: 'pending' as const,
      due_at: item.currentOccurrence?.dueAt ?? null,
      reminder_at: item.currentOccurrence?.reminderAt ?? null,
      completed_at: null,
      scheduled_date: item.currentOccurrence?.scheduledDate ?? null,
      priority: item.template.priority ?? null,
      rule_summary: formatRoutineRule(item.template.rule),
      visibility: 'public' as const,
    }));

  const routinesById = new Map(routines.map((item) => [item.template.id, item]));
  const completedRoutinePayloads = routineOccurrences
    .filter(
      (occurrence) =>
        occurrence.status === 'completed' &&
        occurrence.completedAt !== undefined &&
        toLocalDateString(new Date(occurrence.completedAt)) === today &&
        routinesById.has(occurrence.routineId),
    )
    .map((occurrence) => {
      const item = routinesById.get(occurrence.routineId) as RoutineListItem;

      return {
        owner_account_id: accountId,
        task_id: getCompletedRoutineSharedTaskId(occurrence.id),
        kind: 'routine' as const,
        source_id: item.template.id,
        title: item.template.title,
        status: 'completed' as const,
        due_at: occurrence.dueAt,
        reminder_at: occurrence.reminderAt ?? null,
        completed_at: occurrence.completedAt ?? null,
        scheduled_date: occurrence.scheduledDate,
        priority: item.template.priority ?? null,
        rule_summary: formatRoutineRule(item.template.rule),
        visibility: 'public' as const,
      };
    });

  return [...taskPayloads, ...activeRoutinePayloads, ...completedRoutinePayloads].sort((left, right) =>
    left.task_id.localeCompare(right.task_id),
  );
};

const getSnapshotSignature = (payloads: SupabaseSharedTaskPayload[]): string =>
  JSON.stringify(payloads);

export const createSupabaseSharedTaskService = ({
  accountId,
  onError,
}: SupabaseSharedTaskServiceOptions): SupabaseSharedTaskService => {
  const missingEnvKeys = getMissingSupabaseConfigKeys();

  if (missingEnvKeys.length > 0) {
    return {
      isConfigured: false,
      missingEnvKeys,
      start: async () => undefined,
      scheduleSync: () => undefined,
      listTasksVisibleToViewer: async () => [],
      stop: async () => undefined,
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

  const sharedTasksTable = getSharedTasksTableName();
  let lastSnapshotSignature: string | null = null;
  let queuedSnapshot: SupabaseSharedTaskSnapshot | null = null;
  let isSyncing = false;

  const mapSharedTaskRow = (row: SupabaseSharedTaskRow): PublicSharedTask => ({
    id: row.task_id,
    kind: row.kind,
    sourceId: row.source_id,
    title: row.title,
    dueAt: row.due_at ?? undefined,
    reminderAt: row.reminder_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
    scheduledDate: row.scheduled_date ?? undefined,
    priority: row.priority ?? undefined,
    status: row.status === 'completed' ? 'completed' : 'pending',
    ruleSummary: row.rule_summary ?? undefined,
    visibility: row.visibility === 'private' ? 'private' : 'public',
    updatedAt: row.updated_at,
  });

  const syncSnapshot = async (snapshot: SupabaseSharedTaskSnapshot): Promise<void> => {
    if (!accountId) {
      return;
    }

    const payloads = buildSharedTaskPayloads({
      ...snapshot,
      accountId,
    });
    const signature = getSnapshotSignature(payloads);

    if (signature === lastSnapshotSignature) {
      return;
    }

    const syncTimestamp = new Date().toISOString();
    const rows: SupabaseSharedTaskRow[] = payloads.map((payload) => ({
      ...payload,
      updated_at: syncTimestamp,
    }));

    const deleteQuery = supabase
      .from(sharedTasksTable)
      .delete() as unknown as SupabaseDeleteFilterBuilder;
    const { error: deleteError } = await deleteQuery.eq('owner_account_id', accountId);

    if (deleteError) {
      onError('Supabase shared tasks could not be refreshed.', deleteError);
      return;
    }

    if (rows.length > 0) {
      const { error } = await supabase.from(sharedTasksTable).upsert(rows, {
        onConflict: 'owner_account_id,task_id',
      });

      if (error) {
        onError('Supabase shared tasks could not be upserted.', error);
        return;
      }
    }

    lastSnapshotSignature = signature;
  };

  const flushQueue = async (): Promise<void> => {
    if (isSyncing) {
      return;
    }

    isSyncing = true;

    try {
      while (queuedSnapshot) {
        const snapshot = queuedSnapshot;
        queuedSnapshot = null;
        await syncSnapshot(snapshot);
      }
    } finally {
      isSyncing = false;
    }
  };

  return {
    isConfigured: true,
    missingEnvKeys: [],
    start: async (snapshot) => {
      queuedSnapshot = snapshot;
      await flushQueue();
    },
    scheduleSync: (snapshot) => {
      queuedSnapshot = snapshot;
      void flushQueue();
    },
    listTasksVisibleToViewer: async (ownerAccountId, viewerAccountId, viewerPasswordHash) => {
      const { data, error } = await supabase.rpc('list_shared_tasks_for_viewer', {
        p_owner_account_id: ownerAccountId,
        p_password_hash: viewerPasswordHash,
        p_viewer_account_id: viewerAccountId,
      });

      if (error) {
        onError('Supabase shared tasks could not be loaded for that friend.', error);
        const errorMessage = getSupabaseErrorMessage(error);
        throw new Error(
          errorMessage
            ? `Public tasks could not be loaded for that friend: ${errorMessage}`
            : 'Public tasks could not be loaded for that friend.',
        );
      }

      return ((Array.isArray(data) ? data : []) as SupabaseSharedTaskRow[]).map((row) =>
        mapSharedTaskRow(row),
      );
    },
    stop: async () => undefined,
  };
};
