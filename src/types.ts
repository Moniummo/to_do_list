export type TaskStatus = 'pending' | 'completed';
export type TaskPriority = 'auto' | 'high' | 'medium' | 'low';

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  createdAt: string;
  dueAt?: string;
  reminderAt?: string;
  completedAt?: string;
  notes?: string;
  priority?: TaskPriority;
}

export interface TaskDraft {
  title: string;
  dueAt?: string;
  reminderAt?: string;
  notes?: string;
  priority?: TaskPriority;
}

export interface TaskUpdate {
  id: string;
  title?: string;
  dueAt?: string | null;
  reminderAt?: string | null;
  notes?: string | null;
  priority?: TaskPriority | null;
}

export type RoutineUnit = 'day' | 'week' | 'month';
export type RoutineWeekday = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';

export interface RoutineRule {
  interval: number;
  unit: RoutineUnit;
  weekdays?: RoutineWeekday[];
  startDate: string;
  endDate?: string;
  dueTime?: string;
  reminderTime?: string;
}

export interface RoutineTemplate {
  id: string;
  title: string;
  createdAt: string;
  notes?: string;
  priority?: TaskPriority;
  rule: RoutineRule;
}

export interface RoutineDraft {
  title: string;
  notes?: string;
  priority?: TaskPriority;
  rule: RoutineRule;
}

export interface RoutineUpdate {
  id: string;
  title?: string;
  notes?: string | null;
  priority?: TaskPriority | null;
  rule?: RoutineRule;
}

export type OccurrenceStatus = 'pending' | 'completed' | 'missed';

export interface RoutineOccurrence {
  id: string;
  routineId: string;
  scheduledDate: string;
  dueAt: string;
  reminderAt?: string;
  status: OccurrenceStatus;
  createdAt: string;
  completedAt?: string;
}

export interface RoutineHistorySummary {
  routineId: string;
  totalCompleted: number;
  totalMissed: number;
  completionRate: number;
  currentStreak: number;
  bestStreak: number;
}

export interface RoutineListItem {
  template: RoutineTemplate;
  currentOccurrence?: RoutineOccurrence;
  historySummary: RoutineHistorySummary;
}

export interface RoutineHistoryPayload {
  routine: RoutineTemplate;
  occurrences: RoutineOccurrence[];
}

export interface RoutineHistoryEntry {
  routine: RoutineTemplate;
  occurrence: RoutineOccurrence;
}

export interface HistoryDayPayload {
  date: string;
  tasks: Task[];
  routineEntries: RoutineHistoryEntry[];
}

export interface TaskCompletionDateUpdate {
  id: string;
  completedDate: string;
}

export interface RoutineOccurrenceHistoryUpdate {
  occurrenceId: string;
  status: 'completed' | 'missed';
}

export type AppSelection =
  | {
      kind: 'task';
      id: string;
    }
  | {
      kind: 'routine';
      id: string;
    };

export interface TodoAppApi {
  tasks: {
    list: () => Promise<Task[]>;
    create: (input: TaskDraft) => Promise<Task>;
    update: (input: TaskUpdate) => Promise<Task[]>;
    complete: (id: string) => Promise<Task[]>;
    reopen: (id: string) => Promise<Task[]>;
    delete: (id: string) => Promise<Task[]>;
    setCompletionDate: (input: TaskCompletionDateUpdate) => Promise<Task[]>;
    snooze: (id: string, minutes: number) => Promise<Task[]>;
    onChanged: (listener: () => void) => () => void;
  };
  routines: {
    list: () => Promise<RoutineListItem[]>;
    create: (input: RoutineDraft) => Promise<RoutineListItem>;
    update: (input: RoutineUpdate) => Promise<RoutineListItem[]>;
    completeCurrent: (routineId: string) => Promise<RoutineListItem[]>;
    reopenCurrent: (routineId: string) => Promise<RoutineListItem[]>;
    delete: (routineId: string) => Promise<RoutineListItem[]>;
    updateOccurrenceHistory: (
      input: RoutineOccurrenceHistoryUpdate,
    ) => Promise<RoutineListItem[]>;
    snoozeCurrent: (routineId: string, minutes: number) => Promise<RoutineListItem[]>;
    history: (routineId: string) => Promise<RoutineHistoryPayload>;
    historySummary: (routineId: string) => Promise<RoutineHistorySummary>;
    onChanged: (listener: () => void) => () => void;
  };
  history: {
    day: (date: string) => Promise<HistoryDayPayload>;
  };
  app: {
    show: () => Promise<void>;
    showSelection: (selection: AppSelection) => Promise<void>;
    previewReminderPopup: () => Promise<void>;
    closeCurrentWindow: () => Promise<void>;
    onSelection: (listener: (selection: AppSelection) => void) => () => void;
  };
  quickAdd: {
    open: () => Promise<void>;
  };
}

declare global {
  interface Window {
    todoApp: TodoAppApi;
  }
}

export {};
