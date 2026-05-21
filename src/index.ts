import os from 'node:os';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  powerMonitor,
  screen,
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
import {
  createSupabaseMessageService,
  type SupabaseMessageRow,
} from './supabaseMessages';
import {
  createSupabaseSharedTaskService,
  getSelectionFromSharedTaskId,
  type SupabaseSharedTaskService,
} from './supabaseSharedTasks';
import {
  createSupabasePresenceService,
} from './supabasePresence';
import {
  createSupabaseTaskSubmissionService,
  type SupabaseTaskSubmissionService,
} from './supabaseTaskSubmissions';
import {
  createSupabaseTaskEditSuggestionService,
  type SupabaseTaskEditSuggestionService,
} from './supabaseTaskEditSuggestions';
import {
  createSupabaseFriendNetworkService,
  type SupabaseFriendNetworkService,
} from './supabaseFriendNetwork';
import {
  createSupabaseAccountSyncService,
  type AccountSyncSession,
  type SupabaseAccountSyncService,
} from './supabaseAccountSync';
import type {
  AccountCredentials,
  AccountStatus,
  AppInfo,
  AppDndMode,
  AppPopupDraft,
  AppPopupEvent,
  AppPopupEventStatus,
  AppVariant,
  AppSelection,
  FriendCodeAlias,
  FriendNetworkStatus,
  HistoryDayPayload,
  PlannerState,
  PopupCloseReason,
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
  TaskPriority,
  TaskUpdate,
  TimeBlock,
  TimeBlockDraft,
  TimeBlockUpdate,
  SavedFriendContact,
  SavedFriendContactDraft,
  WebsiteTaskEditSuggestion,
  WebsiteTaskSubmission,
} from './types';

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

if (require('electron-squirrel-startup')) {
  app.quit();
}

type PersistedState = PlannerState;

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

const CURRENT_SCHEMA_VERSION = 3;
const APP_USER_MODEL_ID = 'com.arkave.todolist';
const APP_NAME = 'To Do List';
const TODO_APP_VARIANT_ENV = 'TODO_APP_VARIANT';
const TODO_PROFILE_ENV = 'TODO_PROFILE';
const MINI_WINDOW_SHORTCUT = 'CommandOrControl+Shift+A';
const QUICK_ADD_HASH = '#quick-add';
const REMINDER_POPUP_HASH = '#reminder-popup';
const REMINDER_CHECK_INTERVAL_MS = 10_000;
const WINDOW_BACKGROUND = '#050505';
const QUICK_ADD_BACKGROUND = '#0b0b0b';
const REMINDER_POPUP_BACKGROUND = '#0b0b0b';
const MEGA_POPUP_BACKGROUND = '#000000';
const REMINDER_POPUP_WIDTH = 520;
const REMINDER_POPUP_HEIGHT = 320;
const REMINDER_POPUP_MARGIN = 18;
const REMINDER_POPUP_STACK_GAP = 18;
const MAX_VISIBLE_REMINDER_POPUPS = 3;
const SUPABASE_PRESENCE_HEARTBEAT_INTERVAL_MS = 30_000;
const SUPABASE_FRIEND_NETWORK_POLL_INTERVAL_MS = 10_000;
const SUPABASE_PRESENCE_DEVICE_ID_ENV = 'SUPABASE_PRESENCE_DEVICE_ID';
const SUPABASE_PRESENCE_DEVICE_NAME_ENV = 'SUPABASE_PRESENCE_DEVICE_NAME';
const WEBSITE_EMERGENCY_MESSAGE_SOURCE = 'website-emergency';
const EMERGENCY_POPUP_PASSWORD_ENV = 'EMERGENCY_POPUP_PASSWORD';
const EMERGENCY_POPUP_PASSWORDS_ENV = 'EMERGENCY_POPUP_PASSWORDS';
const VITE_EMERGENCY_POPUP_PASSWORD_ENV = 'VITE_EMERGENCY_POPUP_PASSWORD';
const VITE_EMERGENCY_POPUP_PASSWORDS_ENV = 'VITE_EMERGENCY_POPUP_PASSWORDS';
const LEGACY_EMERGENCY_POPUP_PASSWORD_HASH_ENV = 'VITE_EMERGENCY_POPUP_PASSWORD_HASH';
const LEGACY_EMERGENCY_POPUP_PASSWORD_HASHES_ENV = 'VITE_EMERGENCY_POPUP_PASSWORD_HASHES';
const FRIEND_NETWORK_DND_MODE_KEY = 'friendNetworkDndMode';
const FRIEND_NETWORK_RECENT_PASSWORD_KEY = 'friendNetworkRecentPopupPassword';
const ACCOUNT_ID_KEY = 'syncAccountId';
const ACCOUNT_USERNAME_KEY = 'syncAccountUsername';
const ACCOUNT_PASSWORD_HASH_KEY = 'syncAccountPasswordHash';
const ACCOUNT_LAST_SYNCED_AT_KEY = 'syncAccountLastSyncedAt';
const ACCOUNT_SYNC_DEBOUNCE_MS = 1_200;
const ACCOUNT_SYNC_PULL_INTERVAL_MS = 30_000;

const getAppVariant = (): AppVariant =>
  process.env[TODO_APP_VARIANT_ENV]?.trim().toLowerCase() === 'user' ? 'user' : 'dev';

const appVariant = getAppVariant();
const isDevVariant = (): boolean => appVariant === 'dev';

const getAppInfo = (): AppInfo => ({
  variant: appVariant,
  isDevVariant: isDevVariant(),
});

const getLocalDevProfileName = (): string | undefined => {
  const profileName = process.env[TODO_PROFILE_ENV]?.trim();
  return profileName ? profileName.slice(0, 40) : undefined;
};

const toStorageSafeProfileName = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'default';

const localDevProfileName = getLocalDevProfileName();
const localDevProfileStorageName = localDevProfileName
  ? toStorageSafeProfileName(localDevProfileName)
  : undefined;

if (localDevProfileStorageName) {
  app.setPath(
    'userData',
    path.join(app.getPath('appData'), `${APP_NAME}-${localDevProfileStorageName}`),
  );
}

const taskStore = new Store<Record<string, unknown>>({
  name: 'tasks',
  clearInvalidConfig: true,
  defaults: {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    oneOffTasks: [],
    timeBlocks: [],
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
let reminderPopupWindows: ReminderPopupWindowEntry[] = [];
let reminderPopupQueue: QueuedReminderPopup[] = [];
let megaPopupWindow: BrowserWindow | null = null;
const shownWebsiteSubmissionPopupIds = new Set<string>();
const shownWebsiteEditSuggestionPopupIds = new Set<string>();
let supabaseMessageServiceStop: (() => Promise<void>) | null = null;
let supabaseMessageServiceRefresh: (() => Promise<void>) | null = null;
let supabaseSharedTaskService: SupabaseSharedTaskService | null = null;
let supabaseTaskSubmissionService: SupabaseTaskSubmissionService | null = null;
let supabaseTaskEditSuggestionService: SupabaseTaskEditSuggestionService | null = null;
let supabaseFriendNetworkService: SupabaseFriendNetworkService | null = null;
let supabaseFriendNetworkMissingEnvKeys: string[] = [];
let supabaseFriendNetworkPollInterval: NodeJS.Timeout | null = null;
let supabaseAccountSyncService: SupabaseAccountSyncService | null = null;
let supabaseAccountSyncMissingEnvKeys: string[] = [];
let accountSyncDebounceTimer: NodeJS.Timeout | null = null;
let accountSyncPullInterval: NodeJS.Timeout | null = null;
let isApplyingRemotePlannerState = false;
let isSavingRemotePlannerState = false;
let accountSyncError: string | undefined;
let savedFriendContacts: SavedFriendContact[] = [];
let hasLoadedSavedFriendContacts = false;
let isAutoTimeBlockDndActive = false;
let supabasePresenceServiceHeartbeat: (() => Promise<void>) | null = null;
let supabasePresenceServiceStop: (() => Promise<void>) | null = null;

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

const isStoredWindowBounds = (value: unknown): value is StoredWindowBounds =>
  isRecord(value) &&
  typeof value.x === 'number' &&
  typeof value.y === 'number' &&
  typeof value.width === 'number' &&
  typeof value.height === 'number';

type StoredWindowBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type ReminderPopupPayload = {
  title: string;
  body: string;
  selection?: AppSelection;
  contextLabel?: string;
  contextValue?: string;
  presentation?: 'standard' | 'mega';
  queuedCount?: number;
  sourceEventId?: string;
};

type ReminderPopupWindowEntry = {
  id: string;
  window: BrowserWindow;
  displayId: number;
  payload: ReminderPopupPayload;
};

type QueuedReminderPopup = {
  id: string;
  payload: ReminderPopupPayload;
};

const normalizeOptionalText = (value?: string | null): string | undefined => {
  const trimmedValue = value?.trim();
  return trimmedValue ? trimmedValue : undefined;
};

const hashSecret = (value: string): string =>
  createHash('sha256').update(value).digest('hex');

const splitConfiguredSecrets = (value?: string): string[] =>
  (value ?? '')
    .split(/[\n,;]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);

const getEmergencyPopupPasswordSecrets = (): string[] => [
  ...splitConfiguredSecrets(process.env[EMERGENCY_POPUP_PASSWORDS_ENV]),
  ...splitConfiguredSecrets(process.env[EMERGENCY_POPUP_PASSWORD_ENV]),
  ...splitConfiguredSecrets(process.env[VITE_EMERGENCY_POPUP_PASSWORDS_ENV]),
  ...splitConfiguredSecrets(process.env[VITE_EMERGENCY_POPUP_PASSWORD_ENV]),
  ...splitConfiguredSecrets(process.env[LEGACY_EMERGENCY_POPUP_PASSWORD_HASHES_ENV]),
  ...splitConfiguredSecrets(process.env[LEGACY_EMERGENCY_POPUP_PASSWORD_HASH_ENV]),
];

const verifyEmergencyPopupPassword = (password?: string): boolean => {
  const submittedSecret = normalizeOptionalText(password);

  if (!submittedSecret) {
    return false;
  }

  const submittedHash = hashSecret(submittedSecret);

  return getEmergencyPopupPasswordSecrets().some(
    (configuredSecret) =>
      submittedSecret === configuredSecret || submittedHash === configuredSecret,
  );
};

const getStoredStringValue = (key: string): string | undefined => {
  const value = taskStoreAccess.get(key, '');
  return typeof value === 'string' ? normalizeOptionalText(value) : undefined;
};

const getStoredAccountSession = (): AccountSyncSession | undefined => {
  const accountId = getStoredStringValue(ACCOUNT_ID_KEY);
  const username = getStoredStringValue(ACCOUNT_USERNAME_KEY);
  const passwordHash = getStoredStringValue(ACCOUNT_PASSWORD_HASH_KEY);

  if (!accountId || !username || !passwordHash) {
    return undefined;
  }

  return {
    accountId,
    username,
    passwordHash,
  };
};

const storeAccountSession = (session: AccountSyncSession): void => {
  taskStoreAccess.set(ACCOUNT_ID_KEY, session.accountId);
  taskStoreAccess.set(ACCOUNT_USERNAME_KEY, session.username);
  taskStoreAccess.set(ACCOUNT_PASSWORD_HASH_KEY, session.passwordHash);
};

const clearAccountSession = (): void => {
  taskStoreAccess.set(ACCOUNT_ID_KEY, '');
  taskStoreAccess.set(ACCOUNT_USERNAME_KEY, '');
  taskStoreAccess.set(ACCOUNT_PASSWORD_HASH_KEY, '');
  taskStoreAccess.set(ACCOUNT_LAST_SYNCED_AT_KEY, '');
  savedFriendContacts = [];
};

const getAccountStatus = (): AccountStatus => {
  const session = getStoredAccountSession();

  return {
    isConfigured: Boolean(supabaseAccountSyncService),
    missingEnvKeys: supabaseAccountSyncMissingEnvKeys,
    session: session
      ? {
          accountId: session.accountId,
          username: session.username,
        }
      : undefined,
    lastSyncedAt: getStoredStringValue(ACCOUNT_LAST_SYNCED_AT_KEY),
    syncError: accountSyncError,
  };
};

const getSupabasePresenceDeviceId = (): string => {
  const configuredDeviceId = localDevProfileStorageName
    ? undefined
    : normalizeOptionalText(process.env[SUPABASE_PRESENCE_DEVICE_ID_ENV]);

  if (configuredDeviceId) {
    return configuredDeviceId;
  }

  const storedDeviceId = getStoredStringValue('supabasePresenceDeviceId');

  if (storedDeviceId) {
    return storedDeviceId;
  }

  const generatedDeviceId = localDevProfileStorageName
    ? `profile-${localDevProfileStorageName}-${randomUUID()}`
    : `laptop-${randomUUID()}`;
  taskStoreAccess.set('supabasePresenceDeviceId', generatedDeviceId);
  return generatedDeviceId;
};

const getSupabasePresenceDeviceName = (): string => {
  const configuredDeviceName = normalizeOptionalText(
    process.env[SUPABASE_PRESENCE_DEVICE_NAME_ENV],
  );

  if (localDevProfileName) {
    return configuredDeviceName
      ? `${configuredDeviceName} (${localDevProfileName})`
      : `${os.hostname()} (${localDevProfileName})`;
  }

  return configuredDeviceName ?? `${os.hostname()} (${APP_NAME})`;
};

const isAppDndMode = (value: unknown): value is AppDndMode =>
  value === 'off' || value === 'quiet' || value === 'full';

const getAppDndMode = (): AppDndMode => {
  const storedDndMode = taskStoreAccess.get(FRIEND_NETWORK_DND_MODE_KEY, 'off');
  return isAppDndMode(storedDndMode) ? storedDndMode : 'off';
};

const setAppDndMode = (mode: AppDndMode): AppDndMode => {
  isAutoTimeBlockDndActive = false;
  taskStoreAccess.set(FRIEND_NETWORK_DND_MODE_KEY, mode);

  if (mode === 'off') {
    void flushDeferredDndPopups();
  }

  return mode;
};

const syncTimeBlockDnd = (state: PersistedState, now: number): void => {
  const hasActiveFocusBlock = state.timeBlocks.some(
    (block) =>
      block.status === 'planned' &&
      block.enableDnd &&
      new Date(block.startAt).getTime() <= now &&
      new Date(block.endAt).getTime() > now,
  );
  const currentDndMode = getAppDndMode();

  if (hasActiveFocusBlock && currentDndMode === 'off') {
    taskStoreAccess.set(FRIEND_NETWORK_DND_MODE_KEY, 'quiet');
    isAutoTimeBlockDndActive = true;
    broadcastFriendNetworkChange();
    return;
  }

  if (!hasActiveFocusBlock && isAutoTimeBlockDndActive && currentDndMode === 'quiet') {
    taskStoreAccess.set(FRIEND_NETWORK_DND_MODE_KEY, 'off');
    isAutoTimeBlockDndActive = false;
    void flushDeferredDndPopups();
    broadcastFriendNetworkChange();
  }
};

const getRecentPopupPassword = (): string | undefined =>
  getStoredStringValue(FRIEND_NETWORK_RECENT_PASSWORD_KEY);

const hasRecentPopupPassword = (): boolean => Boolean(getRecentPopupPassword());

const setRecentPopupPassword = (password: string): FriendNetworkStatus => {
  const nextPassword = normalizeOptionalText(password);

  if (!nextPassword) {
    throw new Error('Please enter a password for recent popups.');
  }

  taskStoreAccess.set(FRIEND_NETWORK_RECENT_PASSWORD_KEY, nextPassword);
  broadcastFriendNetworkChange();
  return getFriendNetworkStatus();
};

const verifyRecentPopupPassword = (password: string): boolean => {
  const currentPassword = getRecentPopupPassword();

  if (!currentPassword) {
    return false;
  }

  return password === currentPassword;
};

const getFriendNetworkStatus = (): FriendNetworkStatus => ({
  isConfigured: Boolean(supabaseFriendNetworkService),
  missingEnvKeys: supabaseFriendNetworkMissingEnvKeys,
  deviceKey: getSupabasePresenceDeviceId(),
  deviceName: getSupabasePresenceDeviceName(),
  dndMode: getAppDndMode(),
  profileName: localDevProfileName,
  hasRecentPopupPassword: hasRecentPopupPassword(),
});

const requireSupabaseFriendNetworkService = (): SupabaseFriendNetworkService => {
  if (!supabaseFriendNetworkService) {
    throw new Error('Supabase friend network is not configured.');
  }

  return supabaseFriendNetworkService;
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

const getTimeBlocks = (): TimeBlock[] => {
  const timeBlocks = taskStoreAccess.get('timeBlocks', []);
  return Array.isArray(timeBlocks) ? (timeBlocks as TimeBlock[]) : [];
};

const getRoutineOccurrences = (): RoutineOccurrence[] => {
  const occurrences = taskStoreAccess.get('routineOccurrences', []);
  return Array.isArray(occurrences) ? (occurrences as RoutineOccurrence[]) : [];
};

const getNotifiedReminders = (): Record<string, string> => {
  const reminders = taskStoreAccess.get('notifiedReminders', {});
  return isRecord(reminders) ? (reminders as Record<string, string>) : {};
};

const getQuickAddBounds = (): StoredWindowBounds | undefined => {
  const nextBounds = taskStoreAccess.get('quickAddBounds', undefined);
  return isStoredWindowBounds(nextBounds) ? nextBounds : undefined;
};

const persistQuickAddBounds = (window: BrowserWindow): void => {
  if (window.isDestroyed()) {
    return;
  }

  taskStoreAccess.set('quickAddBounds', window.getBounds());
};

const getState = (): PersistedState => ({
  schemaVersion: CURRENT_SCHEMA_VERSION,
  oneOffTasks: getLegacyOrCurrentTasks(),
  timeBlocks: getTimeBlocks(),
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
      window.webContents.send('timeBlocks:changed');
      window.webContents.send('routines:changed');
    }
  });
};

const broadcastSubmissionChange = (): void => {
  BrowserWindow.getAllWindows().forEach((window) => {
    if (!window.isDestroyed()) {
      window.webContents.send('submissions:changed');
    }
  });
};

const broadcastTaskEditSuggestionChange = (): void => {
  BrowserWindow.getAllWindows().forEach((window) => {
    if (!window.isDestroyed()) {
      window.webContents.send('editSuggestions:changed');
    }
  });
};

const broadcastFriendNetworkChange = (): void => {
  BrowserWindow.getAllWindows().forEach((window) => {
    if (!window.isDestroyed()) {
      window.webContents.send('friendNetwork:changed');
    }
  });
};

const broadcastAccountChange = (): void => {
  BrowserWindow.getAllWindows().forEach((window) => {
    if (!window.isDestroyed()) {
      window.webContents.send('account:changed');
    }
  });
};

const persistState = (
  state: PersistedState,
  options: { broadcast?: boolean; syncRemote?: boolean } = {
    broadcast: true,
    syncRemote: true,
  },
): PersistedState => {
  const nextState: PersistedState = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    oneOffTasks: sortTasks(state.oneOffTasks),
    timeBlocks: state.timeBlocks.slice().sort((left, right) =>
      left.startAt.localeCompare(right.startAt),
    ),
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
  taskStoreAccess.set('timeBlocks', nextState.timeBlocks);
  taskStoreAccess.set('routineTemplates', nextState.routineTemplates);
  taskStoreAccess.set('routineOccurrences', nextState.routineOccurrences);
  taskStoreAccess.set('notifiedReminders', nextState.notifiedReminders);

  if (options.broadcast !== false) {
    broadcastDataChange();
  }

  if (options.syncRemote !== false && !isApplyingRemotePlannerState) {
    scheduleAccountPlannerSync(nextState);
  }

  if (supabaseSharedTaskService) {
    supabaseSharedTaskService.scheduleSync({
      tasks: nextState.oneOffTasks,
      routines: buildRoutineListItems(nextState),
    });
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
    timeBlocks: state.timeBlocks.slice(),
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

const isPlannerStateEmpty = (state: PersistedState): boolean =>
  state.oneOffTasks.length === 0 &&
  state.timeBlocks.length === 0 &&
  state.routineTemplates.length === 0 &&
  state.routineOccurrences.length === 0;

const getAccountSyncService = (): SupabaseAccountSyncService => {
  if (!supabaseAccountSyncService) {
    throw new Error('Account sync is not configured yet.');
  }

  return supabaseAccountSyncService;
};

const updateAccountLastSyncedAt = (syncedAt: string): void => {
  taskStoreAccess.set(ACCOUNT_LAST_SYNCED_AT_KEY, syncedAt);
  accountSyncError = undefined;
  broadcastAccountChange();
};

const applyRemotePlannerState = (
  state: PersistedState,
  plannerStateUpdatedAt: string,
): void => {
  isApplyingRemotePlannerState = true;

  try {
    const reconciled = reconcileState({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      oneOffTasks: state.oneOffTasks,
      timeBlocks: state.timeBlocks,
      routineTemplates: state.routineTemplates,
      routineOccurrences: state.routineOccurrences,
      notifiedReminders: state.notifiedReminders,
    });

    persistState(reconciled.nextState, {
      broadcast: true,
      syncRemote: false,
    });
    updateAccountLastSyncedAt(plannerStateUpdatedAt);
    void checkDueReminders();
  } finally {
    isApplyingRemotePlannerState = false;
  }
};

const haveSameSavedFriendContacts = (
  currentContacts: SavedFriendContact[],
  nextContacts: SavedFriendContact[],
): boolean => JSON.stringify(currentContacts) === JSON.stringify(nextContacts);

const refreshSavedFriendContacts = async (
  options: { broadcast?: boolean } = {},
): Promise<SavedFriendContact[]> => {
  const session = getStoredAccountSession();

  if (!session || !supabaseAccountSyncService?.isConfigured) {
    const hadContacts = savedFriendContacts.length > 0;
    savedFriendContacts = [];
    hasLoadedSavedFriendContacts = true;

    if (options.broadcast && hadContacts) {
      broadcastFriendNetworkChange();
    }

    return savedFriendContacts;
  }

  const nextContacts = await supabaseAccountSyncService.listContacts(session);
  const didChange = !haveSameSavedFriendContacts(savedFriendContacts, nextContacts);
  savedFriendContacts = nextContacts;
  hasLoadedSavedFriendContacts = true;

  if (options.broadcast && didChange) {
    broadcastFriendNetworkChange();
  }

  return savedFriendContacts;
};

const pullAccountPlannerState = async (): Promise<void> => {
  const session = getStoredAccountSession();

  if (!session || !supabaseAccountSyncService?.isConfigured || isSavingRemotePlannerState) {
    return;
  }

  try {
    const remote = await supabaseAccountSyncService.loadPlannerState(session);
    const lastSyncedAt = getStoredStringValue(ACCOUNT_LAST_SYNCED_AT_KEY);

    if (remote.plannerStateUpdatedAt && remote.plannerStateUpdatedAt !== lastSyncedAt) {
      applyRemotePlannerState(remote.plannerState, remote.plannerStateUpdatedAt);
    }

    await refreshSavedFriendContacts();
  } catch (error) {
    accountSyncError = error instanceof Error ? error.message : 'Account sync could not refresh.';
    broadcastAccountChange();
  }
};

const saveAccountPlannerState = async (state: PersistedState): Promise<void> => {
  const session = getStoredAccountSession();

  if (!session || !supabaseAccountSyncService?.isConfigured || isApplyingRemotePlannerState) {
    return;
  }

  try {
    isSavingRemotePlannerState = true;
    const plannerStateUpdatedAt = await supabaseAccountSyncService.savePlannerState(
      session,
      state,
    );
    updateAccountLastSyncedAt(plannerStateUpdatedAt);
  } catch (error) {
    accountSyncError = error instanceof Error ? error.message : 'Account sync could not save.';
    broadcastAccountChange();
  } finally {
    isSavingRemotePlannerState = false;
  }
};

const scheduleAccountPlannerSync = (state: PersistedState): void => {
  if (!getStoredAccountSession() || !supabaseAccountSyncService?.isConfigured) {
    return;
  }

  if (accountSyncDebounceTimer) {
    clearTimeout(accountSyncDebounceTimer);
  }

  accountSyncDebounceTimer = setTimeout(() => {
    accountSyncDebounceTimer = null;
    void saveAccountPlannerState(state);
  }, ACCOUNT_SYNC_DEBOUNCE_MS);
};

const restartAccountSyncPolling = (): void => {
  if (accountSyncPullInterval) {
    clearInterval(accountSyncPullInterval);
    accountSyncPullInterval = null;
  }

  if (!getStoredAccountSession() || !supabaseAccountSyncService?.isConfigured) {
    return;
  }

  accountSyncPullInterval = setInterval(() => {
    void pullAccountPlannerState();
  }, ACCOUNT_SYNC_PULL_INTERVAL_MS);
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

const sortTimeBlocks = (timeBlocks: TimeBlock[]): TimeBlock[] =>
  timeBlocks.slice().sort((left, right) => left.startAt.localeCompare(right.startAt));

const normalizeTimeBlockRange = (
  startAt: string,
  endAt: string,
): { startAt: string; endAt: string } => {
  const normalizedStartAt = normalizeOptionalDateTime(startAt);
  const normalizedEndAt = normalizeOptionalDateTime(endAt);

  if (!normalizedStartAt || !normalizedEndAt) {
    throw new Error('Time blocks need a start and end time.');
  }

  if (new Date(normalizedEndAt).getTime() <= new Date(normalizedStartAt).getTime()) {
    throw new Error('A time block must end after it starts.');
  }

  return {
    startAt: normalizedStartAt,
    endAt: normalizedEndAt,
  };
};

const listTimeBlocks = (): TimeBlock[] => sortTimeBlocks(getLiveState().timeBlocks);

const createTimeBlock = (input: TimeBlockDraft): TimeBlock[] => {
  const state = getLiveState();
  const range = normalizeTimeBlockRange(input.startAt, input.endAt);

  if (input.taskId && !state.oneOffTasks.some((task) => task.id === input.taskId)) {
    throw new Error('The linked task was not found.');
  }

  state.timeBlocks.push({
    id: randomUUID(),
    title: normalizeTitle(input.title),
    createdAt: new Date().toISOString(),
    status: 'planned',
    notes: normalizeOptionalText(input.notes),
    taskId: normalizeOptionalText(input.taskId),
    enableDnd: Boolean(input.enableDnd),
    ...range,
  });

  return sortTimeBlocks(persistState(state).timeBlocks);
};

const updateTimeBlock = (input: TimeBlockUpdate): TimeBlock[] => {
  const state = getLiveState();
  const timeBlockIndex = state.timeBlocks.findIndex((block) => block.id === input.id);

  if (timeBlockIndex === -1) {
    throw new Error('Time block not found.');
  }

  const currentBlock = state.timeBlocks[timeBlockIndex];
  const range = normalizeTimeBlockRange(
    input.startAt ?? currentBlock.startAt,
    input.endAt ?? currentBlock.endAt,
  );
  const taskId =
    input.taskId === undefined
      ? currentBlock.taskId
      : input.taskId === null
      ? undefined
      : normalizeOptionalText(input.taskId);

  if (taskId && !state.oneOffTasks.some((task) => task.id === taskId)) {
    throw new Error('The linked task was not found.');
  }

  state.timeBlocks[timeBlockIndex] = {
    ...currentBlock,
    title: input.title === undefined ? currentBlock.title : normalizeTitle(input.title),
    notes:
      input.notes === undefined ? currentBlock.notes : normalizeOptionalText(input.notes),
    enableDnd:
      input.enableDnd === undefined ? currentBlock.enableDnd : Boolean(input.enableDnd),
    status: input.status ?? currentBlock.status,
    taskId,
    ...range,
  };

  return sortTimeBlocks(persistState(state).timeBlocks);
};

const deleteTimeBlock = (timeBlockId: string): TimeBlock[] => {
  const state = getLiveState();
  const nextTimeBlocks = state.timeBlocks.filter((block) => block.id !== timeBlockId);

  if (nextTimeBlocks.length === state.timeBlocks.length) {
    throw new Error('Time block not found.');
  }

  state.timeBlocks = nextTimeBlocks;
  return sortTimeBlocks(persistState(state).timeBlocks);
};

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

const listTaskSubmissions = async (): Promise<WebsiteTaskSubmission[]> => {
  if (!supabaseTaskSubmissionService) {
    return [];
  }

  return supabaseTaskSubmissionService.listPending();
};

const listTaskEditSuggestions = async (): Promise<WebsiteTaskEditSuggestion[]> => {
  if (!supabaseTaskEditSuggestionService) {
    return [];
  }

  return supabaseTaskEditSuggestionService.listPending();
};

const websiteQueueSelection: AppSelection = {
  kind: 'view',
  id: 'submissions',
};

const friendNetworkSelection: AppSelection = {
  kind: 'view',
  id: 'network',
};

const buildAcceptedSubmissionNotes = (submission: WebsiteTaskSubmission): string => {
  const originLine = submission.senderName
    ? `Submitted from website by ${submission.senderName}.`
    : 'Submitted from website.';

  if (!submission.details) {
    return originLine;
  }

  return `${originLine}\n\n${submission.details}`;
};

const getTaskSubmissionPopupPayload = (
  submission: WebsiteTaskSubmission,
): ReminderPopupPayload => ({
  title: submission.title,
  body:
    normalizeOptionalText(submission.details) ??
    'A website visitor submitted a task suggestion for you to review.',
  contextLabel: 'Website Task Suggestion',
  contextValue: normalizeOptionalText(submission.senderName),
  selection: websiteQueueSelection,
});

const getTaskEditSuggestionChangedFields = (
  suggestion: WebsiteTaskEditSuggestion,
): string[] =>
  [
    suggestion.changeTitle ? 'title' : null,
    suggestion.changeNotes ? 'description' : null,
    suggestion.changeDueAt ? 'due date' : null,
    suggestion.changeReminderAt ? 'reminder date' : null,
    suggestion.changePriority ? 'priority' : null,
  ].filter((value): value is string => Boolean(value));

const getTaskEditSuggestionPopupPayload = (
  suggestion: WebsiteTaskEditSuggestion,
): ReminderPopupPayload => ({
  title: suggestion.taskTitleSnapshot,
  body: `Suggested changes: ${getTaskEditSuggestionChangedFields(suggestion).join(', ')}.`,
  contextLabel: 'Task Edit Suggestion',
  contextValue: normalizeOptionalText(suggestion.senderName),
  selection: websiteQueueSelection,
});

const acceptTaskSubmission = async (id: string): Promise<WebsiteTaskSubmission[]> => {
  if (!supabaseTaskSubmissionService) {
    throw new Error('Website task submissions are not configured.');
  }

  const submission = await supabaseTaskSubmissionService.getPendingById(id);

  if (!submission) {
    throw new Error('Website task submission not found.');
  }

  const createdTask = createTask({
    title: submission.title,
    notes: buildAcceptedSubmissionNotes(submission),
  });

  try {
    await supabaseTaskSubmissionService.accept(id, createdTask.id);
  } catch (error) {
    deleteTask(createdTask.id);
    throw error;
  }

  broadcastSubmissionChange();
  return supabaseTaskSubmissionService.listPending();
};

const dismissTaskSubmission = async (id: string): Promise<WebsiteTaskSubmission[]> => {
  if (!supabaseTaskSubmissionService) {
    throw new Error('Website task submissions are not configured.');
  }

  const submission = await supabaseTaskSubmissionService.getPendingById(id);

  if (!submission) {
    throw new Error('Website task submission not found.');
  }

  await supabaseTaskSubmissionService.dismiss(id);
  broadcastSubmissionChange();
  return supabaseTaskSubmissionService.listPending();
};

const acceptTaskEditSuggestion = async (
  id: string,
): Promise<WebsiteTaskEditSuggestion[]> => {
  if (!supabaseTaskEditSuggestionService) {
    throw new Error('Website task edit suggestions are not configured.');
  }

  const suggestion = await supabaseTaskEditSuggestionService.getPendingById(id);

  if (!suggestion) {
    throw new Error('Website task edit suggestion not found.');
  }

  const currentTask = getLiveState().oneOffTasks.find(
    (task) => task.id === suggestion.localTaskId,
  );

  if (!currentTask) {
    throw new Error('The original local task no longer exists.');
  }

  const updatePayload: TaskUpdate = {
    id: currentTask.id,
  };

  if (suggestion.changeTitle) {
    const nextTitle = normalizeOptionalText(suggestion.suggestedTitle);

    if (!nextTitle) {
      throw new Error('A suggested title is required when changing the title.');
    }

    updatePayload.title = nextTitle;
  }

  if (suggestion.changeNotes) {
    updatePayload.notes = suggestion.suggestedNotes ?? null;
  }

  if (suggestion.changeDueAt) {
    updatePayload.dueAt = suggestion.suggestedDueAt ?? null;
  }

  if (suggestion.changeReminderAt) {
    updatePayload.reminderAt = suggestion.suggestedReminderAt ?? null;
  }

  if (suggestion.changePriority) {
    updatePayload.priority = suggestion.suggestedPriority ?? null;
  }

  const rollbackPayload: TaskUpdate = {
    id: currentTask.id,
    title: currentTask.title,
    dueAt: currentTask.dueAt ?? null,
    reminderAt: currentTask.reminderAt ?? null,
    notes: currentTask.notes ?? null,
    priority: currentTask.priority ?? 'auto',
  };

  updateTask(updatePayload);

  try {
    await supabaseTaskEditSuggestionService.accept(id);
  } catch (error) {
    updateTask(rollbackPayload);
    throw error;
  }

  broadcastTaskEditSuggestionChange();
  return supabaseTaskEditSuggestionService.listPending();
};

const dismissTaskEditSuggestion = async (
  id: string,
): Promise<WebsiteTaskEditSuggestion[]> => {
  if (!supabaseTaskEditSuggestionService) {
    throw new Error('Website task edit suggestions are not configured.');
  }

  const suggestion = await supabaseTaskEditSuggestionService.getPendingById(id);

  if (!suggestion) {
    throw new Error('Website task edit suggestion not found.');
  }

  await supabaseTaskEditSuggestionService.dismiss(id);
  broadcastTaskEditSuggestionChange();
  return supabaseTaskEditSuggestionService.listPending();
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
          <stop offset="0%" stop-color="#3B82F6" />
          <stop offset="100%" stop-color="#1E40AF" />
        </linearGradient>
      </defs>
      <rect x="8" y="8" width="48" height="48" rx="14" fill="url(#trayGradient)"/>
      <path d="M20 25h24" stroke="#F3F8FF" stroke-width="6" stroke-linecap="round"/>
      <path d="M20 34h16" stroke="#F3F8FF" stroke-width="6" stroke-linecap="round"/>
      <path d="M20 43h24" stroke="#F3F8FF" stroke-width="6" stroke-linecap="round"/>
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
  const savedBounds = getQuickAddBounds();
  const window = new BrowserWindow({
    width: savedBounds?.width ?? 430,
    height: savedBounds?.height ?? 640,
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
    x: savedBounds?.x,
    y: savedBounds?.y,
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
    },
  });

  window.loadURL(`${MAIN_WINDOW_WEBPACK_ENTRY}${QUICK_ADD_HASH}`);

  window.once('ready-to-show', () => {
    if (!savedBounds) {
      window.center();
    }

    window.show();
    window.focus();
  });

  window.on('move', () => {
    persistQuickAddBounds(window);
  });

  window.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      persistQuickAddBounds(window);
      window.hide();
    }
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

  if (quickAddWindow.isVisible()) {
    persistQuickAddBounds(quickAddWindow);
    quickAddWindow.hide();
    return;
  }

  if (quickAddWindow.isMinimized()) {
    quickAddWindow.restore();
  }

  quickAddWindow.show();
  quickAddWindow.focus();
};

const buildReminderPopupUrl = (payload: ReminderPopupPayload): string =>
  `${MAIN_WINDOW_WEBPACK_ENTRY}${REMINDER_POPUP_HASH}?payload=${encodeURIComponent(
    JSON.stringify(payload),
  )}`;

const clampReminderPopupCoordinate = (
  value: number,
  min: number,
  max: number,
): number => {
  if (max <= min) {
    return min;
  }

  return Math.min(Math.max(value, min), max);
};

const getReminderPopupDisplay = (displayId: number) =>
  screen.getAllDisplays().find((display) => display.id === displayId) ??
  screen.getDisplayNearestPoint(screen.getCursorScreenPoint());

const getReminderPopupAnchorDisplay = () =>
  screen.getDisplayNearestPoint(screen.getCursorScreenPoint());

const getQueuedReminderPopupCount = (): number =>
  Math.max(0, reminderPopupQueue.length - MAX_VISIBLE_REMINDER_POPUPS);

const getReminderPopupPayloadForWindow = (
  queuedPopup: QueuedReminderPopup,
): ReminderPopupPayload => ({
  ...queuedPopup.payload,
  queuedCount: getQueuedReminderPopupCount(),
});

const repositionReminderPopups = (): void => {
  reminderPopupWindows = reminderPopupWindows.filter(({ window }) => !window.isDestroyed());

  const windowsByDisplay = new Map<number, ReminderPopupWindowEntry[]>();

  reminderPopupWindows.forEach((entry) => {
    const displayWindows = windowsByDisplay.get(entry.displayId) ?? [];
    displayWindows.push(entry);
    windowsByDisplay.set(entry.displayId, displayWindows);
  });

  windowsByDisplay.forEach((entries, displayId) => {
    const workArea = getReminderPopupDisplay(displayId).workArea;
    const tallestPopupHeight = entries.reduce((maxHeight, { window }) => {
      const [, height] = window.getSize();
      return Math.max(maxHeight, height);
    }, 0);
    const availableStackSpace = Math.max(
      0,
      workArea.height - tallestPopupHeight - REMINDER_POPUP_MARGIN * 2,
    );
    const stackStep =
      entries.length > 1
        ? Math.min(
            tallestPopupHeight + REMINDER_POPUP_STACK_GAP,
            Math.floor(availableStackSpace / (entries.length - 1)),
          )
        : 0;

    entries.forEach(({ window }, index) => {
      const [width, height] = window.getSize();
      const targetX = workArea.x + workArea.width - width - REMINDER_POPUP_MARGIN;
      const targetY =
        workArea.y +
        workArea.height -
        height -
        REMINDER_POPUP_MARGIN -
        index * stackStep;

      window.setBounds({
        x: clampReminderPopupCoordinate(
          targetX,
          workArea.x + REMINDER_POPUP_MARGIN,
          workArea.x + workArea.width - width - REMINDER_POPUP_MARGIN,
        ),
        y: clampReminderPopupCoordinate(
          targetY,
          workArea.y + REMINDER_POPUP_MARGIN,
          workArea.y + workArea.height - height - REMINDER_POPUP_MARGIN,
        ),
        width,
        height,
      });
    });
  });
};

const closeMegaPopupWindow = (): void => {
  if (!megaPopupWindow || megaPopupWindow.isDestroyed()) {
    megaPopupWindow = null;
    return;
  }

  megaPopupWindow.close();
  megaPopupWindow = null;
};

const showMegaReminderPopup = (payload: ReminderPopupPayload): void => {
  closeMegaPopupWindow();

  const anchorDisplay = getReminderPopupAnchorDisplay();
  const window = new BrowserWindow({
    x: anchorDisplay.bounds.x,
    y: anchorDisplay.bounds.y,
    width: anchorDisplay.bounds.width,
    height: anchorDisplay.bounds.height,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    frame: false,
    show: false,
    backgroundColor: MEGA_POPUP_BACKGROUND,
    title: 'Emergency Popup',
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
    },
  });

  megaPopupWindow = window;
  window.loadURL(buildReminderPopupUrl(payload));

  window.once('ready-to-show', () => {
    const display = getReminderPopupAnchorDisplay();
    window.setBounds(display.bounds);
    window.show();
    window.focus();
    window.setAlwaysOnTop(true, 'screen-saver');
    window.setFullScreen(true);
    window.moveTop();
  });

  window.on('closed', () => {
    if (megaPopupWindow === window) {
      megaPopupWindow = null;
    }
  });
};

const updateFriendNetworkEventStatusFromPayload = (
  payload: ReminderPopupPayload,
  status: AppPopupEventStatus,
): void => {
  if (!payload.sourceEventId || !supabaseFriendNetworkService) {
    return;
  }

  void supabaseFriendNetworkService.updateStatus(payload.sourceEventId, status).catch((error) => {
    console.error('Supabase friend network event status could not be updated.', error);
  });
};

const markFriendNetworkEventDeliveredFromPayload = (
  payload: ReminderPopupPayload,
): void => {
  if (!payload.sourceEventId || !supabaseFriendNetworkService) {
    return;
  }

  void supabaseFriendNetworkService
    .markDelivered(payload.sourceEventId)
    .then(() => {
      broadcastFriendNetworkChange();
    })
    .catch((error) => {
      console.error('Supabase friend network event could not be marked delivered.', error);
    });
};

const removeReminderPopupWindow = (targetWindow: BrowserWindow): void => {
  reminderPopupWindows = reminderPopupWindows.filter(
    ({ window }) => window !== targetWindow && !window.isDestroyed(),
  );
  repositionReminderPopups();
};

const createReminderPopupWindow = (queuedPopup: QueuedReminderPopup): void => {
  const payload = getReminderPopupPayloadForWindow(queuedPopup);
  const window = new BrowserWindow({
    width: REMINDER_POPUP_WIDTH,
    height: REMINDER_POPUP_HEIGHT,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    frame: false,
    show: false,
    backgroundColor: REMINDER_POPUP_BACKGROUND,
    title: 'Reminder',
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
    },
  });

  reminderPopupWindows = reminderPopupWindows.filter(
    ({ window: popupWindow }) => !popupWindow.isDestroyed(),
  );
  reminderPopupWindows.unshift({
    id: queuedPopup.id,
    window,
    displayId: getReminderPopupAnchorDisplay().id,
    payload: queuedPopup.payload,
  });
  window.loadURL(buildReminderPopupUrl(payload));

  window.once('ready-to-show', () => {
    repositionReminderPopups();
    window.show();
    window.moveTop();
    setTimeout(() => {
      if (!window.isDestroyed()) {
        repositionReminderPopups();
      }
    }, 0);
  });

  window.on('closed', () => {
    removeReminderPopupWindow(window);
  });
};

const syncReminderPopupQueue = (): void => {
  reminderPopupWindows = reminderPopupWindows.filter(({ window }) => !window.isDestroyed());

  const visiblePopupIds = new Set(
    reminderPopupQueue.slice(0, MAX_VISIBLE_REMINDER_POPUPS).map(({ id }) => id),
  );

  reminderPopupWindows.forEach(({ id, window }) => {
    if (!visiblePopupIds.has(id) && !window.isDestroyed()) {
      window.close();
    }
  });

  reminderPopupWindows = reminderPopupWindows.filter(
    ({ id, window }) => visiblePopupIds.has(id) && !window.isDestroyed(),
  );

  reminderPopupQueue.slice(0, MAX_VISIBLE_REMINDER_POPUPS).forEach((queuedPopup) => {
    const isAlreadyVisible = reminderPopupWindows.some(({ id }) => id === queuedPopup.id);

    if (!isAlreadyVisible) {
      createReminderPopupWindow(queuedPopup);
    }
  });

  repositionReminderPopups();
};

const dismissReminderPopupWindow = (
  targetWindow: BrowserWindow,
  reason: PopupCloseReason = 'dismiss',
): boolean => {
  const popupEntry = reminderPopupWindows.find(({ window }) => window === targetWindow);

  if (!popupEntry) {
    return false;
  }

  reminderPopupQueue = reminderPopupQueue.filter(({ id }) => id !== popupEntry.id);
  void updateFriendNetworkEventStatusFromPayload(
    popupEntry.payload,
    reason === 'open' ? 'opened' : 'dismissed',
  );

  if (!targetWindow.isDestroyed()) {
    targetWindow.close();
  }

  syncReminderPopupQueue();
  return true;
};

const showReminderPopup = (payload: ReminderPopupPayload): void => {
  markFriendNetworkEventDeliveredFromPayload(payload);

  if (payload.presentation === 'mega') {
    showMegaReminderPopup(payload);
    return;
  }

  reminderPopupQueue.unshift({
    id: randomUUID(),
    payload,
  });
  syncReminderPopupQueue();
};

const showTaskReminder = (task: Task): void => {
  const body = task.dueAt
    ? `Due ${reminderFormatter.format(new Date(task.dueAt))}`
    : 'Open the app to take the next step.';

  showReminderPopup({
    title: task.title,
    body,
    contextLabel: 'Task Reminder',
    selection: {
      kind: 'task',
      id: task.id,
    },
  });
};

const showRoutineReminder = (
  routine: RoutineTemplate,
  occurrence: RoutineOccurrence,
): void => {
  showReminderPopup({
    title: routine.title,
    body: `Due ${reminderFormatter.format(new Date(occurrence.dueAt))}`,
    contextLabel: 'Task Reminder',
    selection: {
      kind: 'routine',
      id: routine.id,
    },
  });
};

const getSupabaseMessageSender = (message: SupabaseMessageRow): string | undefined => {
  return normalizeOptionalText(message.sender_name);
};

const getSelectionDisplayTitle = (selection: AppSelection): string | undefined => {
  const state = getLiveState();

  if (selection.kind === 'task') {
    return normalizeOptionalText(
      state.oneOffTasks.find((task) => task.id === selection.id)?.title,
    );
  }

  if (selection.kind === 'view') {
    return selection.id === 'network' ? 'Friend network' : 'Website queue';
  }

  return normalizeOptionalText(
    state.routineTemplates.find((routine) => routine.id === selection.id)?.title,
  );
};

const getSupabaseMessageSelection = (
  message: SupabaseMessageRow,
): AppSelection | undefined => {
  const sharedTaskSelection = getSelectionFromSharedTaskId(message.task_id);

  if (sharedTaskSelection) {
    return sharedTaskSelection;
  }

  if (!message.task_id) {
    return undefined;
  }

  const state = getLiveState();

  if (state.oneOffTasks.some((task) => task.id === message.task_id)) {
    return {
      kind: 'task',
      id: message.task_id,
    };
  }

  if (state.routineTemplates.some((routine) => routine.id === message.task_id)) {
    return {
      kind: 'routine',
      id: message.task_id,
    };
  }

  return undefined;
};

const getSupabaseMessagePopupPayload = (message: SupabaseMessageRow): ReminderPopupPayload => {
  if (message.source === WEBSITE_EMERGENCY_MESSAGE_SOURCE) {
    return {
      title: 'Emergency Popup',
      body: message.message,
      contextLabel: 'Emergency Popup',
      contextValue: getSupabaseMessageSender(message),
      presentation: 'mega',
    };
  }

  const selection = getSupabaseMessageSelection(message);
  const selectionTitle = selection ? getSelectionDisplayTitle(selection) : undefined;

  return {
    title: selectionTitle ?? '',
    body: message.message,
    selection,
    contextLabel: selection ? 'Task Reminder' : 'General Reminder',
    contextValue: getSupabaseMessageSender(message),
  };
};

const getFriendNetworkEventLabel = (event: AppPopupEvent): string => {
  if (event.kind === 'emergency_popup' || event.priority === 'emergency') {
    return 'Emergency Popup';
  }

  if (event.kind === 'task_popup') {
    return 'Task Reminder';
  }

  if (event.kind === 'task_submission') {
    return 'Friend Task Suggestion';
  }

  if (event.kind === 'task_edit_suggestion') {
    return 'Friend Edit Suggestion';
  }

  return 'General Reminder';
};

const getSavedContactNicknameForCode = (friendCode?: string): string | undefined => {
  const normalizedFriendCode = friendCode?.trim().toLowerCase();

  if (!normalizedFriendCode) {
    return undefined;
  }

  return savedFriendContacts.find(
    (contact) => contact.normalizedFriendCode === normalizedFriendCode,
  )?.nickname;
};

const formatFriendNetworkSenderLabel = (event: AppPopupEvent): string | undefined => {
  const senderName = normalizeOptionalText(event.senderName);
  const nickname = getSavedContactNicknameForCode(event.senderFriendCode);

  if (senderName && nickname) {
    return `${senderName} (${nickname})`;
  }

  return senderName ?? nickname;
};

const getFriendNetworkEventPopupPayload = (
  event: AppPopupEvent,
): ReminderPopupPayload => ({
  title: event.relatedTaskTitle ?? event.title ?? '',
  body: event.message,
  selection:
    event.kind === 'task_submission' || event.kind === 'task_edit_suggestion'
      ? friendNetworkSelection
      : undefined,
  contextLabel: getFriendNetworkEventLabel(event),
  contextValue: formatFriendNetworkSenderLabel(event),
  presentation:
    event.kind === 'emergency_popup' || event.priority === 'emergency'
      ? 'mega'
      : 'standard',
  sourceEventId: event.id,
});

const shouldDeferFriendNetworkEvent = (event: AppPopupEvent): boolean => {
  return shouldDeferPopupDelivery(event.priority === 'emergency');
};

const handleFriendNetworkPopupEvent = (event: AppPopupEvent): boolean => {
  if (shouldDeferFriendNetworkEvent(event)) {
    return false;
  }

  showReminderPopup(getFriendNetworkEventPopupPayload(event));
  return true;
};

const shouldDeferPopupDelivery = (isEmergency: boolean): boolean => {
  const dndMode = getAppDndMode();

  if (dndMode === 'full') {
    return true;
  }

  return dndMode === 'quiet' && !isEmergency;
};

const showWebsiteSubmissionPopup = (submission: WebsiteTaskSubmission): void => {
  if (shownWebsiteSubmissionPopupIds.has(submission.id)) {
    return;
  }

  shownWebsiteSubmissionPopupIds.add(submission.id);
  showReminderPopup(getTaskSubmissionPopupPayload(submission));
};

const showWebsiteEditSuggestionPopup = (suggestion: WebsiteTaskEditSuggestion): void => {
  if (shownWebsiteEditSuggestionPopupIds.has(suggestion.id)) {
    return;
  }

  shownWebsiteEditSuggestionPopupIds.add(suggestion.id);
  showReminderPopup(getTaskEditSuggestionPopupPayload(suggestion));
};

const flushDeferredWebsiteSuggestionPopups = async (): Promise<void> => {
  const [pendingSubmissions, pendingEditSuggestions] = await Promise.all([
    listTaskSubmissions(),
    listTaskEditSuggestions(),
  ]);

  pendingSubmissions.forEach(showWebsiteSubmissionPopup);
  pendingEditSuggestions.forEach(showWebsiteEditSuggestionPopup);
};

const flushDeferredDndPopups = async (): Promise<void> => {
  if (supabaseMessageServiceRefresh) {
    await supabaseMessageServiceRefresh();
  }

  await flushDeferredWebsiteSuggestionPopups();

  if (supabaseFriendNetworkService) {
    await supabaseFriendNetworkService.refresh();
  }
};

const startSupabaseAccountSyncFeed = async (): Promise<void> => {
  const service = createSupabaseAccountSyncService({
    onError: (message, error) => {
      console.error(message, error);
    },
  });

  supabaseAccountSyncMissingEnvKeys = service.missingEnvKeys;

  if (!service.isConfigured) {
    console.warn(
      `Supabase account sync is disabled. Missing env vars: ${service.missingEnvKeys.join(', ')}`,
    );
    supabaseAccountSyncService = null;
    broadcastAccountChange();
    return;
  }

  supabaseAccountSyncService = service;
  restartAccountSyncPolling();

  if (getStoredAccountSession()) {
    await pullAccountPlannerState();
  }

  broadcastAccountChange();
};

const startSupabaseMessageFeed = async (): Promise<void> => {
  if (!isDevVariant()) {
    return;
  }

  const service = createSupabaseMessageService({
    onMessage: (message) => {
      if (shouldDeferPopupDelivery(message.source === WEBSITE_EMERGENCY_MESSAGE_SOURCE)) {
        return false;
      }

      showReminderPopup(getSupabaseMessagePopupPayload(message));
      return true;
    },
    onError: (message, error) => {
      console.error(message, error);
    },
  });

  if (!service.isConfigured) {
    console.warn(
      `Supabase message feed is disabled. Missing env vars: ${service.missingEnvKeys.join(', ')}`,
    );
    supabaseMessageServiceStop = null;
    return;
  }

  await service.start();
  supabaseMessageServiceRefresh = () => service.refresh();
  supabaseMessageServiceStop = () => service.stop();
};

const startSupabaseSharedTaskFeed = async (): Promise<void> => {
  if (!isDevVariant()) {
    return;
  }

  const service = createSupabaseSharedTaskService({
    onError: (message, error) => {
      console.error(message, error);
    },
  });

  if (!service.isConfigured) {
    console.warn(
      `Supabase shared task sync is disabled. Missing env vars: ${service.missingEnvKeys.join(', ')}`,
    );
    supabaseSharedTaskService = null;
    return;
  }

  supabaseSharedTaskService = service;

  await service.start({
    tasks: listTasks(),
    routines: listRoutines(),
  });
};

const startSupabaseTaskSubmissionFeed = async (): Promise<void> => {
  if (!isDevVariant()) {
    return;
  }

  const service = createSupabaseTaskSubmissionService({
    onChanged: () => {
      broadcastSubmissionChange();
    },
    onSubmission: (submission) => {
      if (shouldDeferPopupDelivery(false)) {
        return;
      }

      showWebsiteSubmissionPopup(submission);
    },
    onError: (message, error) => {
      console.error(message, error);
    },
  });

  if (!service.isConfigured) {
    console.warn(
      `Supabase task submissions are disabled. Missing env vars: ${service.missingEnvKeys.join(', ')}`,
    );
    supabaseTaskSubmissionService = null;
    return;
  }

  supabaseTaskSubmissionService = service;
  await service.start();
};

const startSupabaseTaskEditSuggestionFeed = async (): Promise<void> => {
  if (!isDevVariant()) {
    return;
  }

  const service = createSupabaseTaskEditSuggestionService({
    onChanged: () => {
      broadcastTaskEditSuggestionChange();
    },
    onSuggestion: (suggestion) => {
      if (shouldDeferPopupDelivery(false)) {
        return;
      }

      showWebsiteEditSuggestionPopup(suggestion);
    },
    onError: (message, error) => {
      console.error(message, error);
    },
  });

  if (!service.isConfigured) {
    console.warn(
      `Supabase task edit suggestions are disabled. Missing env vars: ${service.missingEnvKeys.join(', ')}`,
    );
    supabaseTaskEditSuggestionService = null;
    return;
  }

  supabaseTaskEditSuggestionService = service;
  await service.start();
};

const startSupabaseFriendNetworkFeed = async (): Promise<void> => {
  const service = createSupabaseFriendNetworkService({
    deviceKey: getSupabasePresenceDeviceId(),
    deviceName: getSupabasePresenceDeviceName(),
    onChanged: () => {
      broadcastFriendNetworkChange();
    },
    onPopupEvent: (event) => handleFriendNetworkPopupEvent(event),
    onError: (message, error) => {
      console.error(message, error);
    },
  });

  supabaseFriendNetworkMissingEnvKeys = service.missingEnvKeys;

  if (!service.isConfigured) {
    console.warn(
      `Supabase friend network is disabled. Missing env vars: ${service.missingEnvKeys.join(', ')}`,
    );
    supabaseFriendNetworkService = null;
    return;
  }

  supabaseFriendNetworkService = service;
  await service.start();

  if (supabaseFriendNetworkPollInterval) {
    clearInterval(supabaseFriendNetworkPollInterval);
  }

  supabaseFriendNetworkPollInterval = setInterval(() => {
    void service.refresh();
  }, SUPABASE_FRIEND_NETWORK_POLL_INTERVAL_MS);
};

const startSupabasePresenceFeed = async (): Promise<void> => {
  const service = createSupabasePresenceService({
    deviceId: getSupabasePresenceDeviceId(),
    deviceName: getSupabasePresenceDeviceName(),
    heartbeatIntervalMs: SUPABASE_PRESENCE_HEARTBEAT_INTERVAL_MS,
    onError: (message, error) => {
      console.error(message, error);
    },
  });

  if (!service.isConfigured) {
    console.warn(
      `Supabase app presence is disabled. Missing env vars: ${service.missingEnvKeys.join(', ')}`,
    );
    supabasePresenceServiceHeartbeat = null;
    supabasePresenceServiceStop = null;
    return;
  }

  await service.start();
  supabasePresenceServiceHeartbeat = () => service.heartbeat();
  supabasePresenceServiceStop = () => service.stop();
};

const checkDueReminders = async (): Promise<void> => {
  if (!app.isReady()) {
    return;
  }

  const state = getLiveState();
  const now = Date.now();
  let didNotify = false;

  syncTimeBlockDnd(state, now);

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

const completeAccountSignIn = async ({
  session,
  plannerState,
  plannerStateUpdatedAt,
}: {
  session: AccountSyncSession;
  plannerState: PersistedState;
  plannerStateUpdatedAt: string;
}): Promise<AccountStatus> => {
  storeAccountSession(session);

  const localState = getLiveState();

  if (isPlannerStateEmpty(plannerState) && !isPlannerStateEmpty(localState)) {
    const syncedAt = await getAccountSyncService().savePlannerState(session, localState);
    updateAccountLastSyncedAt(syncedAt);
  } else {
    applyRemotePlannerState(plannerState, plannerStateUpdatedAt);
  }

  await refreshSavedFriendContacts({ broadcast: true });
  restartAccountSyncPolling();
  broadcastDataChange();
  broadcastAccountChange();
  return getAccountStatus();
};

const signUpAccount = async (credentials: AccountCredentials): Promise<AccountStatus> => {
  const result = await getAccountSyncService().createAccount(credentials, getLiveState());
  return completeAccountSignIn(result);
};

const signInAccount = async (credentials: AccountCredentials): Promise<AccountStatus> => {
  const result = await getAccountSyncService().login(credentials);
  return completeAccountSignIn(result);
};

const signOutAccount = (): AccountStatus => {
  if (accountSyncDebounceTimer) {
    clearTimeout(accountSyncDebounceTimer);
    accountSyncDebounceTimer = null;
  }

  clearAccountSession();
  savedFriendContacts = [];
  hasLoadedSavedFriendContacts = false;
  restartAccountSyncPolling();
  broadcastAccountChange();
  broadcastFriendNetworkChange();
  return getAccountStatus();
};

const syncAccountNow = async (): Promise<AccountStatus> => {
  await pullAccountPlannerState();
  await saveAccountPlannerState(getLiveState());
  return getAccountStatus();
};

const listFriendNetworkCodes = async (): Promise<FriendCodeAlias[]> =>
  supabaseFriendNetworkService?.listFriendCodes() ?? [];

const listSavedFriendContacts = async (): Promise<SavedFriendContact[]> => {
  if (!hasLoadedSavedFriendContacts && getStoredAccountSession()) {
    return refreshSavedFriendContacts();
  }

  return savedFriendContacts;
};

const saveFriendContact = async (
  input: SavedFriendContactDraft,
): Promise<SavedFriendContact[]> => {
  const session = getStoredAccountSession();

  if (!session) {
    throw new Error('Sign in before saving friend contacts.');
  }

  await getAccountSyncService().saveContact(session, input);
  return refreshSavedFriendContacts({ broadcast: true });
};

const deleteFriendContact = async (contactId: string): Promise<SavedFriendContact[]> => {
  const session = getStoredAccountSession();

  if (!session) {
    throw new Error('Sign in before editing friend contacts.');
  }

  await getAccountSyncService().deleteContact(session, contactId);
  return refreshSavedFriendContacts({ broadcast: true });
};

const listPendingFriendNetworkEvents = async (): Promise<AppPopupEvent[]> =>
  supabaseFriendNetworkService?.listPendingEvents() ?? [];

const listRecentFriendNetworkEvents = async (): Promise<AppPopupEvent[]> =>
  supabaseFriendNetworkService?.listRecentEvents() ?? [];

const setFriendNetworkCode = async (code: string): Promise<FriendCodeAlias> => {
  const friendCode = await requireSupabaseFriendNetworkService().setFriendCode(code);
  broadcastFriendNetworkChange();
  return friendCode;
};

const sendFriendNetworkPopup = async (input: AppPopupDraft): Promise<void> => {
  if (
    (input.kind === 'emergency_popup' || input.priority === 'emergency') &&
    !verifyEmergencyPopupPassword(input.emergencyPassword)
  ) {
    throw new Error('Emergency popup password did not match.');
  }

  await requireSupabaseFriendNetworkService().sendPopup(input);
};

const getPayloadString = (
  payload: Record<string, unknown>,
  key: string,
): string | undefined => {
  const value = payload[key];
  return typeof value === 'string' ? normalizeOptionalText(value) : undefined;
};

const getPayloadPriority = (
  payload: Record<string, unknown>,
  key: string,
): TaskPriority | undefined => {
  const value = payload[key];

  if (
    value === 'auto' ||
    value === 'high' ||
    value === 'medium' ||
    value === 'low'
  ) {
    return value;
  }

  return undefined;
};

const getFriendNetworkEventById = async (eventId: string): Promise<AppPopupEvent> => {
  const event = (await listPendingFriendNetworkEvents()).find(
    (candidate) => candidate.id === eventId,
  );

  if (!event) {
    throw new Error('Friend network event was not found or is already reviewed.');
  }

  return event;
};

const buildFriendTaskSubmissionDraft = (event: AppPopupEvent): TaskDraft => {
  const payload = event.payload;
  const title =
    getPayloadString(payload, 'title') ??
    event.title ??
    event.relatedTaskTitle ??
    normalizeTitle(event.message.split('\n')[0] ?? event.message);

  return {
    title,
    notes:
      getPayloadString(payload, 'notes') ??
      `Suggested by ${event.senderName ?? event.senderFriendCode ?? 'a friend'}.\n\n${event.message}`,
    dueAt: getPayloadString(payload, 'dueAt'),
    reminderAt: getPayloadString(payload, 'reminderAt'),
    priority: getPayloadPriority(payload, 'priority') ?? 'auto',
  };
};

const findFriendEditTargetTask = (event: AppPopupEvent): Task => {
  const state = getLiveState();
  const taskId = event.relatedTaskId ?? getPayloadString(event.payload, 'taskId');

  if (taskId) {
    const task = state.oneOffTasks.find((candidate) => candidate.id === taskId);

    if (task) {
      return task;
    }
  }

  const taskTitle = normalizeOptionalText(
    event.relatedTaskTitle ?? getPayloadString(event.payload, 'taskTitle') ?? event.title,
  );

  if (!taskTitle) {
    throw new Error('This edit suggestion does not include a target task title.');
  }

  const normalizedTaskTitle = taskTitle.toLowerCase();
  const matches = state.oneOffTasks.filter(
    (task) => task.title.trim().toLowerCase() === normalizedTaskTitle,
  );

  if (matches.length !== 1) {
    throw new Error(
      matches.length === 0
        ? `No local task matched "${taskTitle}".`
        : `More than one local task matched "${taskTitle}". Rename one or dismiss this suggestion.`,
    );
  }

  return matches[0];
};

const buildFriendTaskEditUpdate = (event: AppPopupEvent, task: Task): TaskUpdate => {
  const payload = event.payload;
  const update: TaskUpdate = {
    id: task.id,
  };
  const suggestedTitle = getPayloadString(payload, 'suggestedTitle');
  const suggestedNotes = getPayloadString(payload, 'suggestedNotes');
  const suggestedDueAt = getPayloadString(payload, 'suggestedDueAt');
  const suggestedReminderAt = getPayloadString(payload, 'suggestedReminderAt');
  const suggestedPriority = getPayloadPriority(payload, 'suggestedPriority');

  if (suggestedTitle) {
    update.title = suggestedTitle;
  }

  if (suggestedNotes) {
    update.notes = suggestedNotes;
  }

  if (suggestedDueAt) {
    update.dueAt = suggestedDueAt;
  }

  if (suggestedReminderAt) {
    update.reminderAt = suggestedReminderAt;
  }

  if (suggestedPriority) {
    update.priority = suggestedPriority;
  }

  if (Object.keys(update).length === 1) {
    throw new Error('This edit suggestion does not include any changes.');
  }

  return update;
};

const acceptFriendNetworkEvent = async (eventId: string): Promise<AppPopupEvent[]> => {
  const service = requireSupabaseFriendNetworkService();
  const event = await getFriendNetworkEventById(eventId);

  if (event.kind === 'task_submission') {
    const createdTask = createTask(buildFriendTaskSubmissionDraft(event));

    try {
      await service.updateStatus(event.id, 'accepted');
    } catch (error) {
      deleteTask(createdTask.id);
      throw error;
    }
  } else if (event.kind === 'task_edit_suggestion') {
    const targetTask = findFriendEditTargetTask(event);
    const rollbackPayload: TaskUpdate = {
      id: targetTask.id,
      title: targetTask.title,
      dueAt: targetTask.dueAt ?? null,
      reminderAt: targetTask.reminderAt ?? null,
      notes: targetTask.notes ?? null,
      priority: targetTask.priority ?? 'auto',
    };
    const updatePayload = buildFriendTaskEditUpdate(event, targetTask);

    updateTask(updatePayload);

    try {
      await service.updateStatus(event.id, 'accepted');
    } catch (error) {
      updateTask(rollbackPayload);
      throw error;
    }
  } else {
    await service.updateStatus(event.id, 'opened');
  }

  broadcastDataChange();
  broadcastFriendNetworkChange();
  return listPendingFriendNetworkEvents();
};

const denyFriendNetworkEvent = async (eventId: string): Promise<AppPopupEvent[]> => {
  const service = requireSupabaseFriendNetworkService();
  await service.updateStatus(eventId, 'denied');
  broadcastFriendNetworkChange();
  return listPendingFriendNetworkEvents();
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
ipcMain.handle('timeBlocks:list', () => listTimeBlocks());
ipcMain.handle('timeBlocks:create', (_event, input: TimeBlockDraft) => createTimeBlock(input));
ipcMain.handle('timeBlocks:update', (_event, input: TimeBlockUpdate) => updateTimeBlock(input));
ipcMain.handle('timeBlocks:delete', (_event, timeBlockId: string) =>
  deleteTimeBlock(timeBlockId),
);

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

ipcMain.handle('account:status', () => getAccountStatus());
ipcMain.handle('account:signUp', (_event, credentials: AccountCredentials) =>
  signUpAccount(credentials),
);
ipcMain.handle('account:signIn', (_event, credentials: AccountCredentials) =>
  signInAccount(credentials),
);
ipcMain.handle('account:signOut', () => signOutAccount());
ipcMain.handle('account:syncNow', () => syncAccountNow());

ipcMain.handle('submissions:list', () => listTaskSubmissions());
ipcMain.handle('submissions:accept', (_event, submissionId: string) =>
  acceptTaskSubmission(submissionId),
);
ipcMain.handle('submissions:dismiss', (_event, submissionId: string) =>
  dismissTaskSubmission(submissionId),
);
ipcMain.handle('editSuggestions:list', () => listTaskEditSuggestions());
ipcMain.handle('editSuggestions:accept', (_event, suggestionId: string) =>
  acceptTaskEditSuggestion(suggestionId),
);
ipcMain.handle('editSuggestions:dismiss', (_event, suggestionId: string) =>
  dismissTaskEditSuggestion(suggestionId),
);

ipcMain.handle('friendNetwork:status', () => getFriendNetworkStatus());
ipcMain.handle('friendNetwork:setDndMode', (_event, mode: AppDndMode) => {
  if (!isAppDndMode(mode)) {
    throw new Error('Please choose a valid DND mode.');
  }

  setAppDndMode(mode);
  broadcastFriendNetworkChange();
  return getFriendNetworkStatus();
});
ipcMain.handle('friendNetwork:listFriendCodes', () => listFriendNetworkCodes());
ipcMain.handle('friendNetwork:setFriendCode', (_event, code: string) =>
  setFriendNetworkCode(code),
);
ipcMain.handle('friendNetwork:listContacts', () => listSavedFriendContacts());
ipcMain.handle('friendNetwork:saveContact', (_event, input: SavedFriendContactDraft) =>
  saveFriendContact(input),
);
ipcMain.handle('friendNetwork:deleteContact', (_event, contactId: string) =>
  deleteFriendContact(contactId),
);
ipcMain.handle('friendNetwork:listPendingEvents', () => listPendingFriendNetworkEvents());
ipcMain.handle('friendNetwork:listRecentEvents', () => listRecentFriendNetworkEvents());
ipcMain.handle('friendNetwork:sendPopup', (_event, input: AppPopupDraft) =>
  sendFriendNetworkPopup(input),
);
ipcMain.handle('friendNetwork:acceptEvent', (_event, eventId: string) =>
  acceptFriendNetworkEvent(eventId),
);
ipcMain.handle('friendNetwork:denyEvent', (_event, eventId: string) =>
  denyFriendNetworkEvent(eventId),
);
ipcMain.handle('friendNetwork:setRecentPopupPassword', (_event, password: string) =>
  setRecentPopupPassword(password),
);
ipcMain.handle('friendNetwork:verifyRecentPopupPassword', (_event, password: string) =>
  verifyRecentPopupPassword(password),
);

ipcMain.handle('app:info', () => getAppInfo());
ipcMain.handle('app:show', () => {
  showMainWindow();
});
ipcMain.handle('app:showSelection', (_event, selection: AppSelection) => {
  showMainWindow(selection);
});
ipcMain.handle('app:closeCurrentWindow', (event, reason?: PopupCloseReason) => {
  const currentWindow = BrowserWindow.fromWebContents(event.sender);

  if (!currentWindow) {
    return;
  }

  if (dismissReminderPopupWindow(currentWindow, reason)) {
    return;
  }

  currentWindow.close();
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

  reminderPopupWindows.forEach(({ window }) => {
    if (!window.isDestroyed()) {
      window.destroy();
    }
  });
  reminderPopupWindows = [];
  reminderPopupQueue = [];
  closeMegaPopupWindow();

  if (supabaseMessageServiceStop) {
    void supabaseMessageServiceStop();
    supabaseMessageServiceStop = null;
  }
  supabaseMessageServiceRefresh = null;

  supabaseSharedTaskService = null;
  if (supabaseTaskSubmissionService) {
    void supabaseTaskSubmissionService.stop();
    supabaseTaskSubmissionService = null;
  }
  if (supabaseTaskEditSuggestionService) {
    void supabaseTaskEditSuggestionService.stop();
    supabaseTaskEditSuggestionService = null;
  }
  if (supabaseFriendNetworkPollInterval) {
    clearInterval(supabaseFriendNetworkPollInterval);
    supabaseFriendNetworkPollInterval = null;
  }
  if (supabaseFriendNetworkService) {
    void supabaseFriendNetworkService.stop();
    supabaseFriendNetworkService = null;
  }

  if (accountSyncDebounceTimer) {
    clearTimeout(accountSyncDebounceTimer);
    accountSyncDebounceTimer = null;
  }
  if (accountSyncPullInterval) {
    clearInterval(accountSyncPullInterval);
    accountSyncPullInterval = null;
  }

  if (supabasePresenceServiceStop) {
    void supabasePresenceServiceStop();
    supabasePresenceServiceStop = null;
  }
  supabasePresenceServiceHeartbeat = null;
});

app.on('window-all-closed', () => {
  // Keep the app alive in the tray so reminders can continue firing.
});

void app.whenReady().then(async () => {
  mainWindow = createMainWindow();
  createTray();
  registerShortcuts();
  getLiveState();
  await startSupabaseAccountSyncFeed();
  void startSupabaseMessageFeed();
  void startSupabaseSharedTaskFeed();
  void startSupabaseTaskSubmissionFeed();
  void startSupabaseTaskEditSuggestionFeed();
  void startSupabaseFriendNetworkFeed();
  void startSupabasePresenceFeed();
  screen.on('display-added', repositionReminderPopups);
  screen.on('display-removed', repositionReminderPopups);
  screen.on('display-metrics-changed', repositionReminderPopups);

  powerMonitor.on('resume', () => {
    if (supabaseMessageServiceRefresh) {
      void supabaseMessageServiceRefresh();
    }

    broadcastSubmissionChange();
    broadcastTaskEditSuggestionChange();
    broadcastFriendNetworkChange();
    void pullAccountPlannerState();

    if (supabaseFriendNetworkService) {
      void supabaseFriendNetworkService.refresh();
    }

    if (supabasePresenceServiceHeartbeat) {
      void supabasePresenceServiceHeartbeat();
    }

    void checkDueReminders();
  });

  reminderInterval = setInterval(() => {
    void checkDueReminders();
  }, REMINDER_CHECK_INTERVAL_MS);

  void checkDueReminders();
});
