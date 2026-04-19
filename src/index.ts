import { randomUUID } from 'node:crypto';
import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  Notification,
  powerMonitor,
  Tray,
} from 'electron';
import Store from 'electron-store';
import {
  createLocalDateTime,
  compareLocalDateStrings,
  getDueAtForScheduledDate,
  getReminderAtForScheduledDate,
  getUpcomingScheduledDate,
  listScheduledDatesUntil,
  normalizeWeekdays,
  toLocalDateString,
  validateRoutineRule,
} from './recurrence';
import {
  getRoutinePriorityDetails,
  getTaskPriorityDetails,
  normalizeTaskPriority,
} from './taskPriority';
import type {
  AppSelection,
  HistoryDayPayload,
  RoutineDraft,
  RoutineHistoryEntry,
  RoutineHistoryPayload,
  RoutineHistorySummary,
  RoutineListItem,
  RoutineOccurrence,
  RoutineOccurrenceHistoryUpdate,
  RoutineRule,
  RoutineTemplate,
  RoutineUpdate,
  Task,
  TaskCompletionDateUpdate,
  TaskDraft,
  TaskUpdate,
} from './types';

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

if (require('electron-squirrel-startup')) {
  app.quit();
}

type PersistedState = {
  schemaVersion: number;
  oneOffTasks: Task[];
  routineTemplates: RoutineTemplate[];
  routineOccurrences: RoutineOccurrence[];
  notifiedReminders: Record<string, string>;
};

type SnoozeRequest = {
  id: string;
  minutes: number;
};

type RoutineSnoozeRequest = {
  routineId: string;
  minutes: number;
};

type StoreAccess = {
  get: (key: string, defaultValue: unknown) => unknown;
  set: (key: string, value: unknown) => void;
};

const CURRENT_SCHEMA_VERSION = 2;
const APP_USER_MODEL_ID = 'com.arkave.todolist';
const APP_NAME = 'To Do List';
const MINI_WINDOW_SHORTCUT = 'CommandOrControl+Shift+A';
const QUICK_ADD_HASH = '#quick-add';
const REMINDER_CHECK_INTERVAL_MS = 30_000;
const WINDOW_BACKGROUND = '#130613';
const QUICK_ADD_BACKGROUND = '#180818';

const taskStore = new Store<Record<string, unknown>>({
  name: 'tasks',
  clearInvalidConfig: true,
  defaults: {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    oneOffTasks: [],
    routineTemplates: [],
    routineOccurrences: [],
    notifiedReminders: {},
  },
});
const taskStoreAccess = taskStore as unknown as StoreAccess;

let mainWindow: BrowserWindow | null = null;
let quickAddWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let reminderInterval: NodeJS.Timeout | null = null;
let isQuitting = false;
let pendingSelection: AppSelection | null = null;

app.setAppUserModelId(APP_USER_MODEL_ID);
app.name = APP_NAME;

const reminderFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const normalizeOptionalText = (value?: string | null): string | undefined => {
  const trimmedValue = value?.trim();
  return trimmedValue ? trimmedValue : undefined;
};

const normalizeTitle = (value: string): string => {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    throw new Error('Title is required.');
  }

  return trimmedValue;
};

const normalizeOptionalDateTime = (value?: string | null): string | undefined => {
  if (!value) {
    return undefined;
  }

  const normalizedDate = new Date(value);

  if (Number.isNaN(normalizedDate.getTime())) {
    throw new Error('Please use a valid date and time.');
  }

  return normalizedDate.toISOString();
};

const normalizeOptionalLocalDate = (value?: string | null): string | undefined => {
  const trimmedValue = value?.trim();
  return trimmedValue ? trimmedValue : undefined;
};

const normalizeOptionalLocalTime = (value?: string | null): string | undefined => {
  const trimmedValue = value?.trim();
  return trimmedValue ? trimmedValue : undefined;
};

const toLocalCompletionIso = (dateValue: string, existingIso?: string): string => {
  const existingDate = existingIso ? new Date(existingIso) : null;
  const hours = existingDate ? existingDate.getHours() : 12;
  const minutes = existingDate ? existingDate.getMinutes() : 0;
  return createLocalDateTime(dateValue, `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`).toISOString();
};

const normalizeRoutineRule = (input: RoutineRule): RoutineRule => {
  const normalizedRule: RoutineRule = {
    interval: Number(input.interval),
    unit: input.unit,
    startDate: normalizeTitle(input.startDate),
    endDate: normalizeOptionalLocalDate(input.endDate),
    dueTime: normalizeOptionalLocalTime(input.dueTime),
    reminderTime: normalizeOptionalLocalTime(input.reminderTime),
  };

  if (!['day', 'week', 'month'].includes(normalizedRule.unit)) {
    throw new Error('Please choose a valid repeat unit.');
  }

  if (normalizedRule.unit === 'week') {
    normalizedRule.weekdays = normalizeWeekdays(input.weekdays);
  }

  validateRoutineRule(normalizedRule);

  return normalizedRule;
};

const compareTasks = (left: Task, right: Task): number => {
  if (left.status !== right.status) {
    return left.status === 'pending' ? -1 : 1;
  }

  if (left.status === 'pending' && right.status === 'pending') {
    const leftPriorityRank = getTaskPriorityDetails(left).rank;
    const rightPriorityRank = getTaskPriorityDetails(right).rank;

    if (leftPriorityRank !== rightPriorityRank) {
      return leftPriorityRank - rightPriorityRank;
    }
  }

  if (left.status === 'completed' && right.status === 'completed') {
    const leftCompleted = left.completedAt ?? left.createdAt;
    const rightCompleted = right.completedAt ?? right.createdAt;
    return rightCompleted.localeCompare(leftCompleted);
  }

  const leftAnchor = left.reminderAt ?? left.dueAt ?? left.createdAt;
  const rightAnchor = right.reminderAt ?? right.dueAt ?? right.createdAt;

  if (leftAnchor !== rightAnchor) {
    return leftAnchor.localeCompare(rightAnchor);
  }

  return right.createdAt.localeCompare(left.createdAt);
};

const sortTasks = (tasks: Task[]): Task[] => tasks.slice().sort(compareTasks);

const compareOccurrencesAsc = (
  left: RoutineOccurrence,
  right: RoutineOccurrence,
): number => {
  if (left.scheduledDate !== right.scheduledDate) {
    return left.scheduledDate.localeCompare(right.scheduledDate);
  }

  return left.createdAt.localeCompare(right.createdAt);
};

const sortOccurrencesAsc = (occurrences: RoutineOccurrence[]): RoutineOccurrence[] =>
  occurrences.slice().sort(compareOccurrencesAsc);

const sortOccurrencesDesc = (occurrences: RoutineOccurrence[]): RoutineOccurrence[] =>
  sortOccurrencesAsc(occurrences).reverse();

const getLegacyOrCurrentTasks = (): Task[] => {
  const nextTasks = taskStoreAccess.get('oneOffTasks', undefined);

  if (Array.isArray(nextTasks)) {
    return nextTasks as Task[];
  }

  const legacyTasks = taskStoreAccess.get('tasks', []);
  return Array.isArray(legacyTasks) ? (legacyTasks as Task[]) : [];
};

const getRoutineTemplates = (): RoutineTemplate[] => {
  const templates = taskStoreAccess.get('routineTemplates', []);
  return Array.isArray(templates) ? (templates as RoutineTemplate[]) : [];
};

const getRoutineOccurrences = (): RoutineOccurrence[] => {
  const occurrences = taskStoreAccess.get('routineOccurrences', []);
  return Array.isArray(occurrences) ? (occurrences as RoutineOccurrence[]) : [];
};

const getNotifiedReminders = (): Record<string, string> => {
  const reminders = taskStoreAccess.get('notifiedReminders', {});
  return isRecord(reminders) ? (reminders as Record<string, string>) : {};
};

const getState = (): PersistedState => ({
  schemaVersion: CURRENT_SCHEMA_VERSION,
  oneOffTasks: getLegacyOrCurrentTasks(),
  routineTemplates: getRoutineTemplates(),
  routineOccurrences: getRoutineOccurrences(),
  notifiedReminders: getNotifiedReminders(),
});

const getTaskReminderKey = (taskId: string): string => `task:${taskId}`;
const getRoutineReminderKey = (occurrenceId: string): string => `routine:${occurrenceId}`;

const filterNotifiedReminders = (state: PersistedState): Record<string, string> => {
  const nextReminders: Record<string, string> = {};

  state.oneOffTasks.forEach((task) => {
    if (task.status === 'pending' && task.reminderAt) {
      const reminderKey = getTaskReminderKey(task.id);

      if (state.notifiedReminders[reminderKey] === task.reminderAt) {
        nextReminders[reminderKey] = task.reminderAt;
      }
    }
  });

  state.routineOccurrences.forEach((occurrence) => {
    if (occurrence.status === 'pending' && occurrence.reminderAt) {
      const reminderKey = getRoutineReminderKey(occurrence.id);

      if (state.notifiedReminders[reminderKey] === occurrence.reminderAt) {
        nextReminders[reminderKey] = occurrence.reminderAt;
      }
    }
  });

  return nextReminders;
};

const haveSameReminderMap = (
  left: Record<string, string>,
  right: Record<string, string>,
): boolean => {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);

  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  return leftKeys.every((key) => left[key] === right[key]);
};

const broadcastDataChange = (): void => {
  BrowserWindow.getAllWindows().forEach((window) => {
    if (!window.isDestroyed()) {
      window.webContents.send('tasks:changed');
      window.webContents.send('routines:changed');
    }
  });
};

const persistState = (
  state: PersistedState,
  options: { broadcast: boolean } = { broadcast: true },
): PersistedState => {
  const nextState: PersistedState = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    oneOffTasks: sortTasks(state.oneOffTasks),
    routineTemplates: state.routineTemplates.slice().sort((left, right) =>
      left.title.localeCompare(right.title),
    ),
    routineOccurrences: sortOccurrencesAsc(state.routineOccurrences),
    notifiedReminders: {},
  };

  nextState.notifiedReminders = filterNotifiedReminders({
    ...nextState,
    notifiedReminders: state.notifiedReminders,
  });

  taskStoreAccess.set('schemaVersion', nextState.schemaVersion);
  taskStoreAccess.set('oneOffTasks', nextState.oneOffTasks);
  taskStoreAccess.set('routineTemplates', nextState.routineTemplates);
  taskStoreAccess.set('routineOccurrences', nextState.routineOccurrences);
  taskStoreAccess.set('notifiedReminders', nextState.notifiedReminders);

  if (options.broadcast) {
    broadcastDataChange();
  }

  return nextState;
};

const choosePreferredOccurrence = (
  current: RoutineOccurrence | undefined,
  next: RoutineOccurrence,
): RoutineOccurrence => {
  if (!current) {
    return next;
  }

  if (current.status === 'pending' && next.status !== 'pending') {
    return next;
  }

  if (current.status !== 'pending' && next.status === 'pending') {
    return current;
  }

  return current.createdAt >= next.createdAt ? current : next;
};

const reconcileState = (
  state: PersistedState,
  referenceDate: Date = new Date(),
): { nextState: PersistedState; changed: boolean } => {
  let changed = false;
  const nextState: PersistedState = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    oneOffTasks: sortTasks(state.oneOffTasks),
    routineTemplates: state.routineTemplates.slice(),
    routineOccurrences: [],
    notifiedReminders: { ...state.notifiedReminders },
  };

  nextState.routineTemplates.forEach((routine) => {
    const existingOccurrences = sortOccurrencesAsc(
      state.routineOccurrences.filter((occurrence) => occurrence.routineId === routine.id),
    );
    const occurrenceByDate = new Map<string, RoutineOccurrence>();

    existingOccurrences.forEach((occurrence) => {
      const current = occurrenceByDate.get(occurrence.scheduledDate);
      const preferred = choosePreferredOccurrence(current, occurrence);

      if (current && preferred !== current) {
        changed = true;
      }

      if (current && preferred === current) {
        changed = true;
      }

      occurrenceByDate.set(occurrence.scheduledDate, preferred);
    });

    const upcomingScheduledDate = getUpcomingScheduledDate(routine.rule, referenceDate);
    const today = toLocalDateString(referenceDate);
    const reconciliationEndDate = upcomingScheduledDate
      ? upcomingScheduledDate
      : routine.rule.endDate && compareLocalDateStrings(routine.rule.endDate, today) < 0
      ? routine.rule.endDate
      : today;
    const scheduledDates = listScheduledDatesUntil(routine.rule, reconciliationEndDate);

    scheduledDates.forEach((scheduledDate) => {
      const dueAt = getDueAtForScheduledDate(routine.rule, scheduledDate);
      const reminderAt = getReminderAtForScheduledDate(routine.rule, scheduledDate);
      const dueMs = new Date(dueAt).getTime();
      const hasPassed = dueMs < referenceDate.getTime();
      const existingOccurrence = occurrenceByDate.get(scheduledDate);

      if (!existingOccurrence) {
        nextState.routineOccurrences.push({
          id: randomUUID(),
          routineId: routine.id,
          scheduledDate,
          dueAt,
          reminderAt,
          status: hasPassed ? 'missed' : 'pending',
          createdAt: referenceDate.toISOString(),
        });
        changed = true;
        return;
      }

      occurrenceByDate.delete(scheduledDate);

      let nextOccurrence = existingOccurrence;

      if (existingOccurrence.status === 'pending') {
        if (existingOccurrence.dueAt !== dueAt) {
          nextOccurrence = {
            ...nextOccurrence,
            dueAt,
          };
          changed = true;
        }

        if (!hasPassed && existingOccurrence.reminderAt !== reminderAt) {
          nextOccurrence = {
            ...nextOccurrence,
            reminderAt,
          };
          changed = true;
        }

        if (hasPassed) {
          nextOccurrence = {
            ...nextOccurrence,
            status: 'missed',
            completedAt: undefined,
          };
          changed = true;
        }
      }

      nextState.routineOccurrences.push(nextOccurrence);
    });

    occurrenceByDate.forEach((occurrence) => {
      const hasPassed = new Date(occurrence.dueAt).getTime() < referenceDate.getTime();

      if (occurrence.status === 'pending') {
        if (hasPassed) {
          nextState.routineOccurrences.push({
            ...occurrence,
            status: 'missed',
            completedAt: undefined,
          });
        }

        changed = true;
        return;
      }

      nextState.routineOccurrences.push(occurrence);
    });
  });

  nextState.routineOccurrences = sortOccurrencesAsc(nextState.routineOccurrences);
  const nextReminders = filterNotifiedReminders(nextState);

  if (!haveSameReminderMap(nextReminders, state.notifiedReminders)) {
    changed = true;
  }

  nextState.notifiedReminders = nextReminders;

  return {
    nextState,
    changed,
  };
};

const getLiveState = (): PersistedState => {
  const baseState = getState();
  const { nextState, changed } = reconcileState(baseState);

  if (changed) {
    return persistState(nextState);
  }

  return nextState;
};

const getCurrentOccurrenceForRoutine = (
  state: PersistedState,
  routineId: string,
  referenceDate: Date = new Date(),
): RoutineOccurrence | undefined => {
  const referenceMs = referenceDate.getTime();
  const occurrences = sortOccurrencesAsc(
    state.routineOccurrences.filter((occurrence) => occurrence.routineId === routineId),
  );

  return occurrences.find(
    (occurrence) => new Date(occurrence.dueAt).getTime() >= referenceMs,
  );
};

const buildRoutineSummary = (
  routineId: string,
  occurrences: RoutineOccurrence[],
): RoutineHistorySummary => {
  const finishedOccurrences = sortOccurrencesAsc(
    occurrences.filter((occurrence) => occurrence.status !== 'pending'),
  );
  const totalCompleted = finishedOccurrences.filter(
    (occurrence) => occurrence.status === 'completed',
  ).length;
  const totalMissed = finishedOccurrences.filter(
    (occurrence) => occurrence.status === 'missed',
  ).length;
  const totalFinished = totalCompleted + totalMissed;
  const completionRate = totalFinished
    ? Math.round((totalCompleted / totalFinished) * 100)
    : 0;

  let currentStreak = 0;

  for (let index = finishedOccurrences.length - 1; index >= 0; index -= 1) {
    if (finishedOccurrences[index].status === 'completed') {
      currentStreak += 1;
      continue;
    }

    break;
  }

  let bestStreak = 0;
  let runningStreak = 0;

  finishedOccurrences.forEach((occurrence) => {
    if (occurrence.status === 'completed') {
      runningStreak += 1;
      bestStreak = Math.max(bestStreak, runningStreak);
      return;
    }

    runningStreak = 0;
  });

  return {
    routineId,
    totalCompleted,
    totalMissed,
    completionRate,
    currentStreak,
    bestStreak,
  };
};

const buildRoutineListItems = (
  state: PersistedState,
  referenceDate: Date = new Date(),
): RoutineListItem[] =>
  state.routineTemplates
    .map((template) => {
      const occurrences = state.routineOccurrences.filter(
        (occurrence) => occurrence.routineId === template.id,
      );

      return {
        template,
        currentOccurrence: getCurrentOccurrenceForRoutine(state, template.id, referenceDate),
        historySummary: buildRoutineSummary(template.id, occurrences),
      };
    })
    .sort((left, right) => {
      const leftPriorityRank = getRoutinePriorityDetails({
        priority: left.template.priority,
        currentOccurrence: left.currentOccurrence,
      }).rank;
      const rightPriorityRank = getRoutinePriorityDetails({
        priority: right.template.priority,
        currentOccurrence: right.currentOccurrence,
      }).rank;

      if (leftPriorityRank !== rightPriorityRank) {
        return leftPriorityRank - rightPriorityRank;
      }

      const leftAnchor = left.currentOccurrence?.dueAt ?? '9999-12-31T23:59:59.999Z';
      const rightAnchor = right.currentOccurrence?.dueAt ?? '9999-12-31T23:59:59.999Z';

      if (leftAnchor !== rightAnchor) {
        return leftAnchor.localeCompare(rightAnchor);
      }

      return left.template.title.localeCompare(right.template.title);
    });

const listTasks = (): Task[] => sortTasks(getLiveState().oneOffTasks);

const listRoutines = (): RoutineListItem[] => buildRoutineListItems(getLiveState());

const createTask = (input: TaskDraft): Task => {
  const state = getLiveState();
  const task: Task = {
    id: randomUUID(),
    title: normalizeTitle(input.title),
    status: 'pending',
    createdAt: new Date().toISOString(),
    dueAt: normalizeOptionalDateTime(input.dueAt),
    reminderAt: normalizeOptionalDateTime(input.reminderAt),
    notes: normalizeOptionalText(input.notes),
    priority: normalizeTaskPriority(input.priority),
  };

  state.oneOffTasks.push(task);
  persistState(state);
  void checkDueReminders();

  return task;
};

const updateTask = (input: TaskUpdate): Task[] => {
  const state = getLiveState();
  const taskIndex = state.oneOffTasks.findIndex((task) => task.id === input.id);

  if (taskIndex === -1) {
    throw new Error('Task not found.');
  }

  const currentTask = state.oneOffTasks[taskIndex];

  state.oneOffTasks[taskIndex] = {
    ...currentTask,
    title:
      typeof input.title === 'string' ? normalizeTitle(input.title) : currentTask.title,
    dueAt:
      input.dueAt === undefined
        ? currentTask.dueAt
        : normalizeOptionalDateTime(input.dueAt),
    reminderAt:
      input.reminderAt === undefined
        ? currentTask.reminderAt
        : normalizeOptionalDateTime(input.reminderAt),
    notes:
      input.notes === undefined
        ? currentTask.notes
        : normalizeOptionalText(input.notes),
    priority:
      input.priority === undefined
        ? currentTask.priority ?? 'auto'
        : normalizeTaskPriority(input.priority),
  };

  const savedState = persistState(state);
  void checkDueReminders();

  return sortTasks(savedState.oneOffTasks);
};

const completeTask = (taskId: string): Task[] => {
  const state = getLiveState();
  const taskIndex = state.oneOffTasks.findIndex((task) => task.id === taskId);

  if (taskIndex === -1) {
    throw new Error('Task not found.');
  }

  state.oneOffTasks[taskIndex] = {
    ...state.oneOffTasks[taskIndex],
    status: 'completed',
    completedAt: new Date().toISOString(),
  };

  const savedState = persistState(state);
  return sortTasks(savedState.oneOffTasks);
};

const reopenTask = (taskId: string): Task[] => {
  const state = getLiveState();
  const taskIndex = state.oneOffTasks.findIndex((task) => task.id === taskId);

  if (taskIndex === -1) {
    throw new Error('Task not found.');
  }

  const currentTask = state.oneOffTasks[taskIndex];

  state.oneOffTasks[taskIndex] = {
    ...currentTask,
    status: 'pending',
    completedAt: undefined,
  };

  if (
    currentTask.reminderAt &&
    new Date(currentTask.reminderAt).getTime() <= Date.now()
  ) {
    state.notifiedReminders[getTaskReminderKey(currentTask.id)] = currentTask.reminderAt;
  }

  const savedState = persistState(state);
  return sortTasks(savedState.oneOffTasks);
};

const deleteTask = (taskId: string): Task[] => {
  const state = getLiveState();
  const nextTasks = state.oneOffTasks.filter((task) => task.id !== taskId);

  if (nextTasks.length === state.oneOffTasks.length) {
    throw new Error('Task not found.');
  }

  state.oneOffTasks = nextTasks;
  const savedState = persistState(state);
  return sortTasks(savedState.oneOffTasks);
};

const setTaskCompletionDate = ({ id, completedDate }: TaskCompletionDateUpdate): Task[] => {
  const state = getLiveState();
  const taskIndex = state.oneOffTasks.findIndex((task) => task.id === id);

  if (taskIndex === -1) {
    throw new Error('Task not found.');
  }

  const currentTask = state.oneOffTasks[taskIndex];

  if (currentTask.status !== 'completed') {
    throw new Error('Only completed tasks can be moved in history.');
  }

  state.oneOffTasks[taskIndex] = {
    ...currentTask,
    completedAt: toLocalCompletionIso(completedDate, currentTask.completedAt),
  };

  const savedState = persistState(state);
  return sortTasks(savedState.oneOffTasks);
};

const snoozeTask = ({ id, minutes }: SnoozeRequest): Task[] => {
  const state = getLiveState();
  const taskIndex = state.oneOffTasks.findIndex((task) => task.id === id);

  if (taskIndex === -1) {
    throw new Error('Task not found.');
  }

  if (minutes <= 0) {
    throw new Error('Snooze length must be longer than 0 minutes.');
  }

  state.oneOffTasks[taskIndex] = {
    ...state.oneOffTasks[taskIndex],
    reminderAt: new Date(Date.now() + minutes * 60_000).toISOString(),
  };

  const savedState = persistState(state);
  void checkDueReminders();

  return sortTasks(savedState.oneOffTasks);
};

const createRoutine = (input: RoutineDraft): RoutineListItem => {
  const state = getLiveState();
  const routine: RoutineTemplate = {
    id: randomUUID(),
    title: normalizeTitle(input.title),
    notes: normalizeOptionalText(input.notes),
    createdAt: new Date().toISOString(),
    priority: normalizeTaskPriority(input.priority),
    rule: normalizeRoutineRule(input.rule),
  };

  state.routineTemplates.push(routine);
  const reconciled = reconcileState(state);
  const savedState = persistState(reconciled.nextState);
  void checkDueReminders();

  return (
    buildRoutineListItems(savedState).find((item) => item.template.id === routine.id) ??
    buildRoutineListItems(savedState)[0]
  );
};

const updateRoutine = (input: RoutineUpdate): RoutineListItem[] => {
  const state = getLiveState();
  const routineIndex = state.routineTemplates.findIndex(
    (routine) => routine.id === input.id,
  );

  if (routineIndex === -1) {
    throw new Error('Routine not found.');
  }

  const currentRoutine = state.routineTemplates[routineIndex];
  state.routineTemplates[routineIndex] = {
    ...currentRoutine,
    title:
      typeof input.title === 'string' ? normalizeTitle(input.title) : currentRoutine.title,
    notes:
      input.notes === undefined
        ? currentRoutine.notes
        : normalizeOptionalText(input.notes),
    priority:
      input.priority === undefined
        ? currentRoutine.priority ?? 'auto'
        : normalizeTaskPriority(input.priority),
    rule: input.rule ? normalizeRoutineRule(input.rule) : currentRoutine.rule,
  };

  state.routineOccurrences = state.routineOccurrences.filter(
    (occurrence) =>
      occurrence.routineId !== input.id || occurrence.status !== 'pending',
  );

  const reconciled = reconcileState(state);
  const savedState = persistState(reconciled.nextState);
  void checkDueReminders();

  return buildRoutineListItems(savedState);
};

const completeCurrentRoutine = (routineId: string): RoutineListItem[] => {
  const state = getLiveState();
  const currentOccurrence = getCurrentOccurrenceForRoutine(state, routineId);

  if (!currentOccurrence) {
    throw new Error('Routine does not have an active occurrence right now.');
  }

  if (currentOccurrence.status === 'completed') {
    return buildRoutineListItems(state);
  }

  const occurrenceIndex = state.routineOccurrences.findIndex(
    (occurrence) => occurrence.id === currentOccurrence.id,
  );

  if (occurrenceIndex === -1) {
    throw new Error('Routine occurrence not found.');
  }

  state.routineOccurrences[occurrenceIndex] = {
    ...state.routineOccurrences[occurrenceIndex],
    status: 'completed',
    completedAt: new Date().toISOString(),
  };

  const savedState = persistState(state);
  return buildRoutineListItems(savedState);
};

const reopenCurrentRoutine = (routineId: string): RoutineListItem[] => {
  const state = getLiveState();
  const currentOccurrence = getCurrentOccurrenceForRoutine(state, routineId);

  if (!currentOccurrence) {
    throw new Error('Routine does not have an active occurrence right now.');
  }

  if (currentOccurrence.status !== 'completed') {
    return buildRoutineListItems(state);
  }

  const occurrenceIndex = state.routineOccurrences.findIndex(
    (occurrence) => occurrence.id === currentOccurrence.id,
  );

  if (occurrenceIndex === -1) {
    throw new Error('Routine occurrence not found.');
  }

  state.routineOccurrences[occurrenceIndex] = {
    ...state.routineOccurrences[occurrenceIndex],
    status: 'pending',
    completedAt: undefined,
  };

  if (
    currentOccurrence.reminderAt &&
    new Date(currentOccurrence.reminderAt).getTime() <= Date.now()
  ) {
    state.notifiedReminders[getRoutineReminderKey(currentOccurrence.id)] =
      currentOccurrence.reminderAt;
  }

  const savedState = persistState(state);
  return buildRoutineListItems(savedState);
};

const deleteRoutine = (routineId: string): RoutineListItem[] => {
  const state = getLiveState();
  const nextTemplates = state.routineTemplates.filter((routine) => routine.id !== routineId);

  if (nextTemplates.length === state.routineTemplates.length) {
    throw new Error('Routine not found.');
  }

  state.routineTemplates = nextTemplates;
  state.routineOccurrences = state.routineOccurrences.filter(
    (occurrence) => occurrence.routineId !== routineId,
  );

  const savedState = persistState(state);
  return buildRoutineListItems(savedState);
};

const updateRoutineOccurrenceHistory = ({
  occurrenceId,
  status,
}: RoutineOccurrenceHistoryUpdate): RoutineListItem[] => {
  const state = getLiveState();
  const occurrenceIndex = state.routineOccurrences.findIndex(
    (occurrence) => occurrence.id === occurrenceId,
  );

  if (occurrenceIndex === -1) {
    throw new Error('Routine history item not found.');
  }

  const currentOccurrence = state.routineOccurrences[occurrenceIndex];
  state.routineOccurrences[occurrenceIndex] = {
    ...currentOccurrence,
    status,
    completedAt:
      status === 'completed'
        ? currentOccurrence.completedAt ?? currentOccurrence.dueAt
        : undefined,
  };

  const savedState = persistState(state);
  return buildRoutineListItems(savedState);
};

const snoozeCurrentRoutine = ({
  routineId,
  minutes,
}: RoutineSnoozeRequest): RoutineListItem[] => {
  const state = getLiveState();
  const currentOccurrence = getCurrentOccurrenceForRoutine(state, routineId);

  if (!currentOccurrence) {
    throw new Error('Routine does not have an active occurrence right now.');
  }

  if (currentOccurrence.status !== 'pending') {
    throw new Error('Only pending routine cycles can be snoozed.');
  }

  if (minutes <= 0) {
    throw new Error('Snooze length must be longer than 0 minutes.');
  }

  const occurrenceIndex = state.routineOccurrences.findIndex(
    (occurrence) => occurrence.id === currentOccurrence.id,
  );

  if (occurrenceIndex === -1) {
    throw new Error('Routine occurrence not found.');
  }

  state.routineOccurrences[occurrenceIndex] = {
    ...state.routineOccurrences[occurrenceIndex],
    reminderAt: new Date(Date.now() + minutes * 60_000).toISOString(),
  };

  const savedState = persistState(state);
  void checkDueReminders();

  return buildRoutineListItems(savedState);
};

const getRoutineHistory = (routineId: string): RoutineHistoryPayload => {
  const state = getLiveState();
  const routine = state.routineTemplates.find((template) => template.id === routineId);

  if (!routine) {
    throw new Error('Routine not found.');
  }

  return {
    routine,
    occurrences: sortOccurrencesDesc(
      state.routineOccurrences.filter((occurrence) => occurrence.routineId === routineId),
    ),
  };
};

const getRoutineHistorySummary = (routineId: string): RoutineHistorySummary => {
  const state = getLiveState();
  const occurrences = state.routineOccurrences.filter(
    (occurrence) => occurrence.routineId === routineId,
  );

  if (!state.routineTemplates.some((routine) => routine.id === routineId)) {
    throw new Error('Routine not found.');
  }

  return buildRoutineSummary(routineId, occurrences);
};

const getHistoryDay = (date: string): HistoryDayPayload => {
  const state = getLiveState();
  const routinesById = new Map(
    state.routineTemplates.map((routine) => [routine.id, routine]),
  );
  const tasks = sortTasks(
    state.oneOffTasks.filter(
      (task) =>
        task.status === 'completed' &&
        task.completedAt &&
        toLocalDateString(new Date(task.completedAt)) === date,
    ),
  );
  const routineEntries: RoutineHistoryEntry[] = sortOccurrencesAsc(
    state.routineOccurrences.filter(
      (occurrence) =>
        occurrence.scheduledDate === date && occurrence.status !== 'pending',
    ),
  )
    .map((occurrence) => {
      const routine = routinesById.get(occurrence.routineId);

      if (!routine) {
        return null;
      }

      return {
        routine,
        occurrence,
      };
    })
    .filter((entry): entry is RoutineHistoryEntry => Boolean(entry));

  return {
    date,
    tasks,
    routineEntries,
  };
};

const createTrayIcon = () => {
  const iconMarkup = `
    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
      <defs>
        <linearGradient id="trayGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#A63CF2" />
          <stop offset="100%" stop-color="#E33A67" />
        </linearGradient>
      </defs>
      <rect x="8" y="8" width="48" height="48" rx="14" fill="url(#trayGradient)"/>
      <path d="M20 25h24" stroke="#FFF7FF" stroke-width="6" stroke-linecap="round"/>
      <path d="M20 34h16" stroke="#FFF7FF" stroke-width="6" stroke-linecap="round"/>
      <path d="M20 43h24" stroke="#FFF7FF" stroke-width="6" stroke-linecap="round"/>
    </svg>
  `;
  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(iconMarkup).toString(
    'base64',
  )}`;

  return nativeImage.createFromDataURL(dataUrl).resize({
    width: 16,
    height: 16,
  });
};

const flushSelection = (): void => {
  if (!mainWindow || mainWindow.isDestroyed() || !pendingSelection) {
    return;
  }

  mainWindow.webContents.send('app:selected-entity', pendingSelection);
  pendingSelection = null;
};

const showMainWindow = (selection?: AppSelection): void => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = createMainWindow();
  }

  if (selection) {
    pendingSelection = selection;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.show();
  mainWindow.focus();
  setTimeout(flushSelection, 60);
};

const createMainWindow = (): BrowserWindow => {
  const window = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 980,
    minHeight: 680,
    show: false,
    backgroundColor: WINDOW_BACKGROUND,
    title: APP_NAME,
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
    },
  });

  window.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);

  window.once('ready-to-show', () => {
    window.show();
  });

  window.webContents.on('did-finish-load', () => {
    flushSelection();
  });

  window.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      window.hide();
    }
  });

  window.on('closed', () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });

  return window;
};

const createQuickAddWindow = (): BrowserWindow => {
  const window = new BrowserWindow({
    width: 430,
    height: 640,
    minWidth: 400,
    maxWidth: 520,
    minHeight: 560,
    maxHeight: 760,
    resizable: false,
    show: false,
    alwaysOnTop: true,
    autoHideMenuBar: true,
    skipTaskbar: true,
    backgroundColor: QUICK_ADD_BACKGROUND,
    title: 'Quick Add',
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
    },
  });

  window.loadURL(`${MAIN_WINDOW_WEBPACK_ENTRY}${QUICK_ADD_HASH}`);

  window.once('ready-to-show', () => {
    window.center();
    window.show();
    window.focus();
  });

  window.on('blur', () => {
    if (!window.isDestroyed() && !window.webContents.isDevToolsOpened()) {
      window.setAlwaysOnTop(true, 'floating');
    }
  });

  window.on('closed', () => {
    if (quickAddWindow === window) {
      quickAddWindow = null;
    }
  });

  return window;
};

const openQuickAddWindow = (): void => {
  if (!quickAddWindow || quickAddWindow.isDestroyed()) {
    quickAddWindow = createQuickAddWindow();
    return;
  }

  if (quickAddWindow.isVisible() && quickAddWindow.isFocused()) {
    quickAddWindow.hide();
    return;
  }

  if (quickAddWindow.isMinimized()) {
    quickAddWindow.restore();
  }

  quickAddWindow.center();
  quickAddWindow.show();
  quickAddWindow.focus();
};

const showTaskReminder = (task: Task): void => {
  if (!Notification.isSupported()) {
    return;
  }

  const body = task.dueAt
    ? `${task.title}\nDue ${reminderFormatter.format(new Date(task.dueAt))}`
    : `${task.title}\nOpen the app to take the next step.`;
  const notification = new Notification({
    title: 'Task reminder',
    body,
  });

  notification.on('click', () => {
    showMainWindow({
      kind: 'task',
      id: task.id,
    });
  });

  notification.show();
};

const showRoutineReminder = (
  routine: RoutineTemplate,
  occurrence: RoutineOccurrence,
): void => {
  if (!Notification.isSupported()) {
    return;
  }

  const body = `${routine.title}\nDue ${reminderFormatter.format(new Date(occurrence.dueAt))}`;
  const notification = new Notification({
    title: 'Routine reminder',
    body,
  });

  notification.on('click', () => {
    showMainWindow({
      kind: 'routine',
      id: routine.id,
    });
  });

  notification.show();
};

const checkDueReminders = async (): Promise<void> => {
  if (!app.isReady()) {
    return;
  }

  const state = getLiveState();
  const now = Date.now();
  let didNotify = false;

  state.oneOffTasks.forEach((task) => {
    if (
      task.status !== 'pending' ||
      !task.reminderAt ||
      new Date(task.reminderAt).getTime() > now
    ) {
      return;
    }

    const reminderKey = getTaskReminderKey(task.id);

    if (state.notifiedReminders[reminderKey] === task.reminderAt) {
      return;
    }

    showTaskReminder(task);
    state.notifiedReminders[reminderKey] = task.reminderAt;
    didNotify = true;
  });

  const routinesById = new Map(
    state.routineTemplates.map((routine) => [routine.id, routine]),
  );

  state.routineOccurrences.forEach((occurrence) => {
    if (
      occurrence.status !== 'pending' ||
      !occurrence.reminderAt ||
      new Date(occurrence.reminderAt).getTime() > now
    ) {
      return;
    }

    const reminderKey = getRoutineReminderKey(occurrence.id);

    if (state.notifiedReminders[reminderKey] === occurrence.reminderAt) {
      return;
    }

    const routine = routinesById.get(occurrence.routineId);

    if (!routine) {
      return;
    }

    showRoutineReminder(routine, occurrence);
    state.notifiedReminders[reminderKey] = occurrence.reminderAt;
    didNotify = true;
  });

  if (didNotify) {
    persistState(state);
  }
};

const createTray = (): void => {
  tray = new Tray(createTrayIcon());
  tray.setToolTip(APP_NAME);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: 'Open mini window (Ctrl+Shift+A)',
        click: () => openQuickAddWindow(),
      },
      {
        label: 'Show full app',
        click: () => showMainWindow(),
      },
      {
        type: 'separator',
      },
      {
        label: 'Quit',
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ]),
  );

  tray.on('click', () => {
    openQuickAddWindow();
  });
};

const registerShortcuts = (): void => {
  globalShortcut.register(MINI_WINDOW_SHORTCUT, () => {
    openQuickAddWindow();
  });
};

ipcMain.handle('tasks:list', () => listTasks());
ipcMain.handle('tasks:create', (_event, input: TaskDraft) => createTask(input));
ipcMain.handle('tasks:update', (_event, input: TaskUpdate) => updateTask(input));
ipcMain.handle('tasks:complete', (_event, taskId: string) => completeTask(taskId));
ipcMain.handle('tasks:reopen', (_event, taskId: string) => reopenTask(taskId));
ipcMain.handle('tasks:delete', (_event, taskId: string) => deleteTask(taskId));
ipcMain.handle('tasks:setCompletionDate', (_event, input: TaskCompletionDateUpdate) =>
  setTaskCompletionDate(input),
);
ipcMain.handle('tasks:snooze', (_event, request: SnoozeRequest) => snoozeTask(request));

ipcMain.handle('routines:list', () => listRoutines());
ipcMain.handle('routines:create', (_event, input: RoutineDraft) => createRoutine(input));
ipcMain.handle('routines:update', (_event, input: RoutineUpdate) => updateRoutine(input));
ipcMain.handle('routines:completeCurrent', (_event, routineId: string) =>
  completeCurrentRoutine(routineId),
);
ipcMain.handle('routines:reopenCurrent', (_event, routineId: string) =>
  reopenCurrentRoutine(routineId),
);
ipcMain.handle('routines:delete', (_event, routineId: string) => deleteRoutine(routineId));
ipcMain.handle(
  'routines:updateOccurrenceHistory',
  (_event, input: RoutineOccurrenceHistoryUpdate) => updateRoutineOccurrenceHistory(input),
);
ipcMain.handle(
  'routines:snoozeCurrent',
  (_event, request: RoutineSnoozeRequest) => snoozeCurrentRoutine(request),
);
ipcMain.handle('routines:history', (_event, routineId: string) =>
  getRoutineHistory(routineId),
);
ipcMain.handle('routines:historySummary', (_event, routineId: string) =>
  getRoutineHistorySummary(routineId),
);

ipcMain.handle('history:day', (_event, date: string) => getHistoryDay(date));

ipcMain.handle('app:show', () => {
  showMainWindow();
});
ipcMain.handle('quickAdd:open', () => {
  openQuickAddWindow();
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('activate', () => {
  showMainWindow();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();

  if (reminderInterval) {
    clearInterval(reminderInterval);
    reminderInterval = null;
  }
});

app.on('window-all-closed', () => {
  // Keep the app alive in the tray so reminders can continue firing.
});

void app.whenReady().then(() => {
  mainWindow = createMainWindow();
  createTray();
  registerShortcuts();
  getLiveState();

  powerMonitor.on('resume', () => {
    void checkDueReminders();
  });

  reminderInterval = setInterval(() => {
    void checkDueReminders();
  }, REMINDER_CHECK_INTERVAL_MS);

  void checkDueReminders();
});
