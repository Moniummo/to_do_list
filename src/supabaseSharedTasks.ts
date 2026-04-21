import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { formatRoutineRule } from './recurrence';
import type { AppSelection, RoutineListItem, Task } from './types';

dotenv.config();

const SUPABASE_URL_ENV = 'SUPABASE_URL';
const SUPABASE_PUBLISHABLE_KEY_ENV = 'SUPABASE_PUBLISHABLE_KEY';
const SUPABASE_SHARED_TASKS_TABLE_ENV = 'SUPABASE_SHARED_TASKS_TABLE';
const DEFAULT_SUPABASE_SHARED_TASKS_TABLE = 'shared_tasks';

type SharedTaskKind = 'task' | 'routine';

type SupabaseSharedTaskPayload = {
  task_id: string;
  kind: SharedTaskKind;
  source_id: string;
  title: string;
  status: 'pending';
  due_at: string | null;
  reminder_at: string | null;
  scheduled_date: string | null;
  priority: string | null;
  rule_summary: string | null;
};

type SupabaseSharedTaskRow = SupabaseSharedTaskPayload & {
  updated_at: string;
};

type SupabaseSharedTaskSnapshot = {
  tasks: Task[];
  routines: RoutineListItem[];
};

type SupabaseSharedTaskServiceOptions = {
  onError: (message: string, error?: unknown) => void;
};

export type SupabaseSharedTaskService = {
  isConfigured: boolean;
  missingEnvKeys: string[];
  start: (snapshot: SupabaseSharedTaskSnapshot) => Promise<void>;
  scheduleSync: (snapshot: SupabaseSharedTaskSnapshot) => void;
  stop: () => Promise<void>;
};

export const getSharedTaskId = (selection: AppSelection): string =>
  `${selection.kind}:${selection.id}`;

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

const getMissingSupabaseEnvKeys = (): string[] =>
  [SUPABASE_URL_ENV, SUPABASE_PUBLISHABLE_KEY_ENV].filter(
    (key) => !process.env[key]?.trim(),
  );

const getSharedTasksTableName = (): string =>
  process.env[SUPABASE_SHARED_TASKS_TABLE_ENV]?.trim() || DEFAULT_SUPABASE_SHARED_TASKS_TABLE;

const buildSharedTaskPayloads = ({
  tasks,
  routines,
}: SupabaseSharedTaskSnapshot): SupabaseSharedTaskPayload[] => {
  const taskPayloads = tasks
    .filter((task) => task.status === 'pending')
    .map((task) => ({
      task_id: getSharedTaskId({
        kind: 'task',
        id: task.id,
      }),
      kind: 'task' as const,
      source_id: task.id,
      title: task.title,
      status: 'pending' as const,
      due_at: task.dueAt ?? null,
      reminder_at: task.reminderAt ?? null,
      scheduled_date: null,
      priority: task.priority ?? null,
      rule_summary: null,
    }));

  const routinePayloads = routines
    .filter(
      (item) =>
        item.currentOccurrence !== undefined && item.currentOccurrence.status === 'pending',
    )
    .map((item) => ({
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
      scheduled_date: item.currentOccurrence?.scheduledDate ?? null,
      priority: item.template.priority ?? null,
      rule_summary: formatRoutineRule(item.template.rule),
    }));

  return [...taskPayloads, ...routinePayloads].sort((left, right) =>
    left.task_id.localeCompare(right.task_id),
  );
};

const getSnapshotSignature = (payloads: SupabaseSharedTaskPayload[]): string =>
  JSON.stringify(payloads);

export const createSupabaseSharedTaskService = ({
  onError,
}: SupabaseSharedTaskServiceOptions): SupabaseSharedTaskService => {
  const missingEnvKeys = getMissingSupabaseEnvKeys();

  if (missingEnvKeys.length > 0) {
    return {
      isConfigured: false,
      missingEnvKeys,
      start: async () => undefined,
      scheduleSync: () => undefined,
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

  const sharedTasksTable = getSharedTasksTableName();
  let knownRemoteTaskIds: Set<string> | null = null;
  let lastSnapshotSignature: string | null = null;
  let queuedSnapshot: SupabaseSharedTaskSnapshot | null = null;
  let isSyncing = false;

  const loadRemoteTaskIds = async (): Promise<Set<string>> => {
    const { data, error } = await supabase
      .from(sharedTasksTable)
      .select('task_id')
      .limit(500);

    if (error) {
      onError('Supabase shared task IDs could not be loaded.', error);
      return new Set<string>();
    }

    return new Set(
      (data ?? [])
        .map((row) => {
          if (
            typeof row === 'object' &&
            row !== null &&
            'task_id' in row &&
            typeof (row as { task_id?: unknown }).task_id === 'string'
          ) {
            return (row as { task_id: string }).task_id;
          }

          return null;
        })
        .filter((value): value is string => Boolean(value)),
    );
  };

  const syncSnapshot = async (snapshot: SupabaseSharedTaskSnapshot): Promise<void> => {
    const payloads = buildSharedTaskPayloads(snapshot);
    const signature = getSnapshotSignature(payloads);

    if (signature === lastSnapshotSignature) {
      return;
    }

    const syncTimestamp = new Date().toISOString();
    const rows: SupabaseSharedTaskRow[] = payloads.map((payload) => ({
      ...payload,
      updated_at: syncTimestamp,
    }));

    if (rows.length > 0) {
      const { error } = await supabase.from(sharedTasksTable).upsert(rows, {
        onConflict: 'task_id',
      });

      if (error) {
        onError('Supabase shared tasks could not be upserted.', error);
        return;
      }
    }

    if (knownRemoteTaskIds === null) {
      knownRemoteTaskIds = await loadRemoteTaskIds();
    }

    const nextTaskIds = new Set(rows.map((row) => row.task_id));
    const staleTaskIds = [...knownRemoteTaskIds].filter((taskId) => !nextTaskIds.has(taskId));

    if (staleTaskIds.length > 0) {
      const { error } = await supabase.from(sharedTasksTable).delete().in('task_id', staleTaskIds);

      if (error) {
        onError('Supabase stale shared tasks could not be removed.', error);
        return;
      }
    }

    knownRemoteTaskIds = nextTaskIds;
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
    stop: async () => undefined,
  };
};
