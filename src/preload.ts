import { contextBridge, ipcRenderer } from 'electron';
import type {
  AppSelection,
  HistoryDayPayload,
  RoutineDraft,
  RoutineHistoryPayload,
  RoutineHistorySummary,
  RoutineListItem,
  RoutineOccurrenceHistoryUpdate,
  RoutineUpdate,
  Task,
  TaskCompletionDateUpdate,
  TaskDraft,
  TaskUpdate,
  TodoAppApi,
} from './types';

type SelectionListener = (selection: AppSelection) => void;

const taskChangeListeners = new Set<() => void>();
const routineChangeListeners = new Set<() => void>();
const selectionListeners = new Set<SelectionListener>();

let queuedSelection: AppSelection | null = null;

ipcRenderer.on('tasks:changed', () => {
  taskChangeListeners.forEach((listener) => listener());
});

ipcRenderer.on('routines:changed', () => {
  routineChangeListeners.forEach((listener) => listener());
});

ipcRenderer.on('app:selected-entity', (_event, selection: AppSelection) => {
  queuedSelection = selection;
  selectionListeners.forEach((listener) => listener(selection));
});

const api: TodoAppApi = {
  tasks: {
    list: () => ipcRenderer.invoke('tasks:list') as Promise<Task[]>,
    create: (input: TaskDraft) =>
      ipcRenderer.invoke('tasks:create', input) as Promise<Task>,
    update: (input: TaskUpdate) =>
      ipcRenderer.invoke('tasks:update', input) as Promise<Task[]>,
    complete: (id: string) =>
      ipcRenderer.invoke('tasks:complete', id) as Promise<Task[]>,
    reopen: (id: string) =>
      ipcRenderer.invoke('tasks:reopen', id) as Promise<Task[]>,
    delete: (id: string) =>
      ipcRenderer.invoke('tasks:delete', id) as Promise<Task[]>,
    setCompletionDate: (input: TaskCompletionDateUpdate) =>
      ipcRenderer.invoke('tasks:setCompletionDate', input) as Promise<Task[]>,
    snooze: (id: string, minutes: number) =>
      ipcRenderer.invoke('tasks:snooze', { id, minutes }) as Promise<Task[]>,
    onChanged: (listener: () => void) => {
      taskChangeListeners.add(listener);

      return () => {
        taskChangeListeners.delete(listener);
      };
    },
  },
  routines: {
    list: () => ipcRenderer.invoke('routines:list') as Promise<RoutineListItem[]>,
    create: (input: RoutineDraft) =>
      ipcRenderer.invoke('routines:create', input) as Promise<RoutineListItem>,
    update: (input: RoutineUpdate) =>
      ipcRenderer.invoke('routines:update', input) as Promise<RoutineListItem[]>,
    completeCurrent: (routineId: string) =>
      ipcRenderer.invoke('routines:completeCurrent', routineId) as Promise<RoutineListItem[]>,
    reopenCurrent: (routineId: string) =>
      ipcRenderer.invoke('routines:reopenCurrent', routineId) as Promise<RoutineListItem[]>,
    delete: (routineId: string) =>
      ipcRenderer.invoke('routines:delete', routineId) as Promise<RoutineListItem[]>,
    updateOccurrenceHistory: (input: RoutineOccurrenceHistoryUpdate) =>
      ipcRenderer.invoke('routines:updateOccurrenceHistory', input) as Promise<RoutineListItem[]>,
    snoozeCurrent: (routineId: string, minutes: number) =>
      ipcRenderer.invoke('routines:snoozeCurrent', {
        routineId,
        minutes,
      }) as Promise<RoutineListItem[]>,
    history: (routineId: string) =>
      ipcRenderer.invoke('routines:history', routineId) as Promise<RoutineHistoryPayload>,
    historySummary: (routineId: string) =>
      ipcRenderer.invoke('routines:historySummary', routineId) as Promise<RoutineHistorySummary>,
    onChanged: (listener: () => void) => {
      routineChangeListeners.add(listener);

      return () => {
        routineChangeListeners.delete(listener);
      };
    },
  },
  history: {
    day: (date: string) =>
      ipcRenderer.invoke('history:day', date) as Promise<HistoryDayPayload>,
  },
  app: {
    show: () => ipcRenderer.invoke('app:show') as Promise<void>,
    showSelection: (selection: AppSelection) =>
      ipcRenderer.invoke('app:showSelection', selection) as Promise<void>,
    previewReminderPopup: () =>
      ipcRenderer.invoke('app:previewReminderPopup') as Promise<void>,
    closeCurrentWindow: () =>
      ipcRenderer.invoke('app:closeCurrentWindow') as Promise<void>,
    onSelection: (listener: SelectionListener) => {
      selectionListeners.add(listener);

      if (queuedSelection) {
        const initialSelection = queuedSelection;
        queuedSelection = null;
        setTimeout(() => listener(initialSelection), 0);
      }

      return () => {
        selectionListeners.delete(listener);
      };
    },
  },
  quickAdd: {
    open: () => ipcRenderer.invoke('quickAdd:open') as Promise<void>,
  },
};

contextBridge.exposeInMainWorld('todoApp', api);
