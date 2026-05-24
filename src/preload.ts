import { contextBridge, ipcRenderer } from 'electron';
import type {
  AccountCredentials,
  AccountStatus,
  AppDndMode,
  AppInfo,
  AppPopupDraft,
  AppPopupEvent,
  AppSelection,
  EmergencyPasswordGrant,
  EmergencyPasswordGrantDraft,
  FriendNetworkStatus,
  HistoryDayPayload,
  PopupCloseReason,
  PublicSharedTask,
  RoutineDraft,
  RoutineHistoryPayload,
  RoutineHistorySummary,
  RoutineListItem,
  RoutineOccurrenceHistoryUpdate,
  RoutineUpdate,
  SavedFriendContact,
  SavedFriendContactDraft,
  Task,
  TaskCompletionDateUpdate,
  TaskDraft,
  TaskUpdate,
  TimeBlock,
  TimeBlockDraft,
  TimeBlockUpdate,
  WebsiteTaskEditSuggestion,
  TodoAppApi,
  WebsiteTaskSubmission,
} from './types';

type SelectionListener = (selection: AppSelection) => void;

const taskChangeListeners = new Set<() => void>();
const timeBlockChangeListeners = new Set<() => void>();
const routineChangeListeners = new Set<() => void>();
const submissionChangeListeners = new Set<() => void>();
const editSuggestionChangeListeners = new Set<() => void>();
const friendNetworkChangeListeners = new Set<() => void>();
const accountChangeListeners = new Set<() => void>();
const selectionListeners = new Set<SelectionListener>();

let queuedSelection: AppSelection | null = null;

ipcRenderer.on('tasks:changed', () => {
  taskChangeListeners.forEach((listener) => listener());
});

ipcRenderer.on('timeBlocks:changed', () => {
  timeBlockChangeListeners.forEach((listener) => listener());
});

ipcRenderer.on('routines:changed', () => {
  routineChangeListeners.forEach((listener) => listener());
});

ipcRenderer.on('submissions:changed', () => {
  submissionChangeListeners.forEach((listener) => listener());
});

ipcRenderer.on('editSuggestions:changed', () => {
  editSuggestionChangeListeners.forEach((listener) => listener());
});

ipcRenderer.on('friendNetwork:changed', () => {
  friendNetworkChangeListeners.forEach((listener) => listener());
});

ipcRenderer.on('account:changed', () => {
  accountChangeListeners.forEach((listener) => listener());
});

ipcRenderer.on('app:selected-entity', (_event, selection: AppSelection) => {
  queuedSelection = selection;
  selectionListeners.forEach((listener) => listener(selection));
});

const api: TodoAppApi = {
  account: {
    status: () => ipcRenderer.invoke('account:status') as Promise<AccountStatus>,
    signUp: (credentials: AccountCredentials) =>
      ipcRenderer.invoke('account:signUp', credentials) as Promise<AccountStatus>,
    signIn: (credentials: AccountCredentials) =>
      ipcRenderer.invoke('account:signIn', credentials) as Promise<AccountStatus>,
    signOut: () => ipcRenderer.invoke('account:signOut') as Promise<AccountStatus>,
    syncNow: () => ipcRenderer.invoke('account:syncNow') as Promise<AccountStatus>,
    setDisplayName: (displayName: string) =>
      ipcRenderer.invoke('account:setDisplayName', displayName) as Promise<AccountStatus>,
    onChanged: (listener: () => void) => {
      accountChangeListeners.add(listener);

      return () => {
        accountChangeListeners.delete(listener);
      };
    },
  },
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
  timeBlocks: {
    list: () => ipcRenderer.invoke('timeBlocks:list') as Promise<TimeBlock[]>,
    create: (input: TimeBlockDraft) =>
      ipcRenderer.invoke('timeBlocks:create', input) as Promise<TimeBlock[]>,
    update: (input: TimeBlockUpdate) =>
      ipcRenderer.invoke('timeBlocks:update', input) as Promise<TimeBlock[]>,
    delete: (id: string) =>
      ipcRenderer.invoke('timeBlocks:delete', id) as Promise<TimeBlock[]>,
    onChanged: (listener: () => void) => {
      timeBlockChangeListeners.add(listener);

      return () => {
        timeBlockChangeListeners.delete(listener);
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
  submissions: {
    list: () =>
      ipcRenderer.invoke('submissions:list') as Promise<WebsiteTaskSubmission[]>,
    accept: (id: string) =>
      ipcRenderer.invoke('submissions:accept', id) as Promise<WebsiteTaskSubmission[]>,
    dismiss: (id: string) =>
      ipcRenderer.invoke('submissions:dismiss', id) as Promise<WebsiteTaskSubmission[]>,
    onChanged: (listener: () => void) => {
      submissionChangeListeners.add(listener);

      return () => {
        submissionChangeListeners.delete(listener);
      };
    },
  },
  editSuggestions: {
    list: () =>
      ipcRenderer.invoke('editSuggestions:list') as Promise<WebsiteTaskEditSuggestion[]>,
    accept: (id: string) =>
      ipcRenderer.invoke('editSuggestions:accept', id) as Promise<WebsiteTaskEditSuggestion[]>,
    dismiss: (id: string) =>
      ipcRenderer.invoke('editSuggestions:dismiss', id) as Promise<WebsiteTaskEditSuggestion[]>,
    onChanged: (listener: () => void) => {
      editSuggestionChangeListeners.add(listener);

      return () => {
        editSuggestionChangeListeners.delete(listener);
      };
    },
  },
  friendNetwork: {
    status: () =>
      ipcRenderer.invoke('friendNetwork:status') as Promise<FriendNetworkStatus>,
    setDndMode: (mode: AppDndMode) =>
      ipcRenderer.invoke('friendNetwork:setDndMode', mode) as Promise<FriendNetworkStatus>,
    listContacts: () =>
      ipcRenderer.invoke('friendNetwork:listContacts') as Promise<SavedFriendContact[]>,
    saveContact: (input: SavedFriendContactDraft) =>
      ipcRenderer.invoke('friendNetwork:saveContact', input) as Promise<SavedFriendContact[]>,
    deleteContact: (id: string) =>
      ipcRenderer.invoke('friendNetwork:deleteContact', id) as Promise<SavedFriendContact[]>,
    listPublicTasksForFriend: (friendAccountId: string) =>
      ipcRenderer.invoke(
        'friendNetwork:listPublicTasksForFriend',
        friendAccountId,
      ) as Promise<PublicSharedTask[]>,
    listEmergencyPasswords: () =>
      ipcRenderer.invoke('friendNetwork:listEmergencyPasswords') as Promise<
        EmergencyPasswordGrant[]
      >,
    listEmergencyPasswordsForMe: () =>
      ipcRenderer.invoke('friendNetwork:listEmergencyPasswordsForMe') as Promise<
        EmergencyPasswordGrant[]
      >,
    saveEmergencyPassword: (input: EmergencyPasswordGrantDraft) =>
      ipcRenderer.invoke('friendNetwork:saveEmergencyPassword', input) as Promise<
        EmergencyPasswordGrant[]
      >,
    deleteEmergencyPassword: (id: string) =>
      ipcRenderer.invoke('friendNetwork:deleteEmergencyPassword', id) as Promise<
        EmergencyPasswordGrant[]
      >,
    listPendingEvents: () =>
      ipcRenderer.invoke('friendNetwork:listPendingEvents') as Promise<AppPopupEvent[]>,
    listRecentEvents: () =>
      ipcRenderer.invoke('friendNetwork:listRecentEvents') as Promise<AppPopupEvent[]>,
    sendPopup: (input: AppPopupDraft) =>
      ipcRenderer.invoke('friendNetwork:sendPopup', input) as Promise<void>,
    acceptEvent: (id: string) =>
      ipcRenderer.invoke('friendNetwork:acceptEvent', id) as Promise<AppPopupEvent[]>,
    denyEvent: (id: string) =>
      ipcRenderer.invoke('friendNetwork:denyEvent', id) as Promise<AppPopupEvent[]>,
    setRecentPopupPassword: (password: string) =>
      ipcRenderer.invoke(
        'friendNetwork:setRecentPopupPassword',
        password,
      ) as Promise<FriendNetworkStatus>,
    verifyRecentPopupPassword: (password: string) =>
      ipcRenderer.invoke(
        'friendNetwork:verifyRecentPopupPassword',
        password,
      ) as Promise<boolean>,
    onChanged: (listener: () => void) => {
      friendNetworkChangeListeners.add(listener);

      return () => {
        friendNetworkChangeListeners.delete(listener);
      };
    },
  },
  app: {
    info: () => ipcRenderer.invoke('app:info') as Promise<AppInfo>,
    show: () => ipcRenderer.invoke('app:show') as Promise<void>,
    showSelection: (selection: AppSelection) =>
      ipcRenderer.invoke('app:showSelection', selection) as Promise<void>,
    closeCurrentWindow: (reason?: PopupCloseReason) =>
      ipcRenderer.invoke('app:closeCurrentWindow', reason) as Promise<void>,
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
