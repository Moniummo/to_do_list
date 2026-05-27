export type TaskStatus = 'pending' | 'completed';
export type TaskPriority = 'auto' | 'high' | 'medium' | 'low';
export type TaskVisibility = 'public' | 'private';
export type FriendTaskPermission = 'none' | 'public' | 'all';

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
  visibility?: TaskVisibility;
}

export interface TaskDraft {
  title: string;
  dueAt?: string;
  reminderAt?: string;
  notes?: string;
  priority?: TaskPriority;
  visibility?: TaskVisibility;
}

export interface TaskUpdate {
  id: string;
  title?: string;
  dueAt?: string | null;
  reminderAt?: string | null;
  notes?: string | null;
  priority?: TaskPriority | null;
  visibility?: TaskVisibility | null;
}

export type TimeBlockStatus = 'planned' | 'completed' | 'missed';

export interface TimeBlock {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  createdAt: string;
  status: TimeBlockStatus;
  taskId?: string;
  notes?: string;
  enableDnd?: boolean;
}

export interface TimeBlockDraft {
  title: string;
  startAt: string;
  endAt: string;
  taskId?: string;
  notes?: string;
  enableDnd?: boolean;
}

export interface TimeBlockUpdate {
  id: string;
  title?: string;
  startAt?: string;
  endAt?: string;
  taskId?: string | null;
  notes?: string | null;
  enableDnd?: boolean;
  status?: TimeBlockStatus;
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

export interface PlannerState {
  schemaVersion: number;
  oneOffTasks: Task[];
  timeBlocks: TimeBlock[];
  routineTemplates: RoutineTemplate[];
  routineOccurrences: RoutineOccurrence[];
  notifiedReminders: Record<string, string>;
}

export interface HistoryDayPayload {
  date: string;
  tasks: Task[];
  routineEntries: RoutineHistoryEntry[];
}

export type WebsiteTaskSubmissionStatus = 'pending' | 'accepted' | 'dismissed';

export interface WebsiteTaskSubmission {
  id: string;
  senderName?: string;
  title: string;
  details?: string;
  createdAt: string;
  status: WebsiteTaskSubmissionStatus;
  reviewedAt?: string;
  acceptedLocalTaskId?: string;
  source?: string;
}

export type WebsiteTaskEditSuggestionStatus = 'pending' | 'accepted' | 'dismissed';

export interface WebsiteTaskEditSuggestion {
  id: string;
  senderName?: string;
  sharedTaskId: string;
  localTaskId: string;
  taskTitleSnapshot: string;
  changeTitle: boolean;
  suggestedTitle?: string;
  changeNotes: boolean;
  suggestedNotes?: string;
  changeDueAt: boolean;
  suggestedDueAt?: string;
  changeReminderAt: boolean;
  suggestedReminderAt?: string;
  changePriority: boolean;
  suggestedPriority?: TaskPriority;
  createdAt: string;
  status: WebsiteTaskEditSuggestionStatus;
  reviewedAt?: string;
  source?: string;
}

export type AppDndMode = 'off' | 'quiet' | 'full';

export type AppPopupEventKind =
  | 'general_popup'
  | 'task_popup'
  | 'emergency_popup'
  | 'task_submission'
  | 'task_edit_suggestion';

export type AppPopupEventPriority = 'normal' | 'emergency';

export type AppPopupEventStatus =
  | 'pending'
  | 'delivered'
  | 'dismissed'
  | 'opened'
  | 'accepted'
  | 'denied';

export type PopupCloseReason = 'dismiss' | 'open';

export interface AppDevice {
  deviceKey: string;
  deviceName?: string;
  createdAt: string;
  updatedAt: string;
  lastSeenAt?: string;
}

export interface AppPopupEvent {
  id: string;
  recipientAccountId: string;
  recipientDeviceKey?: string;
  senderAccountId?: string;
  senderDeviceKey?: string;
  senderName?: string;
  senderDisplayName?: string;
  source: string;
  kind: AppPopupEventKind;
  priority: AppPopupEventPriority;
  title?: string;
  message: string;
  relatedTaskId?: string;
  relatedTaskTitle?: string;
  payload: Record<string, unknown>;
  status: AppPopupEventStatus;
  createdAt: string;
  deliveredAt?: string;
  reviewedAt?: string;
}

export interface AppPopupDraft {
  recipientUsername: string;
  recipientAccountId?: string;
  senderName?: string;
  kind: AppPopupEventKind;
  priority: AppPopupEventPriority;
  title?: string;
  message: string;
  relatedTaskId?: string;
  relatedTaskTitle?: string;
  emergencyPassword?: string;
  payload?: Record<string, unknown>;
}

export type AppVariant = 'dev' | 'user';

export interface AppInfo {
  variant: AppVariant;
  isDevVariant: boolean;
  isPackaged: boolean;
}

export interface AppStartupSettings {
  isSupported: boolean;
  openAtLogin: boolean;
}

export interface AppUpdateCheckResult {
  isSupported: boolean;
  status: 'unsupported' | 'checking' | 'available' | 'not_available' | 'error' | 'timeout';
  message: string;
}

export interface AccountCredentials {
  username: string;
  password: string;
}

export interface AccountSession {
  accountId: string;
  username: string;
  displayName?: string;
}

export interface AccountStatus {
  isConfigured: boolean;
  missingEnvKeys: string[];
  session?: AccountSession;
  lastSyncedAt?: string;
  syncError?: string;
}

export interface SavedFriendContact {
  id: string;
  accountId: string;
  friendAccountId: string;
  friendUsername: string;
  friendDisplayName?: string;
  nickname: string;
  taskPermission: FriendTaskPermission;
  createdAt: string;
  updatedAt: string;
  lastResolvedAt?: string;
}

export interface SavedFriendContactDraft {
  nickname: string;
  friendUsername: string;
  taskPermission?: FriendTaskPermission;
}

export interface FriendNetworkStatus {
  isConfigured: boolean;
  missingEnvKeys: string[];
  deviceKey: string;
  deviceName?: string;
  dndMode: AppDndMode;
  profileName?: string;
  accountUsername?: string;
}

export interface EmergencyPasswordGrant {
  id: string;
  ownerAccountId: string;
  friendAccountId: string;
  friendUsername: string;
  friendDisplayName?: string;
  friendNickname?: string;
  password: string;
  createdAt: string;
  updatedAt: string;
}

export interface EmergencyPasswordGrantDraft {
  friendAccountId: string;
  password: string;
}

export interface PublicSharedTask {
  id: string;
  kind: 'task' | 'routine';
  sourceId: string;
  title: string;
  status: 'pending' | 'completed';
  dueAt?: string;
  reminderAt?: string;
  completedAt?: string;
  scheduledDate?: string;
  priority?: string;
  ruleSummary?: string;
  visibility: TaskVisibility;
  updatedAt: string;
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
    }
  | {
      kind: 'view';
      id: 'submissions' | 'network';
    };

export interface TodoAppApi {
  account: {
    status: () => Promise<AccountStatus>;
    signUp: (credentials: AccountCredentials) => Promise<AccountStatus>;
    signIn: (credentials: AccountCredentials) => Promise<AccountStatus>;
    signOut: () => Promise<AccountStatus>;
    syncNow: () => Promise<AccountStatus>;
    setDisplayName: (displayName: string) => Promise<AccountStatus>;
    onChanged: (listener: () => void) => () => void;
  };
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
  timeBlocks: {
    list: () => Promise<TimeBlock[]>;
    create: (input: TimeBlockDraft) => Promise<TimeBlock[]>;
    update: (input: TimeBlockUpdate) => Promise<TimeBlock[]>;
    delete: (id: string) => Promise<TimeBlock[]>;
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
  submissions: {
    list: () => Promise<WebsiteTaskSubmission[]>;
    accept: (id: string) => Promise<WebsiteTaskSubmission[]>;
    dismiss: (id: string) => Promise<WebsiteTaskSubmission[]>;
    onChanged: (listener: () => void) => () => void;
  };
  editSuggestions: {
    list: () => Promise<WebsiteTaskEditSuggestion[]>;
    accept: (id: string) => Promise<WebsiteTaskEditSuggestion[]>;
    dismiss: (id: string) => Promise<WebsiteTaskEditSuggestion[]>;
    onChanged: (listener: () => void) => () => void;
  };
  friendNetwork: {
    status: () => Promise<FriendNetworkStatus>;
    setDndMode: (mode: AppDndMode) => Promise<FriendNetworkStatus>;
    listContacts: () => Promise<SavedFriendContact[]>;
    saveContact: (input: SavedFriendContactDraft) => Promise<SavedFriendContact[]>;
    deleteContact: (id: string) => Promise<SavedFriendContact[]>;
    listPublicTasksForFriend: (friendAccountId: string) => Promise<PublicSharedTask[]>;
    listEmergencyPasswords: () => Promise<EmergencyPasswordGrant[]>;
    listEmergencyPasswordsForMe: () => Promise<EmergencyPasswordGrant[]>;
    saveEmergencyPassword: (
      input: EmergencyPasswordGrantDraft,
    ) => Promise<EmergencyPasswordGrant[]>;
    deleteEmergencyPassword: (id: string) => Promise<EmergencyPasswordGrant[]>;
    listPendingEvents: () => Promise<AppPopupEvent[]>;
    listRecentEvents: () => Promise<AppPopupEvent[]>;
    sendPopup: (input: AppPopupDraft) => Promise<void>;
    acceptEvent: (id: string) => Promise<AppPopupEvent[]>;
    denyEvent: (id: string) => Promise<AppPopupEvent[]>;
    onChanged: (listener: () => void) => () => void;
  };
  app: {
    info: () => Promise<AppInfo>;
    getStartupSettings: () => Promise<AppStartupSettings>;
    setStartupEnabled: (enabled: boolean) => Promise<AppStartupSettings>;
    checkForUpdates: () => Promise<AppUpdateCheckResult>;
    show: () => Promise<void>;
    showSelection: (selection: AppSelection) => Promise<void>;
    closeCurrentWindow: (reason?: PopupCloseReason) => Promise<void>;
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
