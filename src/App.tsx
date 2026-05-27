import React, { useEffect, useRef, useState } from 'react';
import {
  addDaysToDateString,
  addMonthsToDateString,
  compareLocalDateStrings,
  formatMonthLabel,
  formatRoutineRule,
  getDueAtForScheduledDate,
  getWeekdayForDateString,
  listScheduledDatesUntil,
  toLocalDateString,
  toMonthKey,
  WEEKDAY_LABELS,
  WEEKDAY_ORDER,
} from './recurrence';
import {
  getRoutinePriorityDetails,
  getTaskPriorityDetails,
  normalizeTaskPriority,
} from './taskPriority';
import type {
  AccountStatus,
  AppInfo,
  AppStartupSettings,
  AppDndMode,
  AppPopupEvent,
  EmergencyPasswordGrant,
  AppSelection,
  FriendTaskPermission,
  FriendNetworkStatus,
  HistoryDayPayload,
  OccurrenceStatus,
  PublicSharedTask,
  RoutineDraft,
  RoutineHistoryPayload,
  RoutineHistorySummary,
  RoutineListItem,
  RoutineOccurrenceHistoryUpdate,
  RoutineTemplate,
  RoutineUnit,
  RoutineUpdate,
  RoutineWeekday,
  SavedFriendContact,
  Task,
  TaskCompletionDateUpdate,
  TaskDraft,
  TaskPriority,
  TaskVisibility,
  TaskUpdate,
  TimeBlock,
  TimeBlockDraft,
  WebsiteTaskEditSuggestion,
  WebsiteTaskSubmission,
} from './types';

type OneOffFormValues = {
  title: string;
  dueDate: string;
  dueTime: string;
  reminderDate: string;
  reminderTime: string;
  notes: string;
  priority: TaskPriority;
  visibility: TaskVisibility;
};

type RoutineFormValues = {
  title: string;
  priority: TaskPriority;
  interval: string;
  unit: RoutineUnit;
  weekdays: RoutineWeekday[];
  startDate: string;
  endDate: string;
  dueTime: string;
  reminderTime: string;
  notes: string;
};

type MiniRepeatMode = 'none' | 'daily' | 'selectedDays';

type MiniComposerValues = {
  title: string;
  repeat: MiniRepeatMode;
  weekdays: RoutineWeekday[];
  dueDate: string;
  dueTime: string;
  reminderDate: string;
  reminderTime: string;
  priority: TaskPriority;
};

type ThemePresetId =
  | 'black-blue'
  | 'black-red'
  | 'blue-green'
  | 'black-gold'
  | 'forest-mint'
  | 'custom';

type AppThemeSettings = {
  presetId: ThemePresetId;
  customBase: string;
  customAccent: string;
};

type ThemePalette = {
  id: ThemePresetId;
  label: string;
  base: string;
  accent: string;
};

type MainScreenProps = {
  themeSettings: AppThemeSettings;
  onThemeChange: (settings: AppThemeSettings) => void;
};

type MainView =
  | 'today'
  | 'planner'
  | 'week'
  | 'routines'
  | 'history'
  | 'submissions'
  | 'network'
  | 'settings';

type FriendNetworkPanel = 'friends' | 'send' | 'review';

type PlannerPanel = 'day' | 'week';

type TimeBlockFormValues = {
  title: string;
  taskId: string;
  date: string;
  startTime: string;
  endTime: string;
  notes: string;
  enableDnd: boolean;
};

type FriendPopupFormValues = {
  recipientUsername: string;
  recipientAccountId: string;
  senderName: string;
  relatedTaskId: string;
  message: string;
  isEmergency: boolean;
  emergencyPassword: string;
};

type FriendTaskSuggestionFormValues = {
  recipientUsername: string;
  recipientAccountId: string;
  senderName: string;
} & OneOffFormValues;

type FriendTaskEditSuggestionFormValues = {
  recipientUsername: string;
  recipientAccountId: string;
  senderName: string;
  publicTaskId: string;
  taskTitle: string;
  suggestedTitle: string;
  suggestedNotes: string;
  suggestedDueDate: string;
  suggestedDueTime: string;
  suggestedReminderDate: string;
  suggestedReminderTime: string;
  suggestedPriority: TaskPriority;
  suggestedRoutineInterval: string;
  suggestedRoutineUnit: RoutineUnit;
  suggestedRoutineWeekdays: RoutineWeekday[];
  suggestedRoutineStartDate: string;
  suggestedRoutineEndDate: string;
  suggestedRoutineDueTime: string;
  suggestedRoutineReminderTime: string;
};

type AccountFormValues = {
  username: string;
  password: string;
};

type FriendContactFormValues = {
  nickname: string;
  friendUsername: string;
  taskPermission: FriendTaskPermission;
};

type EmergencyPasswordFormValues = {
  friendAccountId: string;
  password: string;
};

type WeeklyPlanItem = {
  id: string;
  kind: 'task' | 'routine';
  title: string;
  scheduledDate: string;
  meta: string;
  tone: 'accent' | 'success' | 'danger' | 'muted';
};

type TaskRowProps = {
  task: Task;
  isSelected: boolean;
  onComplete: (taskId: string) => Promise<void>;
  onReopen: (taskId: string) => Promise<void>;
  onDelete: (taskId: string) => Promise<void>;
  onSave: (update: TaskUpdate) => Promise<void>;
};

type RoutineRowProps = {
  item: RoutineListItem;
  isSelected: boolean;
  onComplete: (routineId: string) => Promise<void>;
  onReopen: (routineId: string) => Promise<void>;
  onDelete: (routineId: string) => Promise<void>;
  onEdit: (template: RoutineTemplate) => void;
};

type SubmissionRowProps = {
  submission: WebsiteTaskSubmission;
  onAccept: (submissionId: string) => Promise<void>;
  onDismiss: (submissionId: string) => Promise<void>;
};

type TaskEditSuggestionRowProps = {
  suggestion: WebsiteTaskEditSuggestion;
  currentTask?: Task;
  onAccept: (suggestionId: string) => Promise<void>;
  onDismiss: (suggestionId: string) => Promise<void>;
};

type HistoryDayModalProps = {
  payload: HistoryDayPayload;
  isLoading: boolean;
  error: string | null;
  onClose: () => void;
  onRefresh: () => Promise<void>;
  onTaskReopen: (taskId: string) => Promise<void>;
  onTaskDelete: (taskId: string) => Promise<void>;
  onTaskCompletionDateChange: (input: TaskCompletionDateUpdate) => Promise<void>;
  onRoutineOccurrenceUpdate: (input: RoutineOccurrenceHistoryUpdate) => Promise<void>;
};

type ErrorBoundaryProps = {
  children: React.ReactNode;
};

type ErrorBoundaryState = {
  errorMessage: string | null;
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

type PickerChoice = {
  label: string;
  value: string;
};

type PickerRowProps = {
  choices: PickerChoice[];
  currentValue: string;
  onSelect: (value: string) => void;
};

type ScheduleCardProps = {
  title: string;
  dateValue?: string;
  timeValue?: string;
  dateInputId?: string;
  timeInputId?: string;
  showDate?: boolean;
  timeLabel?: string;
  datePresets?: PickerChoice[];
  timePresets?: PickerChoice[];
  onDateChange?: (value: string) => void;
  onTimeChange: (value: string) => void;
  onClear: () => void;
};

const MINI_SHORTCUT_LABEL = 'Ctrl + Shift + A';
const THEME_STORAGE_KEY = 'desktop-planner-theme';
const DEFAULT_THEME_SETTINGS: AppThemeSettings = {
  presetId: 'black-blue',
  customBase: '#050505',
  customAccent: '#2563eb',
};
const THEME_PRESETS: ThemePalette[] = [
  {
    id: 'black-blue',
    label: 'Black + Blue',
    base: '#050505',
    accent: '#2563eb',
  },
  {
    id: 'black-red',
    label: 'Black + Red',
    base: '#050505',
    accent: '#ef4444',
  },
  {
    id: 'blue-green',
    label: 'Dark Blue + Green',
    base: '#061426',
    accent: '#22c55e',
  },
  {
    id: 'black-gold',
    label: 'Black + Gold',
    base: '#070604',
    accent: '#f59e0b',
  },
  {
    id: 'forest-mint',
    label: 'Forest + Mint',
    base: '#071711',
    accent: '#5eead4',
  },
];

const isThemePresetId = (value: unknown): value is ThemePresetId =>
  typeof value === 'string' &&
  ['black-blue', 'black-red', 'blue-green', 'black-gold', 'forest-mint', 'custom'].includes(
    value,
  );

const normalizeHexColor = (value: unknown, fallback: string): string =>
  typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;

const loadThemeSettings = (): AppThemeSettings => {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);

    if (!stored) {
      return DEFAULT_THEME_SETTINGS;
    }

    const parsed = JSON.parse(stored) as Partial<AppThemeSettings>;

    return {
      presetId: isThemePresetId(parsed.presetId)
        ? parsed.presetId
        : DEFAULT_THEME_SETTINGS.presetId,
      customBase: normalizeHexColor(parsed.customBase, DEFAULT_THEME_SETTINGS.customBase),
      customAccent: normalizeHexColor(parsed.customAccent, DEFAULT_THEME_SETTINGS.customAccent),
    };
  } catch (_error) {
    return DEFAULT_THEME_SETTINGS;
  }
};

const saveThemeSettings = (settings: AppThemeSettings): void => {
  window.localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(settings));
};

const hexToRgb = (hexColor: string): [number, number, number] => {
  const normalized = hexColor.replace('#', '');

  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  ];
};

const mixHexColors = (fromColor: string, toColor: string, amount: number): string => {
  const from = hexToRgb(fromColor);
  const to = hexToRgb(toColor);
  const mixed = from.map((fromChannel, index) =>
    Math.round(fromChannel + (to[index] - fromChannel) * amount),
  );

  return `#${mixed.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
};

const toRgba = (hexColor: string, alpha: number): string => {
  const [red, green, blue] = hexToRgb(hexColor);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
};

const getThemePalette = (settings: AppThemeSettings): ThemePalette => {
  if (settings.presetId === 'custom') {
    return {
      id: 'custom',
      label: 'Custom',
      base: settings.customBase,
      accent: settings.customAccent,
    };
  }

  return (
    THEME_PRESETS.find((preset) => preset.id === settings.presetId) ?? THEME_PRESETS[0]
  );
};

const applyThemeSettings = (settings: AppThemeSettings): void => {
  const palette = getThemePalette(settings);
  const root = document.documentElement;
  const body = document.body;
  const panel = mixHexColors(palette.base, '#ffffff', 0.055);
  const panelStrong = mixHexColors(palette.base, palette.accent, 0.11);
  const bgSoft = mixHexColors(palette.base, '#ffffff', 0.035);
  const row = mixHexColors(palette.base, '#ffffff', 0.045);
  const text = mixHexColors('#ffffff', palette.accent, 0.045);
  const muted = mixHexColors('#dbeafe', palette.base, 0.18);
  const themedVariables: Array<[string, string]> = [
    ['--bg', palette.base],
    ['--bg-soft', bgSoft],
    ['--panel', panel],
    ['--panel-strong', panelStrong],
    ['--sidebar', mixHexColors(palette.base, '#000000', 0.22)],
    ['--row', row],
    ['--line', toRgba(palette.accent, 0.13)],
    ['--line-strong', toRgba(palette.accent, 0.44)],
    ['--text', text],
    ['--muted', muted],
    ['--accent', palette.accent],
    ['--accent-soft', toRgba(palette.accent, 0.18)],
    ['--danger', palette.accent],
    ['--danger-soft', toRgba(palette.accent, 0.18)],
    ['--success', mixHexColors(palette.accent, '#ffffff', 0.2)],
    ['--success-soft', toRgba(palette.accent, 0.16)],
    ['--theme-glow-primary', toRgba(palette.accent, 0.16)],
    ['--theme-glow-secondary', toRgba(palette.accent, 0.1)],
    ['--theme-bg-top', mixHexColors(palette.base, '#000000', 0.25)],
  ];

  body.dataset.appTheme = palette.id;
  themedVariables.forEach(([name, value]) => {
    root.style.setProperty(name, value);
    body.style.setProperty(name, value);
  });
};
const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});
const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
});
const dateFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});
const fullDateFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
});
const getDatePresetChoices = (): PickerChoice[] => {
  const today = toLocalDateString(new Date());

  return [
    {
      label: 'Today',
      value: today,
    },
    {
      label: 'Tomorrow',
      value: addDaysToDateString(today, 1),
    },
    {
      label: 'In 7 days',
      value: addDaysToDateString(today, 7),
    },
  ];
};
const DUE_TIME_PRESETS: PickerChoice[] = [
  {
    label: '9:00 AM',
    value: '09:00',
  },
  {
    label: '4:00 PM',
    value: '16:00',
  },
  {
    label: '8:00 PM',
    value: '20:00',
  },
  {
    label: '11:59 PM',
    value: '23:59',
  },
];
const REMINDER_TIME_PRESETS: PickerChoice[] = [
  {
    label: '8:00 AM',
    value: '08:00',
  },
  {
    label: '12:00 PM',
    value: '12:00',
  },
  {
    label: '6:00 PM',
    value: '18:00',
  },
  {
    label: '9:00 PM',
    value: '21:00',
  },
];
const TASK_PRIORITY_OPTIONS: Array<{
  label: string;
  value: TaskPriority;
  description: string;
}> = [
  {
    label: 'Auto',
    value: 'auto',
    description: 'Uses the due date to show Today, Tomorrow, or Passive.',
  },
  {
    label: 'High',
    value: 'high',
    description: 'Pulls the task toward the top even without a near deadline.',
  },
  {
    label: 'Medium',
    value: 'medium',
    description: 'Keeps the task visible without making it urgent.',
  },
  {
    label: 'Low',
    value: 'low',
    description: 'Good for tasks you want to keep around without crowding the top.',
  },
];

const TASK_VISIBILITY_OPTIONS: Array<{
  label: string;
  value: TaskVisibility;
  description: string;
}> = [
  {
    label: 'Public to permitted friends',
    value: 'public',
    description: 'Friends with Public or All access can see this task.',
  },
  {
    label: 'Private',
    value: 'private',
    description: 'Only friends with All access can see this task.',
  },
];

const FRIEND_TASK_PERMISSION_OPTIONS: Array<{
  label: string;
  value: FriendTaskPermission;
  description: string;
}> = [
  {
    label: 'No tasks',
    value: 'none',
    description: 'This friend cannot see your task list.',
  },
  {
    label: 'Public tasks',
    value: 'public',
    description: 'This friend can see tasks not marked private.',
  },
  {
    label: 'All tasks',
    value: 'all',
    description: 'This friend can see public and private tasks.',
  },
];

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Something went wrong. Please try again.';

const getFriendContactLabel = (contact: SavedFriendContact): string =>
  contact.friendDisplayName
    ? `${contact.nickname} (${contact.friendDisplayName})`
    : contact.nickname;

const getFriendContactMeta = (contact: SavedFriendContact): string =>
  `@${contact.friendUsername}`;

const getRecordString = (
  record: Record<string, unknown> | undefined,
  key: string,
): string | undefined => {
  const value = record?.[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
};

const formatPriorityLabel = (value?: TaskPriority) =>
  value ? `${value.slice(0, 1).toUpperCase()}${value.slice(1)}` : 'Auto';

const formatSuggestedDateTime = (value?: string): string | undefined =>
  value ? formatDateTime(value) ?? value : undefined;

const getFriendTaskEditChangeRows = (event: AppPopupEvent): string[] => {
  const payload = event.payload;
  const rows = [
    getRecordString(payload, 'suggestedTitle')
      ? `Title: ${getRecordString(payload, 'suggestedTitle')}`
      : null,
    getRecordString(payload, 'suggestedNotes')
      ? `Description: ${getRecordString(payload, 'suggestedNotes')}`
      : null,
    getRecordString(payload, 'suggestedDueAt')
      ? `Due date: ${formatSuggestedDateTime(getRecordString(payload, 'suggestedDueAt'))}`
      : null,
    getRecordString(payload, 'suggestedReminderAt')
      ? `Reminder: ${formatSuggestedDateTime(getRecordString(payload, 'suggestedReminderAt'))}`
      : null,
    getRecordString(payload, 'suggestedPriority')
      ? `Priority: ${formatPriorityLabel(getRecordString(payload, 'suggestedPriority') as TaskPriority)}`
      : null,
  ].filter((value): value is string => Boolean(value));

  return rows.length ? rows : [event.message];
};

type FieldErrorProps = {
  message?: string;
};

function FieldError({ message }: FieldErrorProps) {
  return message ? <p className="field-error">{message}</p> : null;
}

const submitFormOnEnter = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
  if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) {
    return;
  }

  event.preventDefault();
  event.currentTarget.form?.requestSubmit();
};

type FriendRecipientPickerProps = {
  id: string;
  label: string;
  contacts: SavedFriendContact[];
  value: string;
  selectedAccountId: string;
  error?: string;
  onSelect: (contact: SavedFriendContact) => void;
  onClear: (value: string) => void;
};

function FriendRecipientPicker({
  id,
  label,
  contacts,
  value,
  selectedAccountId,
  error,
  onSelect,
  onClear,
}: FriendRecipientPickerProps) {
  const query = value.trim().toLowerCase();
  const filteredContacts = contacts
    .filter((contact) => {
      if (!query) {
        return true;
      }

      return [contact.nickname, contact.friendUsername, contact.friendDisplayName ?? '']
        .some((candidate) => candidate.toLowerCase().includes(query));
    })
    .slice(0, 6);

  return (
    <div className="field friend-search-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        value={value}
        maxLength={64}
        placeholder="Search saved friends"
        onChange={(event) => onClear(event.target.value.replace(/^@/, ''))}
        autoComplete="off"
      />
      <div className="friend-search-menu">
        {filteredContacts.length ? (
          filteredContacts.map((contact) => (
            <button
              key={contact.id}
              className={`friend-search-option${
                selectedAccountId === contact.friendAccountId ? ' is-selected' : ''
              }`}
              type="button"
              onClick={() => onSelect(contact)}
            >
              <span>{getFriendContactLabel(contact)}</span>
              <small>{getFriendContactMeta(contact)}</small>
            </button>
          ))
        ) : (
          <p className="friend-search-empty">No saved friends match that search.</p>
        )}
      </div>
      <FieldError message={error} />
    </div>
  );
}

const createEmptyTaskForm = (): OneOffFormValues => ({
  title: '',
  dueDate: '',
  dueTime: '',
  reminderDate: '',
  reminderTime: '',
  notes: '',
  priority: 'auto',
  visibility: 'public',
});

const createEmptyRoutineForm = (): RoutineFormValues => ({
  title: '',
  priority: 'auto',
  interval: '1',
  unit: 'day',
  weekdays: [getWeekdayForDateString(toLocalDateString(new Date()))],
  startDate: toLocalDateString(new Date()),
  endDate: '',
  dueTime: '',
  reminderTime: '',
  notes: '',
});

const createEmptyMiniComposer = (): MiniComposerValues => ({
  title: '',
  repeat: 'none',
  weekdays: [getWeekdayForDateString(toLocalDateString(new Date()))],
  dueDate: '',
  dueTime: '',
  reminderDate: '',
  reminderTime: '',
  priority: 'auto',
});

const createEmptyTimeBlockForm = (date = toLocalDateString(new Date())): TimeBlockFormValues => ({
  title: '',
  taskId: '',
  date,
  startTime: '09:00',
  endTime: '10:00',
  notes: '',
  enableDnd: false,
});

const createEmptyFriendTaskSuggestionForm = (): FriendTaskSuggestionFormValues => ({
  recipientUsername: '',
  recipientAccountId: '',
  senderName: '',
  ...createEmptyTaskForm(),
});

const createEmptyFriendTaskEditSuggestionForm =
  (): FriendTaskEditSuggestionFormValues => ({
    recipientUsername: '',
    recipientAccountId: '',
    senderName: '',
    publicTaskId: '',
    taskTitle: '',
    suggestedTitle: '',
    suggestedNotes: '',
    suggestedDueDate: '',
    suggestedDueTime: '',
    suggestedReminderDate: '',
    suggestedReminderTime: '',
    suggestedPriority: 'auto',
    suggestedRoutineInterval: '1',
    suggestedRoutineUnit: 'day',
    suggestedRoutineWeekdays: [getWeekdayForDateString(toLocalDateString(new Date()))],
    suggestedRoutineStartDate: toLocalDateString(new Date()),
    suggestedRoutineEndDate: '',
    suggestedRoutineDueTime: '',
    suggestedRoutineReminderTime: '',
  });

const toLocalDateTimeInputValue = (value?: string): string => {
  if (!value) {
    return '';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const timezoneOffset = date.getTimezoneOffset();
  return new Date(date.getTime() - timezoneOffset * 60_000)
    .toISOString()
    .slice(0, 16);
};

const splitDateTimeValue = (
  value?: string,
): {
  date: string;
  time: string;
} => {
  const normalizedValue = toLocalDateTimeInputValue(value);

  if (!normalizedValue) {
    return {
      date: '',
      time: '',
    };
  }

  return {
    date: normalizedValue.slice(0, 10),
    time: normalizedValue.slice(11, 16),
  };
};

const combineLocalDateTimeValue = (
  dateValue: string,
  timeValue: string,
  fallbackDate: string,
  fallbackTime: string,
): string | undefined => {
  if (!dateValue && !timeValue) {
    return undefined;
  }

  return `${dateValue || fallbackDate}T${timeValue || fallbackTime}`;
};

const toIsoValue = (value: string): string | undefined => {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return date.toISOString();
};

const formatDateTime = (value?: string): string | null => {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return dateTimeFormatter.format(date);
};

const formatDateOnly = (value: string): string => {
  const date = new Date(`${value}T12:00:00`);
  return dateFormatter.format(date);
};

const formatTimeOnly = (value: string): string => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return timeFormatter.format(date);
};

const formatMinutes = (minutes: number): string => {
  if (minutes < 60) {
    return `${Math.round(minutes)}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = Math.round(minutes % 60);

  return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
};

const createTaskFormValues = (task?: Task): OneOffFormValues => {
  const dueValues = splitDateTimeValue(task?.dueAt);
  const reminderValues = splitDateTimeValue(task?.reminderAt);

  return {
    title: task?.title ?? '',
    dueDate: dueValues.date,
    dueTime: dueValues.time,
    reminderDate: reminderValues.date,
    reminderTime: reminderValues.time,
    notes: task?.notes ?? '',
    priority: normalizeTaskPriority(task?.priority),
    visibility: task?.visibility === 'private' ? 'private' : 'public',
  };
};

const createRoutineFormValues = (
  template?: RoutineTemplate,
): RoutineFormValues => {
  if (!template) {
    return createEmptyRoutineForm();
  }

  return {
    title: template.title,
    priority: normalizeTaskPriority(template.priority),
    interval: String(template.rule.interval),
    unit: template.rule.unit,
    weekdays: template.rule.weekdays ?? [],
    startDate: template.rule.startDate,
    endDate: template.rule.endDate ?? '',
    dueTime: template.rule.dueTime ?? '',
    reminderTime: template.rule.reminderTime ?? '',
    notes: template.notes ?? '',
  };
};

const buildTaskDraft = (values: OneOffFormValues): TaskDraft => {
  const today = toLocalDateString(new Date());
  const dueLocalValue = combineLocalDateTimeValue(
    values.dueDate,
    values.dueTime,
    today,
    '23:59',
  );
  const reminderLocalValue = combineLocalDateTimeValue(
    values.reminderDate,
    values.reminderTime,
    values.reminderDate || values.dueDate || today,
    '09:00',
  );

  return {
    title: values.title,
    dueAt: dueLocalValue ? toIsoValue(dueLocalValue) : undefined,
    reminderAt: reminderLocalValue ? toIsoValue(reminderLocalValue) : undefined,
    notes: values.notes,
    priority: values.priority,
    visibility: values.visibility,
  };
};

const buildTaskUpdate = (taskId: string, values: OneOffFormValues): TaskUpdate => {
  const today = toLocalDateString(new Date());
  const dueLocalValue = combineLocalDateTimeValue(
    values.dueDate,
    values.dueTime,
    today,
    '23:59',
  );
  const reminderLocalValue = combineLocalDateTimeValue(
    values.reminderDate,
    values.reminderTime,
    values.reminderDate || values.dueDate || today,
    '09:00',
  );

  return {
    id: taskId,
    title: values.title,
    dueAt: dueLocalValue ? toIsoValue(dueLocalValue) ?? null : null,
    reminderAt: reminderLocalValue ? toIsoValue(reminderLocalValue) ?? null : null,
    notes: values.notes.trim() ? values.notes : null,
    priority: values.priority,
    visibility: values.visibility,
  };
};

const buildTimeBlockDraft = (values: TimeBlockFormValues): TimeBlockDraft => {
  const startAt = toIsoValue(`${values.date}T${values.startTime}`);
  const endAt = toIsoValue(`${values.date}T${values.endTime}`);

  if (!startAt || !endAt) {
    throw new Error('Choose a valid time block date and time.');
  }

  return {
    title: values.title,
    startAt,
    endAt,
    taskId: values.taskId || undefined,
    notes: values.notes || undefined,
    enableDnd: values.enableDnd,
  };
};

const createTimeBlockFormValues = (block: TimeBlock): TimeBlockFormValues => {
  const startValues = splitDateTimeValue(block.startAt);
  const endValues = splitDateTimeValue(block.endAt);

  return {
    title: block.title,
    taskId: block.taskId ?? '',
    date: startValues.date || toLocalDateString(new Date()),
    startTime: startValues.time || '09:00',
    endTime: endValues.time || '10:00',
    notes: block.notes ?? '',
    enableDnd: Boolean(block.enableDnd),
  };
};

const getTimeBlockMinutes = (block: TimeBlock): number =>
  Math.max(0, (new Date(block.endAt).getTime() - new Date(block.startAt).getTime()) / 60_000);

const CALENDAR_HOUR_HEIGHT = 64;

const getMinutesSinceMidnight = (value: string): number => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 0;
  }

  return date.getHours() * 60 + date.getMinutes();
};

const getCalendarBlockStyle = (block: TimeBlock): React.CSSProperties => {
  const startMinutes = getMinutesSinceMidnight(block.startAt);
  const duration = Math.max(15, getTimeBlockMinutes(block));

  return {
    top: `${(startMinutes / 60) * CALENDAR_HOUR_HEIGHT}px`,
    height: `${Math.max(32, (duration / 60) * CALENDAR_HOUR_HEIGHT)}px`,
  };
};

const formatHourLabel = (hour: number): string =>
  timeFormatter.format(new Date(2026, 0, 1, hour, 0));

const buildRoutineDraft = (values: RoutineFormValues): RoutineDraft => ({
  title: values.title,
  notes: values.notes,
  priority: values.priority,
  rule: {
    interval: Number(values.interval),
    unit: values.unit,
    weekdays: values.unit === 'week' ? values.weekdays : undefined,
    startDate: values.startDate,
    endDate: values.endDate || undefined,
    dueTime: values.dueTime || undefined,
    reminderTime: values.reminderTime || undefined,
  },
});

const buildSuggestedRoutineRule = (
  values: FriendTaskEditSuggestionFormValues,
): RoutineDraft['rule'] => ({
  interval: Number(values.suggestedRoutineInterval),
  unit: values.suggestedRoutineUnit,
  weekdays:
    values.suggestedRoutineUnit === 'week'
      ? values.suggestedRoutineWeekdays
      : undefined,
  startDate: values.suggestedRoutineStartDate,
  endDate: values.suggestedRoutineEndDate || undefined,
  dueTime: values.suggestedRoutineDueTime || undefined,
  reminderTime: values.suggestedRoutineReminderTime || undefined,
});

const shiftMonthKey = (monthKey: string, delta: number): string =>
  addMonthsToDateString(`${monthKey}-01`, delta).slice(0, 7);

const buildCalendarCells = (monthKey: string): Array<string | null> => {
  const [year, month] = monthKey.split('-').map(Number);
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const cells: Array<string | null> = [];

  for (let index = 0; index < firstDay.getDay(); index += 1) {
    cells.push(null);
  }

  for (let day = 1; day <= lastDay.getDate(); day += 1) {
    const date = new Date(year, month - 1, day, 12, 0, 0, 0);
    cells.push(toLocalDateString(date));
  }

  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  return cells;
};

const buildWeekDates = (startDate: string): string[] =>
  Array.from({ length: 7 }, (_value, index) => addDaysToDateString(startDate, index));

const getRoutineStatusTone = (status: OccurrenceStatus | 'ended'): 'accent' | 'success' | 'danger' | 'muted' => {
  switch (status) {
    case 'completed':
      return 'success';
    case 'missed':
      return 'danger';
    case 'pending':
      return 'accent';
    default:
      return 'muted';
  }
};

const getRoutineStatusLabel = (item: RoutineListItem): string => {
  if (!item.currentOccurrence) {
    return 'Ended';
  }

  return item.currentOccurrence.status === 'completed' ? 'Done' : 'Active';
};

const joinMeta = (...parts: Array<string | null | undefined>): string =>
  parts.filter((part): part is string => Boolean(part)).join(' / ');

const isPassiveTask = (task: Task): boolean => !task.dueAt;

const getCompletedLocalDate = (value?: string): string | null => {
  if (!value) {
    return null;
  }

  return toLocalDateString(new Date(value));
};

const getCompletedTaskDate = (task: Task): string | null => {
  return getCompletedLocalDate(task.completedAt);
};

const getHashRoute = (): string => {
  const rawHash = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash;

  return rawHash.split('?')[0] ?? '';
};

const getReminderPopupPayload = (): ReminderPopupPayload | null => {
  const rawHash = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash;
  const queryIndex = rawHash.indexOf('?');

  if (queryIndex === -1) {
    return null;
  }

  const params = new URLSearchParams(rawHash.slice(queryIndex + 1));
  const encodedPayload = params.get('payload');

  if (!encodedPayload) {
    return null;
  }

  try {
    const parsedPayload = JSON.parse(encodedPayload) as {
      title?: unknown;
      body?: unknown;
      selection?: unknown;
      contextLabel?: unknown;
      contextValue?: unknown;
      presentation?: unknown;
      queuedCount?: unknown;
      sourceEventId?: unknown;
    };

    if (
      typeof parsedPayload.title !== 'string' ||
      typeof parsedPayload.body !== 'string'
    ) {
      return null;
    }

    const selectionCandidate = parsedPayload.selection;
    const selection =
      selectionCandidate &&
      typeof selectionCandidate === 'object' &&
      selectionCandidate !== null &&
      'kind' in selectionCandidate &&
      'id' in selectionCandidate
        ? (() => {
            const nextSelection = selectionCandidate as {
              kind?: unknown;
              id?: unknown;
            };

            if (
              (nextSelection.kind === 'task' || nextSelection.kind === 'routine') &&
              typeof nextSelection.id === 'string'
            ) {
              return nextSelection as AppSelection;
            }

            if (
              nextSelection.kind === 'view' &&
              (nextSelection.id === 'submissions' || nextSelection.id === 'network')
            ) {
              return nextSelection as AppSelection;
            }

            return undefined;
          })()
        : undefined;

    return {
      title: parsedPayload.title,
      body: parsedPayload.body,
      selection,
      contextLabel:
        typeof parsedPayload.contextLabel === 'string'
          ? parsedPayload.contextLabel
          : undefined,
      contextValue:
        typeof parsedPayload.contextValue === 'string'
          ? parsedPayload.contextValue
          : undefined,
      presentation:
        parsedPayload.presentation === 'mega' ||
        parsedPayload.presentation === 'standard'
          ? parsedPayload.presentation
          : undefined,
      queuedCount:
        typeof parsedPayload.queuedCount === 'number' ? parsedPayload.queuedCount : undefined,
      sourceEventId:
        typeof parsedPayload.sourceEventId === 'string'
          ? parsedPayload.sourceEventId
          : undefined,
    };
  } catch (_error) {
    return null;
  }
};

const buildWeeklyPlan = (
  tasks: Task[],
  routines: RoutineListItem[],
  weekDates: string[],
): Map<string, WeeklyPlanItem[]> => {
  const today = weekDates[0];
  const weekEnd = weekDates[weekDates.length - 1];
  const planMap = new Map<string, WeeklyPlanItem[]>(
    weekDates.map((dateValue) => [dateValue, []]),
  );

  tasks
    .filter((task) => task.status === 'pending')
    .forEach((task) => {
      const priorityDetails = getTaskPriorityDetails(task);
      const sourceDate = task.dueAt ? toLocalDateString(new Date(task.dueAt)) : today;
      const targetDate =
        compareLocalDateStrings(sourceDate, today) < 0 ? today : sourceDate;

      if (compareLocalDateStrings(targetDate, weekEnd) > 0) {
        return;
      }

      const dueLabel = formatDateTime(task.dueAt);
      const meta = !task.dueAt
        ? 'No deadline - stays open until you finish it'
        : compareLocalDateStrings(sourceDate, today) < 0
        ? `Overdue - original due ${formatDateOnly(sourceDate)}`
        : dueLabel
        ? `Due ${dueLabel}`
        : 'Due by end of day';

      planMap.get(targetDate)?.push({
        id: `task-${task.id}`,
        kind: 'task',
        title: task.title,
        scheduledDate: targetDate,
        meta: joinMeta(priorityDetails.label, meta),
        tone: !task.dueAt
          ? 'muted'
          : compareLocalDateStrings(sourceDate, today) < 0
          ? 'danger'
          : 'accent',
      });
    });

  routines.forEach((item) => {
    const priorityDetails = getRoutinePriorityDetails({
      priority: item.template.priority,
      currentOccurrence: item.currentOccurrence,
    });
    const scheduledDates = listScheduledDatesUntil(item.template.rule, weekEnd).filter(
      (scheduledDate) => compareLocalDateStrings(scheduledDate, today) >= 0,
    );

    scheduledDates.forEach((scheduledDate) => {
      const currentOccurrence = item.currentOccurrence;
      const currentMatches = currentOccurrence?.scheduledDate === scheduledDate;
      const tone = currentMatches
        ? getRoutineStatusTone(currentOccurrence?.status ?? 'pending')
        : 'muted';
      const meta = currentMatches && currentOccurrence?.status === 'completed'
        ? 'Already completed for this cycle'
        : item.template.rule.dueTime
        ? `Due ${formatDateTime(getDueAtForScheduledDate(item.template.rule, scheduledDate)) ?? item.template.rule.dueTime}`
        : 'Due by end of day';

      planMap.get(scheduledDate)?.push({
        id: `routine-${item.template.id}-${scheduledDate}`,
        kind: 'routine',
        title: item.template.title,
        scheduledDate,
        meta: joinMeta(priorityDetails.label, meta),
        tone,
      });
    });
  });

  weekDates.forEach((dateValue) => {
    const items = planMap.get(dateValue);

    if (!items) {
      return;
    }

    items.sort((left, right) => {
      if (left.kind !== right.kind) {
        return left.kind === 'task' ? -1 : 1;
      }

      return left.title.localeCompare(right.title);
    });
  });

  return planMap;
};

function PickerRow({ choices, currentValue, onSelect }: PickerRowProps) {
  return (
    <div className="picker-row">
      {choices.map((choice) => (
        <button
          key={`${choice.label}-${choice.value}`}
          className={`picker-chip ${currentValue === choice.value ? 'is-active' : ''}`}
          type="button"
          onClick={() => onSelect(choice.value)}
        >
          {choice.label}
        </button>
      ))}
    </div>
  );
}

function ScheduleCard({
  title,
  dateValue = '',
  timeValue = '',
  dateInputId,
  timeInputId,
  showDate = true,
  timeLabel,
  datePresets = [],
  timePresets = [],
  onDateChange,
  onTimeChange,
  onClear,
}: ScheduleCardProps) {
  const hasValue = Boolean(dateValue || timeValue);

  return (
    <div className="schedule-card">
      <div className="schedule-card-header">
        <span>{title}</span>
        {hasValue ? (
          <button className="link-button" type="button" onClick={onClear}>
            Clear
          </button>
        ) : null}
      </div>

      {showDate ? (
        <div className="field">
          <label htmlFor={dateInputId}>Date</label>
          <input
            id={dateInputId}
            className="schedule-input"
            type="date"
            value={dateValue}
            onChange={(event) => {
              onDateChange?.(event.currentTarget.value);
            }}
          />
          {datePresets.length ? (
            <PickerRow
              choices={datePresets}
              currentValue={dateValue}
              onSelect={(value) => onDateChange?.(value)}
            />
          ) : null}
        </div>
      ) : null}

      <div className="field">
        <label htmlFor={timeInputId}>{timeLabel ?? (showDate ? 'Time' : 'Due time')}</label>
        <input
          id={timeInputId}
          className="schedule-input"
          type="time"
          value={timeValue}
          onChange={(event) => {
            onTimeChange(event.currentTarget.value);
          }}
        />
        {timePresets.length ? (
          <PickerRow
            choices={timePresets}
            currentValue={timeValue}
            onSelect={onTimeChange}
          />
        ) : null}
      </div>
    </div>
  );
}

class AppErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    errorMessage: null,
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      errorMessage: error.message || 'The renderer hit an unexpected problem.',
    };
  }

  render() {
    if (this.state.errorMessage) {
      return (
        <main className="app-shell">
          <section className="error-screen">
            <p className="section-kicker">Renderer Error</p>
            <h1>The window hit a problem.</h1>
            <p className="section-copy">{this.state.errorMessage}</p>
            <p className="section-copy">
              The latest build hardens the input path, so if this still appears tell me
              which field triggered it and I will keep digging.
            </p>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}

function TaskRow({
  task,
  isSelected,
  onComplete,
  onReopen,
  onDelete,
  onSave,
}: TaskRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const hasAutoOpenedSelection = useRef(false);
  const [formValues, setFormValues] = useState<OneOffFormValues>(() =>
    createTaskFormValues(task),
  );

  useEffect(() => {
    if (!isEditing) {
      setFormValues(createTaskFormValues(task));
    }
  }, [
    isEditing,
    task.completedAt,
    task.dueAt,
    task.id,
    task.notes,
    task.priority,
    task.reminderAt,
    task.status,
    task.title,
  ]);

  useEffect(() => {
    if (!isSelected) {
      hasAutoOpenedSelection.current = false;
      return;
    }

    if (task.status === 'pending' && !hasAutoOpenedSelection.current) {
      setIsEditing(true);
      hasAutoOpenedSelection.current = true;
    }
  }, [isSelected, task.status]);

  const dueLabel = formatDateTime(task.dueAt);
  const reminderLabel = formatDateTime(task.reminderAt);
  const completedLabel = formatDateTime(task.completedAt);
  const priorityDetails = getTaskPriorityDetails(task);
  const metaLine = joinMeta(
    `Priority ${priorityDetails.label}`,
    reminderLabel ? `Reminder ${reminderLabel}` : null,
    dueLabel ? `Due ${dueLabel}` : task.dueAt ? 'Due by end of day' : 'No deadline',
    completedLabel ? `Done ${completedLabel}` : null,
  );

  const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsBusy(true);
    setLocalError(null);

    try {
      await onSave(buildTaskUpdate(task.id, formValues));
      setIsEditing(false);
    } catch (error) {
      setLocalError(getErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  };

  const handleComplete = async () => {
    setIsBusy(true);
    setLocalError(null);

    try {
      await onComplete(task.id);
    } catch (error) {
      setLocalError(getErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  };

  const handleReopen = async () => {
    setIsBusy(true);
    setLocalError(null);

    try {
      await onReopen(task.id);
    } catch (error) {
      setLocalError(getErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  };

  const handleDelete = async () => {
    setIsBusy(true);
    setLocalError(null);

    try {
      await onDelete(task.id);
    } catch (error) {
      setLocalError(getErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <article
      className={`task-row ${isSelected ? 'is-selected' : ''}`}
      data-task-id={task.id}
    >
      <div className="row-main">
        <button
          className={`check-toggle ${task.status === 'completed' ? 'is-complete' : ''}`}
          type="button"
          onClick={task.status === 'pending' ? handleComplete : handleReopen}
          disabled={isBusy}
          aria-label={task.status === 'completed' ? 'Reopen task' : 'Mark task complete'}
        >
          {task.status === 'completed' ? 'Y' : ''}
        </button>

        <div className="row-copy">
          <div className="row-title-line">
            <h3 className={`row-title ${task.status === 'completed' ? 'is-complete' : ''}`}>
              {task.title}
            </h3>
            <span className={`status-chip ${task.status === 'completed' ? 'success' : 'accent'}`}>
              {task.status === 'completed' ? 'done' : 'open'}
            </span>
            <span className={`status-chip ${priorityDetails.tone}`}>
              {priorityDetails.label}
            </span>
            <span className={`status-chip ${task.visibility === 'private' ? 'muted' : 'success'}`}>
              {task.visibility === 'private' ? 'private' : 'public'}
            </span>
          </div>

          {task.notes ? <p className="row-note">{task.notes}</p> : null}
          <p className="row-meta">{metaLine}</p>
        </div>

        <div className="row-side-actions">
          <button
            className="link-button"
            type="button"
            onClick={() =>
              task.status === 'pending'
                ? setIsEditing((current) => !current)
                : handleReopen()
            }
          >
            {task.status === 'pending' ? (isEditing ? 'Hide' : 'Edit') : 'Reopen'}
          </button>
          <button className="link-button danger-link" type="button" onClick={handleDelete}>
            Delete
          </button>
        </div>
      </div>

      {task.status === 'completed' ? (
        <div className="row-actions compact">
          <span className="row-meta">Click the circle to reopen this task.</span>
        </div>
      ) : (
        <div className="row-actions compact">
          <span className="row-meta">Click the circle to mark this complete.</span>
        </div>
      )}

      {localError ? <div className="banner">{localError}</div> : null}

      {task.status === 'pending' && isEditing ? (
        <form className="inline-editor" onSubmit={handleSave}>
          <div className="field">
            <label htmlFor={`task-title-${task.id}`}>Title</label>
            <input
              id={`task-title-${task.id}`}
              value={formValues.title}
              onChange={(event) => {
                const { value } = event.currentTarget;
                setFormValues((current) => ({
                  ...current,
                  title: value,
                }));
              }}
            />
          </div>

          <div className="field">
            <label htmlFor={`task-priority-${task.id}`}>Priority</label>
            <select
              id={`task-priority-${task.id}`}
              value={formValues.priority}
              onChange={(event) => {
                const { value } = event.currentTarget;
                setFormValues((current) => ({
                  ...current,
                  priority: value as TaskPriority,
                }));
              }}
            >
              {TASK_PRIORITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <div className="field-hint">
              {
                TASK_PRIORITY_OPTIONS.find((option) => option.value === formValues.priority)
                  ?.description
              }
            </div>
          </div>

          <div className="field">
            <label htmlFor={`task-visibility-${task.id}`}>Friend visibility</label>
            <select
              id={`task-visibility-${task.id}`}
              value={formValues.visibility}
              onChange={(event) => {
                const { value } = event.currentTarget;
                setFormValues((current) => ({
                  ...current,
                  visibility: value as TaskVisibility,
                }));
              }}
            >
              {TASK_VISIBILITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <div className="field-hint">
              {
                TASK_VISIBILITY_OPTIONS.find(
                  (option) => option.value === formValues.visibility,
                )?.description
              }
            </div>
          </div>

          <div className="schedule-grid">
            <ScheduleCard
              title="Reminder"
              dateInputId={`task-reminder-date-${task.id}`}
              timeInputId={`task-reminder-time-${task.id}`}
              dateValue={formValues.reminderDate}
              timeValue={formValues.reminderTime}
              datePresets={getDatePresetChoices()}
              timePresets={REMINDER_TIME_PRESETS}
              onDateChange={(value) =>
                setFormValues((current) => ({
                  ...current,
                  reminderDate: value,
                }))
              }
              onTimeChange={(value) =>
                setFormValues((current) => ({
                  ...current,
                  reminderTime: value,
                }))
              }
              onClear={() =>
                setFormValues((current) => ({
                  ...current,
                  reminderDate: '',
                  reminderTime: '',
                }))
              }
            />

            <ScheduleCard
              title="Due"
              dateInputId={`task-due-date-${task.id}`}
              timeInputId={`task-due-time-${task.id}`}
              dateValue={formValues.dueDate}
              timeValue={formValues.dueTime}
              datePresets={getDatePresetChoices()}
              timePresets={DUE_TIME_PRESETS}
              onDateChange={(value) =>
                setFormValues((current) => ({
                  ...current,
                  dueDate: value,
                }))
              }
              onTimeChange={(value) =>
                setFormValues((current) => ({
                  ...current,
                  dueTime: value,
                }))
              }
              onClear={() =>
                setFormValues((current) => ({
                  ...current,
                  dueDate: '',
                  dueTime: '',
                }))
              }
            />
          </div>

          <div className="field">
            <label htmlFor={`task-notes-${task.id}`}>Notes</label>
            <textarea
              id={`task-notes-${task.id}`}
              value={formValues.notes}
              onChange={(event) => {
                const { value } = event.currentTarget;
                setFormValues((current) => ({
                  ...current,
                  notes: value,
                }));
              }}
            />
          </div>

          <div className="row-actions">
            <button className="soft-button primary" type="submit" disabled={isBusy}>
              Save
            </button>
            <button
              className="soft-button"
              type="button"
              disabled={isBusy}
              onClick={() => {
                setFormValues(createTaskFormValues(task));
                setLocalError(null);
                setIsEditing(false);
              }}
            >
              Cancel
            </button>
            <button
              className="soft-button danger-button"
              type="button"
              disabled={isBusy}
              onClick={handleDelete}
            >
              Delete
            </button>
          </div>
        </form>
      ) : null}
    </article>
  );
}

function RoutineRow({
  item,
  isSelected,
  onComplete,
  onReopen,
  onDelete,
  onEdit,
}: RoutineRowProps) {
  const [isBusy, setIsBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const priorityDetails = getRoutinePriorityDetails({
    priority: item.template.priority,
    currentOccurrence: item.currentOccurrence,
  });
  const scheduleLabel = item.currentOccurrence
    ? joinMeta(
        `Cycle ${formatDateOnly(item.currentOccurrence.scheduledDate)}`,
        formatDateTime(item.currentOccurrence.dueAt)
          ? `Boundary ${formatDateTime(item.currentOccurrence.dueAt)}`
          : 'Due by end of day',
      )
    : 'No active cycle';

  const historyLabel = joinMeta(
    `${item.historySummary.totalCompleted} completed`,
    `${item.historySummary.totalMissed} missed`,
    `${item.historySummary.completionRate}% rate`,
  );

  const handleComplete = async () => {
    setIsBusy(true);
    setLocalError(null);

    try {
      await onComplete(item.template.id);
    } catch (error) {
      setLocalError(getErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  };

  const handleDelete = async () => {
    setIsBusy(true);
    setLocalError(null);

    try {
      await onDelete(item.template.id);
    } catch (error) {
      setLocalError(getErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  };

  const handleReopen = async () => {
    setIsBusy(true);
    setLocalError(null);

    try {
      await onReopen(item.template.id);
    } catch (error) {
      setLocalError(getErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <article className={`task-row routine ${isSelected ? 'is-selected' : ''}`} data-routine-id={item.template.id}>
      <div className="row-main">
        <button
          className={`check-toggle routine-toggle ${item.currentOccurrence?.status === 'completed' ? 'is-complete' : ''}`}
          type="button"
          onClick={
            item.currentOccurrence?.status === 'pending'
              ? handleComplete
              : item.currentOccurrence?.status === 'completed'
              ? handleReopen
              : undefined
          }
          disabled={!item.currentOccurrence || isBusy}
          aria-label={
            item.currentOccurrence?.status === 'completed'
              ? 'Reopen routine cycle'
              : 'Mark routine cycle complete'
          }
        >
          {item.currentOccurrence?.status === 'completed' ? 'Y' : ''}
        </button>

        <div className="row-copy">
          <div className="row-title-line">
            <h3 className="row-title">{item.template.title}</h3>
            <span className={`status-chip ${getRoutineStatusTone(item.currentOccurrence?.status ?? 'ended')}`}>
              {getRoutineStatusLabel(item)}
            </span>
            <span className={`status-chip ${priorityDetails.tone}`}>{priorityDetails.label}</span>
          </div>

          <p className="row-meta">{formatRoutineRule(item.template.rule)}</p>
          <p className="row-meta">{scheduleLabel}</p>
          <p className="row-meta">{historyLabel}</p>
          {item.template.notes ? <p className="row-note">{item.template.notes}</p> : null}
        </div>

        <div className="row-side-actions">
          <button className="link-button" type="button" onClick={() => onEdit(item.template)}>
            Edit
          </button>
          <button className="link-button danger-link" type="button" onClick={handleDelete}>
            Delete
          </button>
        </div>
      </div>

      <div className="row-actions compact">
        <span className="row-meta">
          {item.currentOccurrence?.status === 'completed'
            ? 'Click the circle to reopen this cycle.'
            : item.currentOccurrence?.status === 'pending'
            ? 'Click the circle to complete this cycle.'
            : 'No active cycle right now.'}
        </span>
      </div>

      {localError ? <div className="banner">{localError}</div> : null}
    </article>
  );
}

function SubmissionRow({ submission, onAccept, onDismiss }: SubmissionRowProps) {
  const [isBusy, setIsBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const submittedLabel = formatDateTime(submission.createdAt);
  const metaLine = joinMeta(
    submission.senderName ? `From ${submission.senderName}` : 'No sender name',
    submission.source ? `Source ${submission.source}` : null,
    submittedLabel ? `Submitted ${submittedLabel}` : null,
  );

  const handleAccept = async () => {
    setIsBusy(true);
    setLocalError(null);

    try {
      await onAccept(submission.id);
    } catch (error) {
      setLocalError(getErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  };

  const handleDismiss = async () => {
    setIsBusy(true);
    setLocalError(null);

    try {
      await onDismiss(submission.id);
    } catch (error) {
      setLocalError(getErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <article className="task-row submission-row">
      <div className="row-main">
        <span className="routine-indicator muted" aria-hidden="true" />

        <div className="row-copy">
          <div className="row-title-line">
            <h3 className="row-title">{submission.title}</h3>
            <span className="status-chip danger">pending review</span>
          </div>

          {submission.details ? <p className="row-note">{submission.details}</p> : null}
          <p className="row-meta">{metaLine}</p>
        </div>

        <div className="row-side-actions">
          <button className="link-button" type="button" disabled={isBusy} onClick={handleAccept}>
            Accept
          </button>
          <button
            className="link-button danger-link"
            type="button"
            disabled={isBusy}
            onClick={handleDismiss}
          >
            Dismiss
          </button>
        </div>
      </div>

      <div className="row-actions compact">
        <span className="row-meta">
          Accept to turn this into a normal local task. Dismiss to keep it out of your main
          workflow.
        </span>
      </div>

      {localError ? <div className="banner">{localError}</div> : null}
    </article>
  );
}

function TaskEditSuggestionRow({
  suggestion,
  currentTask,
  onAccept,
  onDismiss,
}: TaskEditSuggestionRowProps) {
  const [isBusy, setIsBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const submittedLabel = formatDateTime(suggestion.createdAt);
  const metaLine = joinMeta(
    suggestion.senderName ? `From ${suggestion.senderName}` : 'No sender name',
    suggestion.source ? `Source ${suggestion.source}` : null,
    submittedLabel ? `Submitted ${submittedLabel}` : null,
  );

  const formatPriorityLabel = (value?: TaskPriority) =>
    value ? `${value.slice(0, 1).toUpperCase()}${value.slice(1)}` : 'Auto';

  const changeRows = [
    suggestion.changeTitle
      ? `Title: ${currentTask?.title ?? suggestion.taskTitleSnapshot} -> ${
          suggestion.suggestedTitle ?? 'Missing suggestion'
        }`
      : null,
    suggestion.changeNotes
      ? `Description: ${
          suggestion.suggestedNotes?.trim() ? suggestion.suggestedNotes : 'Clear description'
        }`
      : null,
    suggestion.changeDueAt
      ? `Due date: ${
          suggestion.suggestedDueAt
            ? formatDateTime(suggestion.suggestedDueAt) ?? suggestion.suggestedDueAt
            : 'Clear due date'
        }`
      : null,
    suggestion.changeReminderAt
      ? `Reminder date: ${
          suggestion.suggestedReminderAt
            ? formatDateTime(suggestion.suggestedReminderAt) ?? suggestion.suggestedReminderAt
            : 'Clear reminder date'
        }`
      : null,
    suggestion.changePriority
      ? `Priority: ${
          formatPriorityLabel(currentTask?.priority)
        } -> ${formatPriorityLabel(suggestion.suggestedPriority)}`
      : null,
  ].filter((value): value is string => Boolean(value));

  const handleAccept = async () => {
    setIsBusy(true);
    setLocalError(null);

    try {
      await onAccept(suggestion.id);
    } catch (error) {
      setLocalError(getErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  };

  const handleDismiss = async () => {
    setIsBusy(true);
    setLocalError(null);

    try {
      await onDismiss(suggestion.id);
    } catch (error) {
      setLocalError(getErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <article className="task-row submission-row">
      <div className="row-main">
        <span className="routine-indicator accent" aria-hidden="true" />

        <div className="row-copy">
          <div className="row-title-line">
            <h3 className="row-title">{suggestion.taskTitleSnapshot}</h3>
            <span className="status-chip accent">edit suggestion</span>
            {currentTask ? null : <span className="status-chip danger">task missing</span>}
          </div>

          <p className="row-meta">{metaLine}</p>
          {changeRows.map((changeRow) => (
            <p key={changeRow} className="row-note">
              {changeRow}
            </p>
          ))}
        </div>

        <div className="row-side-actions">
          <button
            className="link-button"
            type="button"
            disabled={isBusy || !currentTask}
            onClick={handleAccept}
          >
            Accept
          </button>
          <button
            className="link-button danger-link"
            type="button"
            disabled={isBusy}
            onClick={handleDismiss}
          >
            Dismiss
          </button>
        </div>
      </div>

      <div className="row-actions compact">
        <span className="row-meta">
          {currentTask
            ? 'Accept to apply these changes to the existing local task. Dismiss to leave the task unchanged.'
            : 'The original task no longer exists locally, so this suggestion can only be dismissed.'}
        </span>
      </div>

      {localError ? <div className="banner">{localError}</div> : null}
    </article>
  );
}

function HistoryDayModal({
  payload,
  isLoading,
  error,
  onClose,
  onRefresh,
  onTaskReopen,
  onTaskDelete,
  onTaskCompletionDateChange,
  onRoutineOccurrenceUpdate,
}: HistoryDayModalProps) {
  const [taskDates, setTaskDates] = useState<Record<string, string>>({});
  const [isBusy, setIsBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    setTaskDates(
      Object.fromEntries(
        payload.tasks.map((task) => [task.id, getCompletedTaskDate(task) ?? payload.date]),
      ),
    );
  }, [payload]);

  const combinedError = error ?? localError;
  const totalItems = payload.tasks.length + payload.routineEntries.length;

  return (
    <div className="history-modal-backdrop" onClick={onClose}>
      <section
        className="history-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="panel-top">
          <div>
            <p className="section-kicker">History Day</p>
            <h3>{formatDateOnly(payload.date)}</h3>
            <p className="section-copy">
              Review completed one-time tasks and routine outcomes for this day.
            </p>
          </div>

          <button className="soft-button" type="button" onClick={onClose}>
            Close
          </button>
        </div>

        {combinedError ? <div className="banner">{combinedError}</div> : null}

        {isLoading ? (
          <p className="empty-state">Loading day history...</p>
        ) : totalItems === 0 ? (
          <p className="empty-state">Nothing is recorded on this day yet.</p>
        ) : (
          <div className="history-day-grid">
            <div className="history-day-column">
              <div className="mini-section-head">
                <h4>One-time tasks</h4>
                <span className="status-chip success">{payload.tasks.length}</span>
              </div>

              {payload.tasks.length === 0 ? (
                <p className="empty-state">No completed one-time tasks on this day.</p>
              ) : (
                <div className="list-stack">
                  {payload.tasks.map((task) => (
                    <article key={task.id} className="history-entry-card">
                      <div className="row-title-line">
                        <h4 className="row-title">{task.title}</h4>
                        <span className={`status-chip ${getTaskPriorityDetails(task).tone}`}>
                          {getTaskPriorityDetails(task).label}
                        </span>
                      </div>
                      <p className="row-meta">
                        {formatDateTime(task.completedAt)
                          ? `Done ${formatDateTime(task.completedAt)}`
                          : 'Completed'}
                      </p>
                      <div className="history-entry-actions">
                        <div className="field">
                          <label htmlFor={`history-task-date-${task.id}`}>Completed on</label>
                          <input
                            id={`history-task-date-${task.id}`}
                            type="date"
                            value={taskDates[task.id] ?? payload.date}
                            onChange={(event) => {
                              const { value } = event.currentTarget;
                              setTaskDates((current) => ({
                                ...current,
                                [task.id]: value,
                              }));
                            }}
                          />
                        </div>
                        <div className="row-actions">
                          <button
                            className="soft-button"
                            type="button"
                            disabled={isBusy}
                            onClick={async () => {
                              setIsBusy(true);
                              setLocalError(null);

                              try {
                                await onTaskCompletionDateChange({
                                  id: task.id,
                                  completedDate: taskDates[task.id] ?? payload.date,
                                });
                                await onRefresh();
                              } catch (modalError) {
                                setLocalError(getErrorMessage(modalError));
                              } finally {
                                setIsBusy(false);
                              }
                            }}
                          >
                            Move date
                          </button>
                          <button
                            className="soft-button"
                            type="button"
                            disabled={isBusy}
                            onClick={async () => {
                              setIsBusy(true);
                              setLocalError(null);

                              try {
                                await onTaskReopen(task.id);
                                await onRefresh();
                              } catch (modalError) {
                                setLocalError(getErrorMessage(modalError));
                              } finally {
                                setIsBusy(false);
                              }
                            }}
                          >
                            Reopen
                          </button>
                          <button
                            className="soft-button danger-button"
                            type="button"
                            disabled={isBusy}
                            onClick={async () => {
                              setIsBusy(true);
                              setLocalError(null);

                              try {
                                await onTaskDelete(task.id);
                                await onRefresh();
                              } catch (modalError) {
                                setLocalError(getErrorMessage(modalError));
                              } finally {
                                setIsBusy(false);
                              }
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>

            <div className="history-day-column">
              <div className="mini-section-head">
                <h4>Routine outcomes</h4>
                <span className="status-chip muted">{payload.routineEntries.length}</span>
              </div>

              {payload.routineEntries.length === 0 ? (
                <p className="empty-state">No routine outcomes on this day.</p>
              ) : (
                <div className="list-stack">
                  {payload.routineEntries.map((entry) => (
                    <article key={entry.occurrence.id} className="history-entry-card">
                      <div className="row-title-line">
                        <h4 className="row-title">{entry.routine.title}</h4>
                        <span
                          className={`status-chip ${getRoutinePriorityDetails({
                            priority: entry.routine.priority,
                            currentOccurrence: entry.occurrence,
                          }).tone}`}
                        >
                          {getRoutinePriorityDetails({
                            priority: entry.routine.priority,
                            currentOccurrence: entry.occurrence,
                          }).label}
                        </span>
                        <span className={`status-chip ${getRoutineStatusTone(entry.occurrence.status)}`}>
                          {entry.occurrence.status}
                        </span>
                      </div>
                      <p className="row-meta">{formatRoutineRule(entry.routine.rule)}</p>
                      <p className="row-meta">
                        Boundary {formatDateTime(entry.occurrence.dueAt)}
                      </p>
                      <div className="row-actions">
                        <button
                          className="soft-button"
                          type="button"
                          disabled={isBusy || entry.occurrence.status === 'completed'}
                          onClick={async () => {
                            setIsBusy(true);
                            setLocalError(null);

                            try {
                              await onRoutineOccurrenceUpdate({
                                occurrenceId: entry.occurrence.id,
                                status: 'completed',
                              });
                              await onRefresh();
                            } catch (modalError) {
                              setLocalError(getErrorMessage(modalError));
                            } finally {
                              setIsBusy(false);
                            }
                          }}
                        >
                          Mark completed
                        </button>
                        <button
                          className="soft-button"
                          type="button"
                          disabled={isBusy || entry.occurrence.status === 'missed'}
                          onClick={async () => {
                            setIsBusy(true);
                            setLocalError(null);

                            try {
                              await onRoutineOccurrenceUpdate({
                                occurrenceId: entry.occurrence.id,
                                status: 'missed',
                              });
                              await onRefresh();
                            } catch (modalError) {
                              setLocalError(getErrorMessage(modalError));
                            } finally {
                              setIsBusy(false);
                            }
                          }}
                        >
                          Mark missed
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function MainScreen({ themeSettings, onThemeChange }: MainScreenProps) {
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [startupSettings, setStartupSettings] = useState<AppStartupSettings | null>(null);
  const [accountStatus, setAccountStatus] = useState<AccountStatus | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>([]);
  const [routines, setRoutines] = useState<RoutineListItem[]>([]);
  const [submissions, setSubmissions] = useState<WebsiteTaskSubmission[]>([]);
  const [editSuggestions, setEditSuggestions] = useState<WebsiteTaskEditSuggestion[]>([]);
  const [friendNetworkStatus, setFriendNetworkStatus] =
    useState<FriendNetworkStatus | null>(null);
  const [friendContacts, setFriendContacts] = useState<SavedFriendContact[]>([]);
  const [emergencyPasswords, setEmergencyPasswords] = useState<EmergencyPasswordGrant[]>([]);
  const [emergencyPasswordsForMe, setEmergencyPasswordsForMe] = useState<
    EmergencyPasswordGrant[]
  >([]);
  const [pendingFriendEvents, setPendingFriendEvents] = useState<AppPopupEvent[]>([]);
  const [recentFriendEvents, setRecentFriendEvents] = useState<AppPopupEvent[]>([]);
  const [historyPayload, setHistoryPayload] = useState<RoutineHistoryPayload | null>(null);
  const [historySummary, setHistorySummary] = useState<RoutineHistorySummary | null>(null);
  const [taskFormValues, setTaskFormValues] = useState<OneOffFormValues>(createEmptyTaskForm());
  const [plannerDate, setPlannerDate] = useState(toLocalDateString(new Date()));
  const [timeBlockForm, setTimeBlockForm] = useState<TimeBlockFormValues>(
    createEmptyTimeBlockForm(),
  );
  const [routineFormValues, setRoutineFormValues] = useState<RoutineFormValues>(
    createEmptyRoutineForm(),
  );
  const [displayNameDraft, setDisplayNameDraft] = useState('');
  const [accountForm, setAccountForm] = useState<AccountFormValues>({
    username: '',
    password: '',
  });
  const [friendContactForm, setFriendContactForm] = useState<FriendContactFormValues>({
    nickname: '',
    friendUsername: '',
    taskPermission: 'none',
  });
  const [emergencyPasswordForm, setEmergencyPasswordForm] =
    useState<EmergencyPasswordFormValues>({
      friendAccountId: '',
      password: '',
    });
  const [friendPopupForm, setFriendPopupForm] = useState<FriendPopupFormValues>({
    recipientUsername: '',
    recipientAccountId: '',
    senderName: '',
    relatedTaskId: '',
    message: '',
    isEmergency: false,
    emergencyPassword: '',
  });
  const [friendTaskSuggestionForm, setFriendTaskSuggestionForm] =
    useState<FriendTaskSuggestionFormValues>(createEmptyFriendTaskSuggestionForm());
  const [friendTaskEditSuggestionForm, setFriendTaskEditSuggestionForm] =
    useState<FriendTaskEditSuggestionFormValues>(
      createEmptyFriendTaskEditSuggestionForm(),
    );
  const [isRecentPopupsVisible, setIsRecentPopupsVisible] = useState(false);
  const [activeView, setActiveView] = useState<MainView>('today');
  const [activeNetworkPanel, setActiveNetworkPanel] =
    useState<FriendNetworkPanel>('friends');
  const [activePlannerPanel, setActivePlannerPanel] = useState<PlannerPanel>('day');
  const [editingRoutineId, setEditingRoutineId] = useState<string | null>(null);
  const [editingTimeBlockId, setEditingTimeBlockId] = useState<string | null>(null);
  const [editingTimeBlockForm, setEditingTimeBlockForm] =
    useState<TimeBlockFormValues | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedRoutineId, setSelectedRoutineId] = useState<string | null>(null);
  const [historyRoutineId, setHistoryRoutineId] = useState<string | null>(null);
  const [historyMonthKey, setHistoryMonthKey] = useState<string>(toMonthKey(new Date()));
  const [selectedHistoryDate, setSelectedHistoryDate] = useState<string | null>(null);
  const [historyDayPayload, setHistoryDayPayload] = useState<HistoryDayPayload | null>(null);
  const [showCompletedTasks, setShowCompletedTasks] = useState(false);
  const [taskDetailsOpen, setTaskDetailsOpen] = useState(false);
  const [routineEditorOpen, setRoutineEditorOpen] = useState(false);
  const [routineDetailsOpen, setRoutineDetailsOpen] = useState(true);
  const [isSettingsSyncing, setIsSettingsSyncing] = useState(false);
  const [settingsSyncStatus, setSettingsSyncStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [isHistoryDayLoading, setIsHistoryDayLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [friendFormErrors, setFriendFormErrors] = useState<Record<string, string>>({});
  const [friendPublicTasks, setFriendPublicTasks] = useState<PublicSharedTask[]>([]);
  const [isLoadingFriendPublicTasks, setIsLoadingFriendPublicTasks] = useState(false);
  const [friendPopupTasks, setFriendPopupTasks] = useState<PublicSharedTask[]>([]);
  const [isLoadingFriendPopupTasks, setIsLoadingFriendPopupTasks] = useState(false);
  const [visibleEmergencyPasswordIds, setVisibleEmergencyPasswordIds] = useState<
    Record<string, boolean>
  >({});
  const [historyDayError, setHistoryDayError] = useState<string | null>(null);

  const historyRoutineIdRef = useRef<string | null>(null);
  const routineEditorRef = useRef<HTMLElement | null>(null);
  const routineTitleInputRef = useRef<HTMLInputElement | null>(null);

  const syncDashboard = async (): Promise<RoutineListItem[]> => {
    const [nextAppInfo, nextAccountStatus, nextStartupSettings] = await Promise.all([
      window.todoApp.app.info(),
      window.todoApp.account.status(),
      window.todoApp.app.getStartupSettings(),
    ]);

    const [
      nextTasks,
      nextTimeBlocks,
      nextRoutines,
      nextSubmissions,
      nextEditSuggestions,
      nextFriendNetworkStatus,
      nextFriendContacts,
      nextEmergencyPasswords,
      nextEmergencyPasswordsForMe,
      nextPendingFriendEvents,
      nextRecentFriendEvents,
    ] = await Promise.all([
      window.todoApp.tasks.list(),
      window.todoApp.timeBlocks.list(),
      window.todoApp.routines.list(),
      nextAppInfo.isDevVariant ? window.todoApp.submissions.list() : Promise.resolve([]),
      nextAppInfo.isDevVariant ? window.todoApp.editSuggestions.list() : Promise.resolve([]),
      window.todoApp.friendNetwork.status(),
      window.todoApp.friendNetwork.listContacts(),
      window.todoApp.friendNetwork.listEmergencyPasswords(),
      window.todoApp.friendNetwork.listEmergencyPasswordsForMe(),
      window.todoApp.friendNetwork.listPendingEvents(),
      nextAppInfo.isDevVariant
        ? window.todoApp.friendNetwork.listRecentEvents()
        : Promise.resolve([]),
    ]);

    setAppInfo(nextAppInfo);
    setStartupSettings(nextStartupSettings);
    setAccountStatus(nextAccountStatus);
    setTasks(nextTasks);
    setTimeBlocks(nextTimeBlocks);
    setRoutines(nextRoutines);
    setSubmissions(nextSubmissions);
    setEditSuggestions(nextEditSuggestions);
    setFriendNetworkStatus(nextFriendNetworkStatus);
    setFriendContacts(nextFriendContacts);
    setEmergencyPasswords(nextEmergencyPasswords);
    setEmergencyPasswordsForMe(nextEmergencyPasswordsForMe);
    setPendingFriendEvents(nextPendingFriendEvents);
    setRecentFriendEvents(nextRecentFriendEvents);

    setSelectedRoutineId((current) => {
      if (current && nextRoutines.some((item) => item.template.id === current)) {
        return current;
      }

      return nextRoutines[0]?.template.id ?? null;
    });

    setHistoryRoutineId((current) => {
      if (current && nextRoutines.some((item) => item.template.id === current)) {
        return current;
      }

      return nextRoutines[0]?.template.id ?? null;
    });

    return nextRoutines;
  };

  const syncHistory = async (routineId: string | null) => {
    if (!routineId) {
      setHistoryPayload(null);
      setHistorySummary(null);
      return;
    }

    setIsHistoryLoading(true);

    try {
      const [nextHistory, nextSummary] = await Promise.all([
        window.todoApp.routines.history(routineId),
        window.todoApp.routines.historySummary(routineId),
      ]);
      setHistoryPayload(nextHistory);
      setHistorySummary(nextSummary);
    } finally {
      setIsHistoryLoading(false);
    }
  };

  const loadHistoryDay = async (date: string) => {
    setIsHistoryDayLoading(true);
    setHistoryDayError(null);

    try {
      const nextPayload = await window.todoApp.history.day(date);
      setHistoryDayPayload(nextPayload);
    } catch (historyError) {
      setHistoryDayError(getErrorMessage(historyError));
    } finally {
      setIsHistoryDayLoading(false);
    }
  };

  const refreshAll = async () => {
    const nextRoutines = await syncDashboard();
    const routineId = historyRoutineIdRef.current ?? nextRoutines[0]?.template.id ?? null;

    if (!routineId) {
      setHistoryPayload(null);
      setHistorySummary(null);
      return;
    }

    await syncHistory(routineId);
  };

  useEffect(() => {
    historyRoutineIdRef.current = historyRoutineId;
  }, [historyRoutineId]);

  useEffect(() => {
    document.title = 'To Do List';

    let isActive = true;
    let refreshTimeout: ReturnType<typeof setTimeout> | null = null;
    let isRefreshRunning = false;
    let isRefreshQueued = false;

    const load = async (markLoaded = false) => {
      if (isRefreshRunning) {
        isRefreshQueued = true;
        return;
      }

      isRefreshRunning = true;

      try {
        do {
          isRefreshQueued = false;
          await refreshAll();

          if (isActive) {
            setError(null);
          }
        } while (isActive && isRefreshQueued);
      } catch (loadError) {
        if (isActive) {
          setError(getErrorMessage(loadError));
        }
      } finally {
        isRefreshRunning = false;

        if (markLoaded && isActive) {
          setIsLoading(false);
        }
      }
    };

    void load(true);

    const handleDataChange = () => {
      if (refreshTimeout) {
        clearTimeout(refreshTimeout);
      }

      refreshTimeout = setTimeout(() => {
        refreshTimeout = null;
        void load(false);
      }, 120);
    };

    const removeTaskListener = window.todoApp.tasks.onChanged(handleDataChange);
    const removeTimeBlockListener = window.todoApp.timeBlocks.onChanged(handleDataChange);
    const removeRoutineListener = window.todoApp.routines.onChanged(handleDataChange);
    const removeSubmissionListener = window.todoApp.submissions.onChanged(handleDataChange);
    const removeEditSuggestionListener =
      window.todoApp.editSuggestions.onChanged(handleDataChange);
    const removeFriendNetworkListener = window.todoApp.friendNetwork.onChanged(handleDataChange);
    const removeAccountListener = window.todoApp.account.onChanged(handleDataChange);
    const removeSelectionListener = window.todoApp.app.onSelection(
      (selection: AppSelection) => {
        if (selection.kind === 'task') {
          setSelectedTaskId(selection.id);
          setActiveView('today');
          return;
        }

        if (selection.kind === 'view') {
          setActiveView(selection.id);
          return;
        }

        setSelectedRoutineId(selection.id);
        setHistoryRoutineId(selection.id);
        setActiveView('routines');
      },
    );

    window.addEventListener('focus', handleDataChange);

    return () => {
      isActive = false;

      if (refreshTimeout) {
        clearTimeout(refreshTimeout);
      }

      removeTaskListener();
      removeTimeBlockListener();
      removeRoutineListener();
      removeSubmissionListener();
      removeEditSuggestionListener();
      removeFriendNetworkListener();
      removeAccountListener();
      removeSelectionListener();
      window.removeEventListener('focus', handleDataChange);
    };
  }, []);

  useEffect(() => {
    document.body.dataset.appVariant = appInfo?.variant ?? 'dev';
  }, [appInfo?.variant]);

  useEffect(() => {
    if (appInfo?.variant === 'user' && activeView === 'submissions') {
      setActiveView('today');
    }
  }, [activeView, appInfo?.variant]);

  useEffect(() => {
    if (isLoading) {
      return;
    }

    void syncHistory(historyRoutineId).catch((historyError) => {
      setError(getErrorMessage(historyError));
    });
  }, [historyRoutineId, isLoading]);

  useEffect(() => {
    if (!selectedHistoryDate) {
      setHistoryDayPayload(null);
      setHistoryDayError(null);
      return;
    }

    void loadHistoryDay(selectedHistoryDate);
  }, [selectedHistoryDate]);

  useEffect(() => {
    if (!selectedTaskId) {
      return;
    }

    const scrollTimer = window.setTimeout(() => {
      const focusedElement = document.querySelector<HTMLElement>(
        `[data-task-id="${selectedTaskId}"]`,
      );
      focusedElement?.focus();
      focusedElement?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
      setSelectedTaskId((current) => (current === selectedTaskId ? null : current));
    }, 90);

    return () => {
      window.clearTimeout(scrollTimer);
    };
  }, [selectedTaskId, tasks]);

  useEffect(() => {
    if (!selectedRoutineId) {
      return;
    }

    const scrollTimer = window.setTimeout(() => {
      const focusedElement = document.querySelector<HTMLElement>(
        `[data-routine-id="${selectedRoutineId}"]`,
      );
      focusedElement?.focus();
      focusedElement?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }, 90);

    return () => {
      window.clearTimeout(scrollTimer);
    };
  }, [selectedRoutineId, routines]);

  useEffect(() => {
    if (activeView !== 'routines' || !editingRoutineId) {
      return;
    }

    let focusTimer: number | undefined;
    const scrollTimer = window.setTimeout(() => {
      const editorElement = routineEditorRef.current;

      if (editorElement) {
        const top = Math.max(
          window.scrollY + editorElement.getBoundingClientRect().top - 20,
          0,
        );

        window.scrollTo({
          top,
          behavior: 'smooth',
        });
      }

      focusTimer = window.setTimeout(() => {
        routineTitleInputRef.current?.focus({
          preventScroll: true,
        });
      }, 180);
    }, 120);

    return () => {
      window.clearTimeout(scrollTimer);
      if (focusTimer) {
        window.clearTimeout(focusTimer);
      }
    };
  }, [activeView, editingRoutineId]);

  const pendingTasks = tasks.filter((task) => task.status === 'pending');
  const completedTasks = tasks.filter((task) => task.status === 'completed');
  const passiveTasks = tasks.filter(isPassiveTask);
  const completedPassiveTasks = completedTasks
    .filter(isPassiveTask)
    .filter((task) => Boolean(task.completedAt))
    .sort((left, right) =>
      (right.completedAt ?? right.createdAt).localeCompare(left.completedAt ?? left.createdAt),
    );
  const activeRoutineCount = routines.filter(
    (item) => item.currentOccurrence?.status === 'pending',
  ).length;
  const allCompleted = routines.reduce(
    (count, item) => count + item.historySummary.totalCompleted,
    0,
  );
  const allMissed = routines.reduce(
    (count, item) => count + item.historySummary.totalMissed,
    0,
  );
  const overallRoutineRate =
    allCompleted + allMissed
      ? Math.round((allCompleted / (allCompleted + allMissed)) * 100)
      : 0;
  const historyOccurrences = historyPayload?.occurrences ?? [];
  const recentHistory = historyOccurrences.slice(0, 8);
  const calendarCells = buildCalendarCells(historyMonthKey);
  const occurrenceByDate = new Map(
    historyOccurrences.map((occurrence) => [occurrence.scheduledDate, occurrence]),
  );
  const passiveHistoryByDate = new Map<string, Task[]>();
  completedPassiveTasks.forEach((task) => {
    const completedDate = getCompletedTaskDate(task);

    if (!completedDate) {
      return;
    }

    const currentEntries = passiveHistoryByDate.get(completedDate) ?? [];
    currentEntries.push(task);
    passiveHistoryByDate.set(completedDate, currentEntries);
  });
  const passiveCompletionsThisMonth = completedPassiveTasks.filter((task) =>
    getCompletedTaskDate(task)?.startsWith(historyMonthKey),
  ).length;
  const hasAnyHistory = Boolean(completedPassiveTasks.length || routines.length);
  const weekDates = buildWeekDates(toLocalDateString(new Date()));
  const weeklyPlan = buildWeeklyPlan(tasks, routines, weekDates);
  const plannerWeekDates = buildWeekDates(plannerDate);
  const plannerBlocks = timeBlocks.filter(
    (block) => toLocalDateString(new Date(block.startAt)) === plannerDate,
  );
  const sortedPlannerBlocks = plannerBlocks
    .slice()
    .sort((left, right) => left.startAt.localeCompare(right.startAt));
  const timeBlockedTaskIds = new Set(timeBlocks.map((block) => block.taskId).filter(Boolean));
  const unplannedTasks = pendingTasks.filter((task) => !timeBlockedTaskIds.has(task.id));
  const plannableRoutines = routines.filter(
    (item) => item.currentOccurrence?.status === 'pending',
  );
  const plannerInboxCount = unplannedTasks.length + plannableRoutines.length;
  const calendarHours = Array.from({ length: 24 }, (_value, hour) => hour);
  const selectedFriendEditTarget = friendPublicTasks.find(
    (task) => task.id === friendTaskEditSuggestionForm.publicTaskId,
  );
  const isSuggestingRoutineEdit = selectedFriendEditTarget?.kind === 'routine';
  const plannerMinutes = plannerBlocks.reduce(
    (minutes, block) =>
      minutes +
      Math.max(0, new Date(block.endAt).getTime() - new Date(block.startAt).getTime()) / 60_000,
    0,
  );
  const plannerCompletionCount = plannerBlocks.filter(
    (block) => block.status === 'completed',
  ).length;

  const clearFriendFormErrors = (...keys: string[]) => {
    setFriendFormErrors((current) => {
      const nextErrors = { ...current };
      keys.forEach((key) => {
        delete nextErrors[key];
      });
      return nextErrors;
    });
  };

  const setFriendFormError = (key: string, message: string) => {
    setFriendFormErrors((current) => ({
      ...current,
      [key]: message,
    }));
  };

  const toggleEmergencyPasswordVisibility = (id: string) => {
    setVisibleEmergencyPasswordIds((current) => ({
      ...current,
      [id]: !current[id],
    }));
  };

  const getMaskedPassword = (password: string): string =>
    password.length ? '•'.repeat(Math.min(Math.max(password.length, 6), 16)) : '••••••';

  const loadLivePublicTasks = async (
    friendAccountId: string,
  ): Promise<PublicSharedTask[]> => {
    const publicTasks = await window.todoApp.friendNetwork.listPublicTasksForFriend(
      friendAccountId,
    );

    return publicTasks.filter((task) => task.status === 'pending');
  };

  const loadPublicTasksForContact = async (contact: SavedFriendContact) => {
    setIsLoadingFriendPublicTasks(true);
    clearFriendFormErrors('editRecipient', 'editTask');

    try {
      const publicTasks = await loadLivePublicTasks(contact.friendAccountId);
      setFriendPublicTasks(publicTasks);

      if (publicTasks.length === 0) {
        setFriendFormError(
          'editTask',
          'That friend has no publicly viewable active tasks or routines right now.',
        );
      }
    } catch (taskLoadError) {
      setFriendPublicTasks([]);
      setFriendFormError('editTask', getErrorMessage(taskLoadError));
    } finally {
      setIsLoadingFriendPublicTasks(false);
    }
  };

  const loadPopupTasksForContact = async (contact: SavedFriendContact) => {
    setIsLoadingFriendPopupTasks(true);
    clearFriendFormErrors('popupRecipient', 'popupTask');

    try {
      const publicTasks = await loadLivePublicTasks(contact.friendAccountId);
      setFriendPopupTasks(publicTasks);
    } catch (taskLoadError) {
      setFriendPopupTasks([]);
      setFriendFormError('popupTask', getErrorMessage(taskLoadError));
    } finally {
      setIsLoadingFriendPopupTasks(false);
    }
  };

  const handleTaskSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await window.todoApp.tasks.create(buildTaskDraft(taskFormValues));
      setTaskFormValues(createEmptyTaskForm());
      setTaskDetailsOpen(false);
      await refreshAll();
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRoutineSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const draft = buildRoutineDraft(routineFormValues);

      if (editingRoutineId) {
        const updatePayload: RoutineUpdate = {
          id: editingRoutineId,
          title: draft.title,
          notes: draft.notes,
          priority: draft.priority,
          rule: draft.rule,
        };

        await window.todoApp.routines.update(updatePayload);
        setSelectedRoutineId(editingRoutineId);
        setHistoryRoutineId(editingRoutineId);
      } else {
        const createdRoutine = await window.todoApp.routines.create(draft);
        setSelectedRoutineId(createdRoutine.template.id);
        setHistoryRoutineId(createdRoutine.template.id);
      }

      setRoutineFormValues(createEmptyRoutineForm());
      setEditingRoutineId(null);
      setRoutineEditorOpen(false);
      await refreshAll();
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveTask = async (update: TaskUpdate) => {
    const nextTasks = await window.todoApp.tasks.update(update);
    setTasks(nextTasks);
  };

  const handleTimeBlockSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const blockDraft = buildTimeBlockDraft(timeBlockForm);
      const nextBlocks = await window.todoApp.timeBlocks.create(blockDraft);
      setTimeBlocks(nextBlocks);
      setTimeBlockForm(createEmptyTimeBlockForm(plannerDate));
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInlineTimeBlockSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!editingTimeBlockId || !editingTimeBlockForm) {
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const blockDraft = buildTimeBlockDraft(editingTimeBlockForm);
      const nextBlocks = await window.todoApp.timeBlocks.update({
        id: editingTimeBlockId,
        title: blockDraft.title,
        startAt: blockDraft.startAt,
        endAt: blockDraft.endAt,
        taskId: blockDraft.taskId ?? null,
        notes: blockDraft.notes ?? null,
        enableDnd: blockDraft.enableDnd,
        status: 'planned',
      });
      setTimeBlocks(nextBlocks);
      setEditingTimeBlockId(null);
      setEditingTimeBlockForm(null);
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    } finally {
      setIsSubmitting(false);
    }
  };

  const createBlockFormForDrop = (
    date: string,
    startHour?: number,
  ): TimeBlockFormValues => {
    const nextForm = createEmptyTimeBlockForm(date);

    if (startHour === undefined) {
      return nextForm;
    }

    const safeHour = Math.min(Math.max(startHour, 0), 23);
    const endHour = Math.min(safeHour + 1, 24);

    return {
      ...nextForm,
      startTime: `${String(safeHour).padStart(2, '0')}:00`,
      endTime: endHour === 24 ? '23:59' : `${String(endHour).padStart(2, '0')}:00`,
    };
  };

  const planTaskForDate = async (task: Task, date = plannerDate, startHour?: number) => {
    const nextBlocks = await window.todoApp.timeBlocks.create(
      buildTimeBlockDraft({
        ...createBlockFormForDrop(date, startHour),
        title: task.title,
        taskId: task.id,
        notes: task.notes ?? '',
      }),
    );
    setTimeBlocks(nextBlocks);
  };

  const planRoutineForDate = async (
    item: RoutineListItem,
    date = plannerDate,
    startHour?: number,
  ) => {
    const nextBlocks = await window.todoApp.timeBlocks.create(
      buildTimeBlockDraft({
        ...createBlockFormForDrop(date, startHour),
        title: item.template.title,
        notes: item.template.notes ?? '',
      }),
    );
    setTimeBlocks(nextBlocks);
  };

  const planDroppedItem = (payload: string, date = plannerDate, startHour?: number) => {
    if (!payload) {
      return;
    }

    const [kind, id] = payload.split(':');

    if (kind === 'task') {
      const task = pendingTasks.find((candidate) => candidate.id === id);

      if (task) {
        void planTaskForDate(task, date, startHour);
      }

      return;
    }

    if (kind === 'routine') {
      const routine = routines.find((candidate) => candidate.template.id === id);

      if (routine) {
        void planRoutineForDate(routine, date, startHour);
      }
    }
  };

  const handleTimeBlockStatus = async (
    block: TimeBlock,
    status: TimeBlock['status'],
  ) => {
    const nextBlocks = await window.todoApp.timeBlocks.update({
      id: block.id,
      status,
    });
    setTimeBlocks(nextBlocks);
  };

  const handleDeleteTimeBlock = async (blockId: string) => {
    const nextBlocks = await window.todoApp.timeBlocks.delete(blockId);
    setTimeBlocks(nextBlocks);
    setEditingTimeBlockId((current) => (current === blockId ? null : current));
    setEditingTimeBlockForm((current) => (editingTimeBlockId === blockId ? null : current));
  };

  const handleEditTimeBlock = (block: TimeBlock) => {
    setActivePlannerPanel('day');
    setEditingTimeBlockId(block.id);
    setEditingTimeBlockForm(createTimeBlockFormValues(block));
  };

  const handleCancelTimeBlockEdit = () => {
    setEditingTimeBlockId(null);
    setEditingTimeBlockForm(null);
  };

  const handleCompleteTask = async (taskId: string) => {
    const nextTasks = await window.todoApp.tasks.complete(taskId);
    setTasks(nextTasks);
  };

  const handleReopenTask = async (taskId: string) => {
    const nextTasks = await window.todoApp.tasks.reopen(taskId);
    setTasks(nextTasks);
  };

  const handleDeleteTask = async (taskId: string) => {
    const nextTasks = await window.todoApp.tasks.delete(taskId);
    setTasks(nextTasks);
    setSelectedTaskId((current) => (current === taskId ? null : current));
  };

  const handleTaskCompletionDateChange = async (input: TaskCompletionDateUpdate) => {
    const nextTasks = await window.todoApp.tasks.setCompletionDate(input);
    setTasks(nextTasks);
  };

  const handleCompleteRoutine = async (routineId: string) => {
    const nextRoutines = await window.todoApp.routines.completeCurrent(routineId);
    setRoutines(nextRoutines);
    await syncHistory(historyRoutineId ?? routineId);
  };

  const handleReopenRoutine = async (routineId: string) => {
    const nextRoutines = await window.todoApp.routines.reopenCurrent(routineId);
    setRoutines(nextRoutines);
    await syncHistory(historyRoutineId ?? routineId);
  };

  const handleDeleteRoutine = async (routineId: string) => {
    const nextRoutines = await window.todoApp.routines.delete(routineId);
    setRoutines(nextRoutines);
    setEditingRoutineId((current) => (current === routineId ? null : current));
    setSelectedRoutineId((current) =>
      current === routineId ? nextRoutines[0]?.template.id ?? null : current,
    );
    const nextHistoryRoutineId =
      historyRoutineId === routineId ? nextRoutines[0]?.template.id ?? null : historyRoutineId;
    setHistoryRoutineId(nextHistoryRoutineId);
    await syncHistory(nextHistoryRoutineId);
  };

  const handleRoutineOccurrenceHistoryUpdate = async (
    input: RoutineOccurrenceHistoryUpdate,
  ) => {
    const nextRoutines = await window.todoApp.routines.updateOccurrenceHistory(input);
    setRoutines(nextRoutines);
    await syncHistory(historyRoutineId);
  };

  const handleAcceptSubmission = async (submissionId: string) => {
    await window.todoApp.submissions.accept(submissionId);
    await refreshAll();
  };

  const handleDismissSubmission = async (submissionId: string) => {
    await window.todoApp.submissions.dismiss(submissionId);
    await refreshAll();
  };

  const handleAcceptEditSuggestion = async (suggestionId: string) => {
    await window.todoApp.editSuggestions.accept(suggestionId);
    await refreshAll();
  };

  const handleDismissEditSuggestion = async (suggestionId: string) => {
    await window.todoApp.editSuggestions.dismiss(suggestionId);
    await refreshAll();
  };

  const handleDndModeChange = async (mode: AppDndMode) => {
    setError(null);

    try {
      const nextStatus = await window.todoApp.friendNetwork.setDndMode(mode);
      setFriendNetworkStatus(nextStatus);
      await refreshAll();
    } catch (dndError) {
      setError(getErrorMessage(dndError));
    }
  };

  const handleAccountSubmit = async (
    event: React.FormEvent<HTMLFormElement>,
    mode: 'signIn' | 'signUp',
  ) => {
    event.preventDefault();
    setError(null);

    try {
      const nextStatus =
        mode === 'signIn'
          ? await window.todoApp.account.signIn(accountForm)
          : await window.todoApp.account.signUp(accountForm);
      setAccountStatus(nextStatus);
      setAccountForm({
        username: '',
        password: '',
      });
      await refreshAll();
    } catch (accountError) {
      setError(getErrorMessage(accountError));
    }
  };

  const handleAccountSignOut = async () => {
    setError(null);

    try {
      const nextStatus = await window.todoApp.account.signOut();
      setAccountStatus(nextStatus);
      await refreshAll();
    } catch (accountError) {
      setError(getErrorMessage(accountError));
    }
  };

  const handleAccountSyncNow = async () => {
    setError(null);

    try {
      const nextStatus = await window.todoApp.account.syncNow();
      setAccountStatus(nextStatus);
      await refreshAll();
    } catch (accountError) {
      setError(getErrorMessage(accountError));
    }
  };

  const handleDisplayNameSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    try {
      const nextStatus = await window.todoApp.account.setDisplayName(displayNameDraft);
      setAccountStatus(nextStatus);
      setDisplayNameDraft('');
      await refreshAll();
    } catch (displayNameError) {
      setError(getErrorMessage(displayNameError));
    }
  };

  const handleFriendContactSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!friendContactForm.friendUsername.trim()) {
      setFriendFormError('contactUsername', 'Type the username for the friend you want to add.');
      return;
    }

    try {
      const nextContacts = await window.todoApp.friendNetwork.saveContact({
        nickname: friendContactForm.nickname,
        friendUsername: friendContactForm.friendUsername,
        taskPermission: friendContactForm.taskPermission,
      });
      setFriendContacts(nextContacts);
      setFriendContactForm({
        nickname: '',
        friendUsername: '',
        taskPermission: 'none',
      });
    } catch (contactError) {
      setFriendFormError('contactUsername', getErrorMessage(contactError));
    }
  };

  const handleFriendContactDelete = async (contactId: string) => {
    setError(null);

    try {
      const nextContacts = await window.todoApp.friendNetwork.deleteContact(contactId);
      setFriendContacts(nextContacts);
    } catch (contactError) {
      setError(getErrorMessage(contactError));
    }
  };

  const prepareFriendContactRename = (contact: SavedFriendContact) => {
    setFriendContactForm({
      nickname: contact.nickname,
      friendUsername: contact.friendUsername,
      taskPermission: contact.taskPermission,
    });
  };

  const applyContactToPopupForm = (contact: SavedFriendContact) => {
    void loadPopupTasksForContact(contact);
    setFriendPopupForm((current) => ({
      ...current,
      recipientUsername: getFriendContactLabel(contact),
      recipientAccountId: contact.friendAccountId,
      relatedTaskId: '',
    }));
  };

  const applyContactToTaskSuggestionForm = (contact: SavedFriendContact) => {
    clearFriendFormErrors('taskRecipient');
    setFriendTaskSuggestionForm((current) => ({
      ...current,
      recipientUsername: getFriendContactLabel(contact),
      recipientAccountId: contact.friendAccountId,
    }));
  };

  const applyContactToTaskEditSuggestionForm = (contact: SavedFriendContact) => {
    void loadPublicTasksForContact(contact);
    setFriendTaskEditSuggestionForm((current) => ({
      ...current,
      recipientUsername: getFriendContactLabel(contact),
      recipientAccountId: contact.friendAccountId,
      publicTaskId: '',
      taskTitle: '',
    }));
  };

  const handleFriendPopupSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const nextErrors: Record<string, string> = {};

    if (!friendPopupForm.recipientAccountId) {
      nextErrors.popupRecipient = 'Choose one of your saved friends from the dropdown.';
    }

    if (!friendPopupForm.message.trim()) {
      nextErrors.popupMessage = 'Type the message you want to show in the popup.';
    }

    if (friendPopupForm.isEmergency && !friendPopupForm.emergencyPassword.trim()) {
      nextErrors.popupEmergencyPassword =
        'Enter the emergency password this friend gave you.';
    }

    if (Object.keys(nextErrors).length > 0) {
      setFriendFormErrors((current) => ({ ...current, ...nextErrors }));
      return;
    }

    try {
      const livePopupTasks = friendPopupForm.recipientAccountId
        ? await loadLivePublicTasks(friendPopupForm.recipientAccountId)
        : [];
      setFriendPopupTasks(livePopupTasks);

      const linkedTask = livePopupTasks.find(
        (task) => task.id === friendPopupForm.relatedTaskId,
      );

      if (friendPopupForm.relatedTaskId && !linkedTask) {
        setFriendFormError(
          'popupTask',
          'That task is no longer live. Choose a current task from this friend.',
        );
        return;
      }

      await window.todoApp.friendNetwork.sendPopup({
        recipientUsername: friendPopupForm.recipientUsername,
        recipientAccountId: friendPopupForm.recipientAccountId || undefined,
        senderName: friendPopupForm.senderName,
        kind: friendPopupForm.isEmergency
          ? 'emergency_popup'
          : linkedTask
            ? 'task_popup'
            : 'general_popup',
        priority: friendPopupForm.isEmergency ? 'emergency' : 'normal',
        title: friendPopupForm.isEmergency
          ? 'Emergency Popup'
          : linkedTask
            ? linkedTask.title
            : undefined,
        message: friendPopupForm.message,
        relatedTaskId: linkedTask?.sourceId,
        relatedTaskTitle: linkedTask?.title,
        emergencyPassword: friendPopupForm.emergencyPassword,
        payload: linkedTask
          ? {
              taskId: linkedTask.sourceId,
              taskKind: linkedTask.kind,
              sharedTaskId: linkedTask.id,
              taskTitle: linkedTask.title,
              dueAt: linkedTask.dueAt,
              reminderAt: linkedTask.reminderAt,
              priority: linkedTask.priority,
            }
          : {},
      });
      setFriendPopupForm((current) => ({
        ...current,
        relatedTaskId: '',
        message: '',
        isEmergency: false,
        emergencyPassword: '',
      }));
    } catch (friendPopupError) {
      setFriendFormError('popupMessage', getErrorMessage(friendPopupError));
    }
  };

  const handleEmergencyPasswordSubmit = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    setError(null);

    const nextErrors: Record<string, string> = {};

    if (!emergencyPasswordForm.friendAccountId) {
      nextErrors.emergencyFriend = 'Choose which saved friend this password is for.';
    }

    if (!emergencyPasswordForm.password.trim()) {
      nextErrors.emergencyPassword = 'Type the password they should use for you.';
    }

    if (Object.keys(nextErrors).length > 0) {
      setFriendFormErrors((current) => ({ ...current, ...nextErrors }));
      return;
    }

    try {
      const nextPasswords = await window.todoApp.friendNetwork.saveEmergencyPassword(
        emergencyPasswordForm,
      );
      setEmergencyPasswords(nextPasswords);
      setEmergencyPasswordForm({
        friendAccountId: '',
        password: '',
      });
    } catch (passwordError) {
      setFriendFormError('emergencyPassword', getErrorMessage(passwordError));
    }
  };

  const handleEmergencyPasswordDelete = async (grantId: string) => {
    setError(null);

    try {
      setEmergencyPasswords(
        await window.todoApp.friendNetwork.deleteEmergencyPassword(grantId),
      );
    } catch (passwordError) {
      setError(getErrorMessage(passwordError));
    }
  };

  const handleFriendTaskSuggestionSubmit = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    setError(null);

    const nextErrors: Record<string, string> = {};

    if (!friendTaskSuggestionForm.recipientAccountId) {
      nextErrors.taskRecipient = 'Choose one of your saved friends from the dropdown.';
    }

    if (!friendTaskSuggestionForm.title.trim()) {
      nextErrors.taskTitle = 'Type the task title you want to suggest.';
    }

    if (Object.keys(nextErrors).length > 0) {
      setFriendFormErrors((current) => ({ ...current, ...nextErrors }));
      return;
    }

    try {
      const taskDraft = buildTaskDraft(friendTaskSuggestionForm);
      const taskSuggestionMessage =
        taskDraft.notes?.trim() || `Suggested new task: ${taskDraft.title}`;

      await window.todoApp.friendNetwork.sendPopup({
        recipientUsername: friendTaskSuggestionForm.recipientUsername,
        recipientAccountId: friendTaskSuggestionForm.recipientAccountId || undefined,
        senderName: friendTaskSuggestionForm.senderName,
        kind: 'task_submission',
        priority: 'normal',
        title: taskDraft.title,
        message: taskSuggestionMessage,
        payload: {
          title: taskDraft.title,
          notes: taskDraft.notes,
          dueAt: taskDraft.dueAt,
          reminderAt: taskDraft.reminderAt,
          priority: taskDraft.priority,
        },
      });
      setFriendTaskSuggestionForm(createEmptyFriendTaskSuggestionForm());
    } catch (friendTaskError) {
      setFriendFormError('taskTitle', getErrorMessage(friendTaskError));
    }
  };

  const handleFriendTaskEditSuggestionSubmit = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    setError(null);

    const nextErrors: Record<string, string> = {};

    if (!friendTaskEditSuggestionForm.recipientAccountId) {
      nextErrors.editRecipient = 'Choose one of your saved friends from the dropdown.';
    }

    if (!friendTaskEditSuggestionForm.publicTaskId) {
      nextErrors.editTask =
        'Choose one of their publicly viewable tasks or routines from the dropdown.';
    }

    if (Object.keys(nextErrors).length > 0) {
      setFriendFormErrors((current) => ({ ...current, ...nextErrors }));
      return;
    }

    try {
      const liveEditableTasks = friendTaskEditSuggestionForm.recipientAccountId
        ? await loadLivePublicTasks(friendTaskEditSuggestionForm.recipientAccountId)
        : [];
      setFriendPublicTasks(liveEditableTasks);

      const selectedPublicTask = liveEditableTasks.find(
        (task) => task.id === friendTaskEditSuggestionForm.publicTaskId,
      );

      if (!selectedPublicTask) {
        setFriendFormError(
          'editTask',
          'That item is no longer live. Choose a current task or routine from this friend.',
        );
        return;
      }

      const today = toLocalDateString(new Date());
      const dueLocalValue = combineLocalDateTimeValue(
        friendTaskEditSuggestionForm.suggestedDueDate,
        friendTaskEditSuggestionForm.suggestedDueTime,
        today,
        '23:59',
      );
      const reminderLocalValue = combineLocalDateTimeValue(
        friendTaskEditSuggestionForm.suggestedReminderDate,
        friendTaskEditSuggestionForm.suggestedReminderTime,
        friendTaskEditSuggestionForm.suggestedReminderDate ||
          friendTaskEditSuggestionForm.suggestedDueDate ||
          today,
        '09:00',
      );
      const suggestedDueAt = dueLocalValue ? toIsoValue(dueLocalValue) : undefined;
      const suggestedReminderAt = reminderLocalValue
        ? toIsoValue(reminderLocalValue)
        : undefined;
      const suggestedPriority =
        friendTaskEditSuggestionForm.suggestedPriority === 'auto'
          ? undefined
          : friendTaskEditSuggestionForm.suggestedPriority;
      const suggestedRoutineRule =
        selectedPublicTask.kind === 'routine'
          ? buildSuggestedRoutineRule(friendTaskEditSuggestionForm)
          : undefined;
      const changedFields = selectedPublicTask.kind === 'routine' ? [
        friendTaskEditSuggestionForm.suggestedTitle.trim()
          ? `Title -> ${friendTaskEditSuggestionForm.suggestedTitle.trim()}`
          : null,
        friendTaskEditSuggestionForm.suggestedNotes.trim()
          ? `Description -> ${friendTaskEditSuggestionForm.suggestedNotes.trim()}`
          : null,
        `Repeats every ${friendTaskEditSuggestionForm.suggestedRoutineInterval} ${friendTaskEditSuggestionForm.suggestedRoutineUnit}`,
        friendTaskEditSuggestionForm.suggestedRoutineUnit === 'week'
          ? `Weekdays -> ${friendTaskEditSuggestionForm.suggestedRoutineWeekdays
              .map((weekday) => WEEKDAY_LABELS[weekday])
              .join(', ')}`
          : null,
        `Start date -> ${friendTaskEditSuggestionForm.suggestedRoutineStartDate}`,
        friendTaskEditSuggestionForm.suggestedRoutineEndDate
          ? `End date -> ${friendTaskEditSuggestionForm.suggestedRoutineEndDate}`
          : null,
        friendTaskEditSuggestionForm.suggestedRoutineDueTime
          ? `Due time -> ${friendTaskEditSuggestionForm.suggestedRoutineDueTime}`
          : null,
        friendTaskEditSuggestionForm.suggestedRoutineReminderTime
          ? `Reminder time -> ${friendTaskEditSuggestionForm.suggestedRoutineReminderTime}`
          : null,
        `Priority -> ${formatPriorityLabel(friendTaskEditSuggestionForm.suggestedPriority)}`,
      ].filter((value): value is string => Boolean(value)) : [
        friendTaskEditSuggestionForm.suggestedTitle.trim()
          ? `Title -> ${friendTaskEditSuggestionForm.suggestedTitle.trim()}`
          : null,
        friendTaskEditSuggestionForm.suggestedNotes.trim()
          ? `Description -> ${friendTaskEditSuggestionForm.suggestedNotes.trim()}`
          : null,
        suggestedDueAt ? `Due date -> ${formatSuggestedDateTime(suggestedDueAt)}` : null,
        suggestedReminderAt
          ? `Reminder -> ${formatSuggestedDateTime(suggestedReminderAt)}`
          : null,
        suggestedPriority ? `Priority -> ${formatPriorityLabel(suggestedPriority)}` : null,
      ].filter((value): value is string => Boolean(value));

      if (changedFields.length === 0) {
        throw new Error('Add at least one suggested change.');
      }

      if (selectedPublicTask.kind === 'routine') {
        if (!friendTaskEditSuggestionForm.suggestedTitle.trim()) {
          throw new Error('Add a suggested routine title.');
        }

        if (!friendTaskEditSuggestionForm.suggestedRoutineStartDate) {
          throw new Error('Choose a suggested routine start date.');
        }

        if (
          friendTaskEditSuggestionForm.suggestedRoutineUnit === 'week' &&
          friendTaskEditSuggestionForm.suggestedRoutineWeekdays.length === 0
        ) {
          throw new Error('Choose at least one suggested weekday.');
        }
      }

      await window.todoApp.friendNetwork.sendPopup({
        recipientUsername: friendTaskEditSuggestionForm.recipientUsername,
        recipientAccountId: friendTaskEditSuggestionForm.recipientAccountId || undefined,
        senderName: friendTaskEditSuggestionForm.senderName,
        kind: 'task_edit_suggestion',
        priority: 'normal',
        title: selectedPublicTask.title,
        relatedTaskId: selectedPublicTask.sourceId,
        relatedTaskTitle: selectedPublicTask.title,
        message: `Suggested changes:\n${changedFields.join('\n')}`,
        payload: {
          taskId: selectedPublicTask.sourceId,
          sharedTaskId: selectedPublicTask.id,
          taskKind: selectedPublicTask.kind,
          taskTitle: selectedPublicTask.title,
          suggestedTitle: friendTaskEditSuggestionForm.suggestedTitle,
          suggestedNotes: friendTaskEditSuggestionForm.suggestedNotes,
          suggestedDueAt,
          suggestedReminderAt,
          suggestedPriority,
          suggestedRoutineRule,
        },
      });
      setFriendTaskEditSuggestionForm(createEmptyFriendTaskEditSuggestionForm());
    } catch (friendTaskError) {
      setFriendFormError('editTask', getErrorMessage(friendTaskError));
    }
  };

  const handleAcceptFriendEvent = async (eventId: string) => {
    await window.todoApp.friendNetwork.acceptEvent(eventId);
    await refreshAll();
  };

  const handleDenyFriendEvent = async (eventId: string) => {
    await window.todoApp.friendNetwork.denyEvent(eventId);
    await refreshAll();
  };

  const handleEditRoutine = (template: RoutineTemplate) => {
    setActiveView('routines');
    setEditingRoutineId(template.id);
    setRoutineFormValues(createRoutineFormValues(template));
    setSelectedRoutineId(template.id);
    setRoutineEditorOpen(true);
    setRoutineDetailsOpen(true);
  };

  const todayLabel = fullDateFormatter.format(new Date());
  const selectedHistoryTitle =
    routines.find((item) => item.template.id === historyRoutineId)?.template.title ?? 'Routine';
  const pendingSubmissionCount = submissions.length;
  const pendingEditSuggestionCount = editSuggestions.length;
  const pendingWebsiteQueueCount = pendingSubmissionCount + pendingEditSuggestionCount;
  const pendingFriendEventCount = pendingFriendEvents.length;
  const pendingFriendSuggestionEvents = pendingFriendEvents.filter(
    (popupEvent) =>
      popupEvent.kind === 'task_submission' || popupEvent.kind === 'task_edit_suggestion',
  );
  const pendingFriendSuggestionCount = pendingFriendSuggestionEvents.length;
  const queuedFriendPopupCount = pendingFriendEventCount - pendingFriendSuggestionCount;
  const taskById = new Map(tasks.map((task) => [task.id, task] as const));
  const isDevVariant = appInfo?.isDevVariant ?? true;
  const activeThemePalette = getThemePalette(themeSettings);
  const networkPanelItems: Array<{
    id: FriendNetworkPanel;
    label: string;
  }> = [
    { id: 'friends', label: `Friends (${friendContacts.length})` },
    { id: 'send', label: 'Send' },
    { id: 'review', label: `Review (${pendingFriendSuggestionCount})` },
  ];

  const handleThemePresetChange = (presetId: ThemePresetId) => {
    const nextPreset = THEME_PRESETS.find((preset) => preset.id === presetId);

    onThemeChange({
      presetId,
      customBase:
        presetId === 'custom' ? themeSettings.customBase : nextPreset?.base ?? themeSettings.customBase,
      customAccent:
        presetId === 'custom'
          ? themeSettings.customAccent
          : nextPreset?.accent ?? themeSettings.customAccent,
    });
  };

  const handleCustomThemeColorChange = (
    key: 'customBase' | 'customAccent',
    value: string,
  ) => {
    onThemeChange({
      ...themeSettings,
      presetId: 'custom',
      [key]: value,
    });
  };

  const handleStartupToggle = async (enabled: boolean) => {
    setError(null);

    try {
      const nextStartupSettings = await window.todoApp.app.setStartupEnabled(enabled);
      setStartupSettings(nextStartupSettings);
    } catch (startupError) {
      setError(getErrorMessage(startupError));
    }
  };

  const handleSettingsSyncAndUpdateCheck = async () => {
    setError(null);
    setSettingsSyncStatus(null);
    setIsSettingsSyncing(true);

    try {
      let syncMessage = 'Local data refreshed.';

      if (accountStatus?.session) {
        const nextStatus = await window.todoApp.account.syncNow();
        setAccountStatus(nextStatus);
        syncMessage = 'Supabase sync complete.';
      }

      const updateResult = await window.todoApp.app.checkForUpdates();
      await refreshAll();
      setSettingsSyncStatus(`${syncMessage} ${updateResult.message}`);
    } catch (settingsError) {
      setError(getErrorMessage(settingsError));
    } finally {
      setIsSettingsSyncing(false);
    }
  };

  const headerTitle =
    activeView === 'today'
      ? todayLabel
      : activeView === 'planner'
      ? 'Time-block your day'
      : activeView === 'week'
      ? 'Next 7 days'
      : activeView === 'routines'
      ? 'Repeating work'
      : activeView === 'history'
      ? 'History and streaks'
      : activeView === 'network'
      ? 'Friend network'
      : activeView === 'settings'
      ? 'Settings'
      : 'Website review queue';

  const headerCopy =
    activeView === 'today'
      ? 'See what is still open and decide whether it is due soon or just stays on the list until you finish it.'
      : activeView === 'planner'
      ? 'Turn due dates and open tasks into a concrete plan with focus blocks on the calendar.'
      : activeView === 'week'
      ? 'Plan ahead so deadlines and repeating work do not sneak up on you.'
      : activeView === 'routines'
      ? 'Set up tasks that automatically reset themselves when the next cycle arrives.'
      : activeView === 'history'
      ? 'Look back at passive task completions and routine streaks in one place.'
      : activeView === 'network'
      ? 'Save friends, exchange popups, and suggest tasks after signing in.'
      : activeView === 'settings'
      ? 'Manage your account, theme, do-not-disturb mode, and app startup preferences.'
      : 'Review website-submitted tasks and edit suggestions here before they touch your real planner.';

  return (
    <main className="app-shell">
      <div className="desktop-frame">
        <aside className="sidebar">
          <div className="sidebar-brand">
            <p className="section-kicker">To Do List</p>
            <h1>Desktop Planner</h1>
          </div>

          <div className="sidebar-nav">
            <button
              className={`sidebar-link ${activeView === 'today' ? 'is-active' : ''}`}
              type="button"
              onClick={() => setActiveView('today')}
            >
              Task list
            </button>
            <button
              className={`sidebar-link ${activeView === 'planner' ? 'is-active' : ''}`}
              type="button"
              onClick={() => setActiveView('planner')}
            >
              Planner
            </button>
            <button
              className={`sidebar-link ${activeView === 'week' ? 'is-active' : ''}`}
              type="button"
              onClick={() => setActiveView('week')}
            >
              Week
            </button>
            <button
              className={`sidebar-link ${activeView === 'routines' ? 'is-active' : ''}`}
              type="button"
              onClick={() => setActiveView('routines')}
            >
              Routines
            </button>
            <button
              className={`sidebar-link ${activeView === 'history' ? 'is-active' : ''}`}
              type="button"
              onClick={() => setActiveView('history')}
            >
              History
            </button>
            {isDevVariant ? (
              <button
                className={`sidebar-link ${activeView === 'submissions' ? 'is-active' : ''}`}
                type="button"
                onClick={() => setActiveView('submissions')}
              >
                {pendingWebsiteQueueCount
                  ? `Website queue (${pendingWebsiteQueueCount})`
                  : 'Website queue'}
              </button>
            ) : null}
            <button
              className={`sidebar-link ${activeView === 'network' ? 'is-active' : ''}`}
              type="button"
              onClick={() => setActiveView('network')}
            >
              {pendingFriendEventCount
                ? `Friend network (${pendingFriendEventCount})`
                : 'Friend network'}
            </button>
            <button
              className={`sidebar-link ${activeView === 'settings' ? 'is-active' : ''}`}
              type="button"
              onClick={() => setActiveView('settings')}
            >
              Settings
            </button>
          </div>

          <div className="sidebar-stats">
            <div className="stat-tile">
              <span className="stat-label">Open now</span>
              <strong>{pendingTasks.length}</strong>
            </div>
            <div className="stat-tile">
              <span className="stat-label">This week</span>
              <strong>
                {weekDates.reduce(
                  (count, dateValue) => count + (weeklyPlan.get(dateValue)?.length ?? 0),
                  0,
                )}
              </strong>
            </div>
            <div className="stat-tile">
              <span className="stat-label">Active routines</span>
              <strong>{activeRoutineCount}</strong>
            </div>
            <div className="stat-tile">
              <span className="stat-label">Consistency</span>
              <strong>{overallRoutineRate}%</strong>
            </div>
          </div>
        </aside>

        <section className="main-pane">
          <header className="main-header">
            <div>
              <p className="section-kicker">
                {activeView === 'today'
                  ? 'Task list'
                  : activeView === 'planner'
                  ? 'Planner'
                  : activeView === 'week'
                  ? 'Week'
                  : activeView === 'routines'
                  ? 'Routines'
                  : activeView === 'history'
                  ? 'History'
                  : activeView === 'network'
                  ? 'Friend network'
                  : activeView === 'settings'
                  ? 'Settings'
                  : 'Website queue'}
              </p>
              <h2>{headerTitle}</h2>
              <p className="section-copy">{headerCopy}</p>
            </div>

            {activeView === 'settings' ? (
              <div className="header-actions">
                <button
                  className="soft-button primary"
                  type="button"
                  disabled={isSettingsSyncing}
                  onClick={() => {
                    void handleSettingsSyncAndUpdateCheck();
                  }}
                >
                  {isSettingsSyncing ? 'Syncing...' : 'Sync + check updates'}
                </button>
              </div>
            ) : null}
          </header>

          {error ? <div className="banner">{error}</div> : null}
          {activeView === 'settings' && settingsSyncStatus ? (
            <div className="banner success-banner">{settingsSyncStatus}</div>
          ) : null}

          {activeView === 'settings' ? (
          <section className="panel-card account-card">
            <div className="panel-top">
              <div>
                <p className="section-kicker">Sync account</p>
                <h3>
                  {accountStatus?.session
                    ? `Signed in as ${accountStatus.session.username}`
                    : 'Sign in to sync across devices'}
                </h3>
                <p className="section-copy">
                  Username and password sync your tasks, routines, and saved friend contacts through Supabase.
                </p>
              </div>
              <span className={`status-chip ${accountStatus?.session ? 'success' : 'muted'}`}>
                {accountStatus?.session ? 'sync on' : 'local only'}
              </span>
            </div>

            {!accountStatus?.isConfigured ? (
              <p className="empty-state">
                Account sync tables are not ready yet. Run the Supabase account-sync SQL, then restart.
              </p>
            ) : accountStatus.session ? (
              <div className="row-actions">
                <button
                  className="soft-button primary"
                  type="button"
                  onClick={() => {
                    void handleAccountSyncNow();
                  }}
                >
                  Sync now
                </button>
                <button
                  className="soft-button"
                  type="button"
                  onClick={() => {
                    void handleAccountSignOut();
                  }}
                >
                  Sign out
                </button>
                {accountStatus.lastSyncedAt ? (
                  <span className="field-hint">
                    Last sync {formatDateTime(accountStatus.lastSyncedAt)}
                  </span>
                ) : null}
              </div>
            ) : (
              <form
                className="composer-form"
                onSubmit={(event) => {
                  void handleAccountSubmit(event, 'signIn');
                }}
              >
                <div className="split-fields">
                  <div className="field">
                    <label htmlFor="sync-username">Username</label>
                    <input
                      id="sync-username"
                      value={accountForm.username}
                      maxLength={40}
                      onChange={(event) =>
                        setAccountForm((current) => ({
                          ...current,
                          username: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="sync-password">Password</label>
                    <input
                      id="sync-password"
                      type="password"
                      value={accountForm.password}
                      maxLength={128}
                      onChange={(event) =>
                        setAccountForm((current) => ({
                          ...current,
                          password: event.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
                <div className="row-actions">
                  <button className="soft-button primary" type="submit">
                    Sign in
                  </button>
                  <button
                    className="soft-button"
                    type="button"
                    onClick={() => {
                      void window.todoApp.account
                        .signUp(accountForm)
                        .then(async (nextStatus) => {
                          setAccountStatus(nextStatus);
                          setAccountForm({ username: '', password: '' });
                          await refreshAll();
                        })
                        .catch((accountError) => setError(getErrorMessage(accountError)));
                    }}
                  >
                    Create account
                  </button>
                </div>
              </form>
            )}

            {accountStatus?.syncError ? (
              <p className="field-hint danger-text">{accountStatus.syncError}</p>
            ) : null}
          </section>
          ) : null}

          {activeView === 'settings' ? (
            <>
              <section className="panel-card">
                <div className="panel-top">
                  <div>
                    <p className="section-kicker">Theme</p>
                    <h3>{activeThemePalette.label}</h3>
                    <p className="section-copy">
                      Pick a built-in palette or make your own base and highlight colors.
                    </p>
                  </div>
                  <div className="theme-swatches settings-swatches" aria-hidden="true">
                    <span style={{ background: activeThemePalette.base }} />
                    <span style={{ background: activeThemePalette.accent }} />
                  </div>
                </div>

                <div className="split-fields">
                  <label className="field" htmlFor="theme-preset">
                    Palette
                    <select
                      id="theme-preset"
                      value={themeSettings.presetId}
                      onChange={(event) => {
                        handleThemePresetChange(event.target.value as ThemePresetId);
                      }}
                    >
                      {THEME_PRESETS.map((preset) => (
                        <option key={preset.id} value={preset.id}>
                          {preset.label}
                        </option>
                      ))}
                      <option value="custom">Custom</option>
                    </select>
                  </label>

                  <div className="theme-color-grid">
                    <label className="field compact-field" htmlFor="theme-base">
                      Base
                      <input
                        id="theme-base"
                        type="color"
                        value={themeSettings.customBase}
                        onChange={(event) =>
                          handleCustomThemeColorChange('customBase', event.target.value)
                        }
                      />
                    </label>
                    <label className="field compact-field" htmlFor="theme-accent">
                      Highlight
                      <input
                        id="theme-accent"
                        type="color"
                        value={themeSettings.customAccent}
                        onChange={(event) =>
                          handleCustomThemeColorChange('customAccent', event.target.value)
                        }
                      />
                    </label>
                  </div>
                </div>
              </section>

              <section className="panel-card">
                <div className="panel-top">
                  <div>
                    <p className="section-kicker">Friend identity</p>
                    <h3>{friendNetworkStatus?.deviceName ?? 'Local device'}</h3>
                    <p className="section-copy">
                      Device ID: {friendNetworkStatus?.deviceKey ?? 'Not loaded yet'}
                    </p>
                    {friendNetworkStatus?.profileName ? (
                      <p className="field-hint">
                        Local test profile: {friendNetworkStatus.profileName}
                      </p>
                    ) : null}
                  </div>
                  <span className="status-chip accent">
                    {accountStatus?.session?.displayName ??
                      accountStatus?.session?.username ??
                      'sign in'}
                  </span>
                </div>

                {!friendNetworkStatus?.isConfigured ? (
                  <p className="empty-state">
                    Friend network tables are not ready yet. Run the Supabase SQL from this repo,
                    then restart the app.
                  </p>
                ) : null}

                {accountStatus?.session ? (
                  <form className="composer-form" onSubmit={handleDisplayNameSubmit}>
                    <div className="field">
                      <label htmlFor="display-name">Your display name</label>
                      <input
                        id="display-name"
                        value={displayNameDraft}
                        maxLength={64}
                        placeholder={accountStatus.session.displayName ?? 'Optional'}
                        onChange={(event) => setDisplayNameDraft(event.target.value)}
                      />
                      <p className="field-hint">
                        Friends add you by @{accountStatus.session.username}. This optional name is
                        what they see unless they set their own private nickname for you. Save it
                        blank to fall back to your username.
                      </p>
                    </div>
                    <button className="soft-button primary" type="submit">
                      Save display name
                    </button>
                  </form>
                ) : (
                  <p className="empty-state">
                    Sign in above before using app-to-app friends and popups.
                  </p>
                )}
              </section>

              <section className="panel-card">
                <div className="panel-top">
                  <div>
                    <p className="section-kicker">Do not disturb</p>
                    <h3>Control what turns into a popup</h3>
                  </div>
                  <span className="status-chip accent">
                    {friendNetworkStatus?.dndMode ?? 'off'}
                  </span>
                </div>

                <div className="picker-row">
                  {(['off', 'quiet', 'full'] as AppDndMode[]).map((mode) => (
                    <button
                      key={mode}
                      className={`picker-chip ${
                        friendNetworkStatus?.dndMode === mode ? 'is-active' : ''
                      }`}
                      type="button"
                      onClick={() => {
                        void handleDndModeChange(mode);
                      }}
                    >
                      {mode === 'off' ? 'Off' : mode === 'quiet' ? 'Quiet' : 'Full DND'}
                    </button>
                  ))}
                </div>

                <p className="field-hint">
                  Quiet queues normal popups and suggestions but lets emergency popups through.
                  Full DND queues everything until you turn DND off.
                </p>
              </section>

              <section className="panel-card">
                <div className="panel-top">
                  <div>
                    <p className="section-kicker">Startup</p>
                    <h3>Open automatically when Windows starts</h3>
                    <p className="section-copy">
                      Keep the planner available in the background after this is installed as the
                      packaged app.
                    </p>
                  </div>
                  <span className={`status-chip ${startupSettings?.openAtLogin ? 'success' : 'muted'}`}>
                    {startupSettings?.openAtLogin ? 'enabled' : 'off'}
                  </span>
                </div>
                <label className="inline-check">
                  <input
                    type="checkbox"
                    checked={startupSettings?.openAtLogin ?? false}
                    disabled={!startupSettings?.isSupported}
                    onChange={(event) => {
                      void handleStartupToggle(event.target.checked);
                    }}
                  />
                  Start app when I sign in
                </label>
                {!startupSettings?.isSupported ? (
                  <p className="field-hint">
                    Startup mode only works from the installed EXE build, not while running through
                    VS Code.
                  </p>
                ) : null}
              </section>
            </>
          ) : null}

          {activeView === 'today' ? (
            <>
              <section className="panel-card">
                <div className="panel-top">
                  <div>
                    <p className="section-kicker">Add Task</p>
                    <h3>Passive unless you set a due date</h3>
                    <p className="section-copy">
                      Leave due date empty and it stays open until you check it off. Open the details only when you want timing, notes, or a custom priority.
                    </p>
                  </div>
                </div>

                <form className="composer-form" onSubmit={handleTaskSubmit}>
                  <div className="quick-row">
                    <input
                      className="title-input"
                      placeholder="Type a task and press Add"
                      value={taskFormValues.title}
                      onChange={(event) => {
                        const { value } = event.currentTarget;
                        setTaskFormValues((current) => ({
                          ...current,
                          title: value,
                        }));
                      }}
                    />
                    <button className="soft-button primary" type="submit" disabled={isSubmitting}>
                      {isSubmitting ? 'Adding...' : 'Add'}
                    </button>
                  </div>

                  <button
                    className="link-button"
                    type="button"
                    onClick={() => setTaskDetailsOpen((current) => !current)}
                  >
                    {taskDetailsOpen ? 'Hide task details' : 'Add timing, notes, or priority'}
                  </button>

                  {taskDetailsOpen ? (
                    <div className="details-panel">
                      <div className="field">
                        <label htmlFor="task-priority">Priority</label>
                        <select
                          id="task-priority"
                          value={taskFormValues.priority}
                          onChange={(event) => {
                            const { value } = event.currentTarget;
                            setTaskFormValues((current) => ({
                              ...current,
                              priority: value as TaskPriority,
                            }));
                          }}
                        >
                          {TASK_PRIORITY_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <div className="field-hint">
                          {
                            TASK_PRIORITY_OPTIONS.find(
                              (option) => option.value === taskFormValues.priority,
                            )?.description
                          }
                        </div>
                      </div>

                      <div className="field">
                        <label htmlFor="task-visibility">Friend visibility</label>
                        <select
                          id="task-visibility"
                          value={taskFormValues.visibility}
                          onChange={(event) => {
                            const { value } = event.currentTarget;
                            setTaskFormValues((current) => ({
                              ...current,
                              visibility: value as TaskVisibility,
                            }));
                          }}
                        >
                          {TASK_VISIBILITY_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <div className="field-hint">
                          {
                            TASK_VISIBILITY_OPTIONS.find(
                              (option) => option.value === taskFormValues.visibility,
                            )?.description
                          }
                        </div>
                      </div>

                      <div className="schedule-grid">
                        <ScheduleCard
                          title="Reminder"
                          dateInputId="task-reminder-date"
                          timeInputId="task-reminder-time"
                          dateValue={taskFormValues.reminderDate}
                          timeValue={taskFormValues.reminderTime}
                          datePresets={getDatePresetChoices()}
                          timePresets={REMINDER_TIME_PRESETS}
                          onDateChange={(value) =>
                            setTaskFormValues((current) => ({
                              ...current,
                              reminderDate: value,
                            }))
                          }
                          onTimeChange={(value) =>
                            setTaskFormValues((current) => ({
                              ...current,
                              reminderTime: value,
                            }))
                          }
                          onClear={() =>
                            setTaskFormValues((current) => ({
                              ...current,
                              reminderDate: '',
                              reminderTime: '',
                            }))
                          }
                        />

                        <ScheduleCard
                          title="Due"
                          dateInputId="task-due-date"
                          timeInputId="task-due-time"
                          dateValue={taskFormValues.dueDate}
                          timeValue={taskFormValues.dueTime}
                          datePresets={getDatePresetChoices()}
                          timePresets={DUE_TIME_PRESETS}
                          onDateChange={(value) =>
                            setTaskFormValues((current) => ({
                              ...current,
                              dueDate: value,
                            }))
                          }
                          onTimeChange={(value) =>
                            setTaskFormValues((current) => ({
                              ...current,
                              dueTime: value,
                            }))
                          }
                          onClear={() =>
                            setTaskFormValues((current) => ({
                              ...current,
                              dueDate: '',
                              dueTime: '',
                            }))
                          }
                        />
                      </div>

                      <div className="field">
                        <label htmlFor="task-notes">Notes</label>
                        <textarea
                          id="task-notes"
                          placeholder="Optional details"
                          value={taskFormValues.notes}
                          onChange={(event) => {
                            const { value } = event.currentTarget;
                            setTaskFormValues((current) => ({
                              ...current,
                              notes: value,
                            }));
                          }}
                        />
                      </div>
                    </div>
                  ) : null}
                </form>
              </section>

              <section className="panel-card">
                <div className="panel-top">
                  <div>
                    <p className="section-kicker">Checklist</p>
                    <h3>What still needs to happen</h3>
                  </div>
                </div>

                {isLoading ? (
                  <p className="empty-state">Loading your tasks...</p>
                ) : pendingTasks.length === 0 ? (
                  <p className="empty-state">Nothing open right now.</p>
                ) : (
                  <div className="list-stack">
                    {pendingTasks.map((task) => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        isSelected={selectedTaskId === task.id}
                        onComplete={handleCompleteTask}
                        onReopen={handleReopenTask}
                        onDelete={handleDeleteTask}
                        onSave={handleSaveTask}
                      />
                    ))}
                  </div>
                )}

                <button
                  className="collapse-button"
                  type="button"
                  onClick={() => setShowCompletedTasks((current) => !current)}
                >
                  {showCompletedTasks ? 'Hide' : 'Show'} completed ({completedTasks.length})
                </button>

                {showCompletedTasks ? (
                  completedTasks.length === 0 ? (
                    <p className="empty-state">Completed tasks will show up here.</p>
                  ) : (
                    <div className="list-stack">
                      {completedTasks.map((task) => (
                        <TaskRow
                          key={task.id}
                          task={task}
                          isSelected={false}
                          onComplete={handleCompleteTask}
                          onReopen={handleReopenTask}
                          onDelete={handleDeleteTask}
                          onSave={handleSaveTask}
                        />
                      ))}
                    </div>
                  )
                ) : null}
              </section>
            </>
          ) : null}

          {activeView === 'planner' ? (
            <div className="planner-layout">
              <section className="panel-card planner-hero">
                <div className="planner-hero-copy">
                  <p className="section-kicker">Daily planner</p>
                  <h3>{formatDateOnly(plannerDate)}</h3>
                  <p className="section-copy">
                    Turn the loose work queue into a visible day: deadlines, focus blocks, and
                    open tasks all live in one planning surface.
                  </p>
                </div>
                <div className="planner-date-nav" aria-label="Planner date controls">
                  <button
                    className="soft-button"
                    type="button"
                    onClick={() => {
                      const nextDate = addDaysToDateString(plannerDate, -1);
                      setPlannerDate(nextDate);
                      setTimeBlockForm((current) => ({ ...current, date: nextDate }));
                    }}
                  >
                    Prev
                  </button>
                  <input
                    className="planner-date-input"
                    type="date"
                    value={plannerDate}
                    onChange={(event) => {
                      setPlannerDate(event.target.value);
                      setTimeBlockForm((current) => ({
                        ...current,
                        date: event.target.value,
                      }));
                    }}
                  />
                  <button
                    className="soft-button"
                    type="button"
                    onClick={() => {
                      const nextDate = addDaysToDateString(plannerDate, 1);
                      setPlannerDate(nextDate);
                      setTimeBlockForm((current) => ({ ...current, date: nextDate }));
                    }}
                  >
                    Next
                  </button>
                </div>
                <div className="planner-score">
                  <span className="planner-stat">
                    <strong>{formatMinutes(plannerMinutes)}</strong>
                    <span>Planned</span>
                  </span>
                  <span className="planner-stat">
                    <strong>{plannerBlocks.length}</strong>
                    <span>Blocks</span>
                  </span>
                  <span className="planner-stat">
                    <strong>{plannerCompletionCount}</strong>
                    <span>Done</span>
                  </span>
                  <span className="planner-stat">
                    <strong>{plannerInboxCount}</strong>
                    <span>Open items</span>
                  </span>
                </div>
              </section>

              <div className="network-tabs planner-tabs" role="tablist" aria-label="Planner sections">
                <button
                  className={`network-tab ${activePlannerPanel === 'day' ? 'is-active' : ''}`}
                  type="button"
                  onClick={() => setActivePlannerPanel('day')}
                >
                  Day plan
                </button>
                <button
                  className={`network-tab ${activePlannerPanel === 'week' ? 'is-active' : ''}`}
                  type="button"
                  onClick={() => setActivePlannerPanel('week')}
                >
                  Week sketch
                </button>
              </div>

              {activePlannerPanel === 'day' ? (
                <>
              <section
                className="panel-card planner-timeline"
              >
                <div className="panel-top">
                  <div>
                    <p className="section-kicker">Day schedule</p>
                    <h3>Calendar</h3>
                    <p className="section-copy">
                      Drag tasks or routines onto an hour. Click a block to edit it or read notes.
                    </p>
                  </div>
                  <span className="status-chip accent">{formatMinutes(plannerMinutes)}</span>
                </div>

                <div className="calendar-scroll">
                  <div
                    className="day-calendar"
                    style={{ minHeight: `${24 * CALENDAR_HOUR_HEIGHT}px` }}
                  >
                    <div className="calendar-hours">
                      {calendarHours.map((hour) => (
                        <div
                          key={hour}
                          className="calendar-hour-row"
                          style={{ height: `${CALENDAR_HOUR_HEIGHT}px` }}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={(event) => {
                            event.preventDefault();
                            planDroppedItem(
                              event.dataTransfer.getData('text/planner-item'),
                              plannerDate,
                              hour,
                            );
                          }}
                        >
                          <span>{formatHourLabel(hour)}</span>
                        </div>
                      ))}
                    </div>

                    <div className="calendar-block-layer" aria-label="Planned blocks">
                      {sortedPlannerBlocks.map((block) => {
                        const hasConflict = plannerBlocks.some(
                          (candidate) =>
                            candidate.id !== block.id &&
                            candidate.startAt < block.endAt &&
                            candidate.endAt > block.startAt,
                        );
                        const isEditingBlock = editingTimeBlockId === block.id;

                        return isEditingBlock && editingTimeBlockForm ? (
                          <article
                            key={block.id}
                            className={`calendar-block calendar-block-editor is-${block.status}${
                              hasConflict ? ' has-conflict' : ''
                            } is-editing`}
                            style={{
                              ...getCalendarBlockStyle(block),
                              height: 'auto',
                              minHeight: '300px',
                              zIndex: 5,
                            }}
                          >
                            <form className="inline-block-editor" onSubmit={handleInlineTimeBlockSubmit}>
                              <div className="field">
                                <label htmlFor={`inline-block-title-${block.id}`}>Title</label>
                                <input
                                  id={`inline-block-title-${block.id}`}
                                  value={editingTimeBlockForm.title}
                                  onChange={(event) =>
                                    setEditingTimeBlockForm((current) =>
                                      current ? { ...current, title: event.target.value } : current,
                                    )
                                  }
                                />
                              </div>
                              <div className="three-fields">
                                <div className="field">
                                  <label htmlFor={`inline-block-date-${block.id}`}>Date</label>
                                  <input
                                    id={`inline-block-date-${block.id}`}
                                    type="date"
                                    value={editingTimeBlockForm.date}
                                    onChange={(event) =>
                                      setEditingTimeBlockForm((current) =>
                                        current ? { ...current, date: event.target.value } : current,
                                      )
                                    }
                                  />
                                </div>
                                <div className="field">
                                  <label htmlFor={`inline-block-start-${block.id}`}>Start</label>
                                  <input
                                    id={`inline-block-start-${block.id}`}
                                    type="time"
                                    value={editingTimeBlockForm.startTime}
                                    onChange={(event) =>
                                      setEditingTimeBlockForm((current) =>
                                        current
                                          ? { ...current, startTime: event.target.value }
                                          : current,
                                      )
                                    }
                                  />
                                </div>
                                <div className="field">
                                  <label htmlFor={`inline-block-end-${block.id}`}>End</label>
                                  <input
                                    id={`inline-block-end-${block.id}`}
                                    type="time"
                                    value={editingTimeBlockForm.endTime}
                                    onChange={(event) =>
                                      setEditingTimeBlockForm((current) =>
                                        current ? { ...current, endTime: event.target.value } : current,
                                      )
                                    }
                                  />
                                </div>
                              </div>
                              <div className="field">
                                <label htmlFor={`inline-block-notes-${block.id}`}>Notes</label>
                                <textarea
                                  id={`inline-block-notes-${block.id}`}
                                  value={editingTimeBlockForm.notes}
                                  placeholder="Notes for this block"
                                  onChange={(event) =>
                                    setEditingTimeBlockForm((current) =>
                                      current ? { ...current, notes: event.target.value } : current,
                                    )
                                  }
                                />
                              </div>
                              <label className="inline-check">
                                <input
                                  type="checkbox"
                                  checked={editingTimeBlockForm.enableDnd}
                                  onChange={(event) =>
                                    setEditingTimeBlockForm((current) =>
                                      current
                                        ? { ...current, enableDnd: event.target.checked }
                                        : current,
                                    )
                                  }
                                />
                                DND-ready focus block
                              </label>
                              <div className="row-actions">
                                <button className="soft-button primary" type="submit" disabled={isSubmitting}>
                                  Save
                                </button>
                                <button
                                  className="soft-button"
                                  type="button"
                                  disabled={isSubmitting}
                                  onClick={handleCancelTimeBlockEdit}
                                >
                                  Cancel
                                </button>
                                {block.status !== 'completed' ? (
                                  <button
                                    className="soft-button"
                                    type="button"
                                    disabled={isSubmitting}
                                    onClick={() => void handleTimeBlockStatus(block, 'completed')}
                                  >
                                    Done
                                  </button>
                                ) : null}
                                <button
                                  className="link-button"
                                  type="button"
                                  disabled={isSubmitting}
                                  onClick={() => void handleDeleteTimeBlock(block.id)}
                                >
                                  Delete
                                </button>
                              </div>
                            </form>
                          </article>
                        ) : (
                          <button
                            key={block.id}
                            className={`calendar-block is-${block.status}${
                              hasConflict ? ' has-conflict' : ''
                            }`}
                            type="button"
                            style={getCalendarBlockStyle(block)}
                            onClick={() => handleEditTimeBlock(block)}
                            title={`${formatTimeOnly(block.startAt)}-${formatTimeOnly(
                              block.endAt,
                            )} ${block.title}`}
                          >
                            <strong>{block.title}</strong>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </section>

              <div className="planner-right-rail">
                <section className="panel-card planner-inbox">
                  <div className="mini-section-head">
                    <div>
                      <p className="section-kicker">Inbox</p>
                      <h3>Open tasks and routines</h3>
                    </div>
                    <span className="status-chip muted">{plannerInboxCount}</span>
                  </div>
                  {plannerInboxCount === 0 ? (
                    <p className="empty-state">Everything open already has a block.</p>
                  ) : (
                    <div className="planner-task-list">
                      {unplannedTasks.map((task) => (
                        <article
                          key={task.id}
                          className="planner-task"
                          draggable
                          onDragStart={(event) =>
                            event.dataTransfer.setData('text/planner-item', `task:${task.id}`)
                          }
                        >
                          <div>
                            <div className="row-title">{task.title}</div>
                            <div className="row-meta">
                              {task.dueAt ? `Due ${formatDateTime(task.dueAt)}` : 'No deadline'}
                            </div>
                          </div>
                          <button
                            className="soft-button"
                            type="button"
                            onClick={() => void planTaskForDate(task)}
                          >
                            Plan
                          </button>
                        </article>
                      ))}
                      {plannableRoutines.map((item) => (
                        <article
                          key={item.template.id}
                          className="planner-task"
                          draggable
                          onDragStart={(event) =>
                            event.dataTransfer.setData(
                              'text/planner-item',
                              `routine:${item.template.id}`,
                            )
                          }
                        >
                          <div>
                            <div className="row-title">{item.template.title}</div>
                            <div className="row-meta">{formatRoutineRule(item.template.rule)}</div>
                          </div>
                          <button
                            className="soft-button"
                            type="button"
                            onClick={() => void planRoutineForDate(item)}
                          >
                            Plan
                          </button>
                        </article>
                      ))}
                    </div>
                  )}
                </section>

              <section className="panel-card planner-side">
                <div>
                  <p className="section-kicker">Plan a block</p>
                  <h3>Put work on the clock</h3>
                </div>
                <form className="composer-form" onSubmit={handleTimeBlockSubmit}>
                  <div className="field">
                    <label htmlFor="block-title">Block title</label>
                    <input
                      id="block-title"
                      value={timeBlockForm.title}
                      placeholder="Deep work on report"
                      onChange={(event) =>
                        setTimeBlockForm((current) => ({
                          ...current,
                          title: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="block-task">Linked task</label>
                    <select
                      id="block-task"
                      value={timeBlockForm.taskId}
                      onChange={(event) => {
                        const linkedTask = tasks.find((task) => task.id === event.target.value);
                        setTimeBlockForm((current) => ({
                          ...current,
                          taskId: event.target.value,
                          title: current.title || linkedTask?.title || '',
                        }));
                      }}
                    >
                      <option value="">No linked task</option>
                      {pendingTasks.map((task) => (
                        <option key={task.id} value={task.id}>
                          {task.title}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="planner-block-time-fields">
                    <div className="field">
                      <label htmlFor="block-date">Date</label>
                      <input
                        id="block-date"
                        type="date"
                        value={timeBlockForm.date}
                        onChange={(event) =>
                          setTimeBlockForm((current) => ({
                            ...current,
                            date: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="block-start">Start</label>
                      <input
                        id="block-start"
                        type="time"
                        value={timeBlockForm.startTime}
                        onChange={(event) =>
                          setTimeBlockForm((current) => ({
                            ...current,
                            startTime: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="block-end">End</label>
                      <input
                        id="block-end"
                        type="time"
                        value={timeBlockForm.endTime}
                        onChange={(event) =>
                          setTimeBlockForm((current) => ({
                            ...current,
                            endTime: event.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>
                  <label className="inline-check">
                    <input
                      type="checkbox"
                      checked={timeBlockForm.enableDnd}
                      onChange={(event) =>
                        setTimeBlockForm((current) => ({
                          ...current,
                          enableDnd: event.target.checked,
                        }))
                      }
                    />
                    Mark as a DND-ready focus block
                  </label>
                  <div className="field">
                    <label htmlFor="block-notes">Notes</label>
                    <textarea
                      id="block-notes"
                      value={timeBlockForm.notes}
                      placeholder="What would make this block successful?"
                      onChange={(event) =>
                        setTimeBlockForm((current) => ({
                          ...current,
                          notes: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <button className="soft-button primary" type="submit" disabled={isSubmitting}>
                    Add block
                  </button>
                </form>
              </section>
              </div>
                </>
              ) : null}

              {activePlannerPanel === 'week' ? (
              <section className="panel-card planner-week">
                <div className="panel-top">
                  <div>
                    <p className="section-kicker">Week sketch</p>
                    <h3>Time-block map</h3>
                    <p className="section-copy">
                      Scan where the week has room. Drop an item into any hour to sketch a block.
                    </p>
                  </div>
                </div>

                <div className="week-sketch-scroll">
                  <div className="week-sketch">
                    <div className="week-sketch-corner">
                      {formatMonthLabel(plannerDate)}
                    </div>
                    {plannerWeekDates.map((dateValue) => (
                      <button
                        key={`header-${dateValue}`}
                        className={`week-sketch-day-header${
                          dateValue === plannerDate ? ' is-selected' : ''
                        }`}
                        type="button"
                        onClick={() => setPlannerDate(dateValue)}
                      >
                        <span>{WEEKDAY_LABELS[getWeekdayForDateString(dateValue)].slice(0, 1)}</span>
                        <strong>{new Date(`${dateValue}T12:00:00`).getDate()}</strong>
                      </button>
                    ))}
                    <div className="week-sketch-times">
                      {calendarHours.map((hour) => (
                        <div
                          key={`week-hour-${hour}`}
                          className="week-sketch-time"
                          style={{ height: `${CALENDAR_HOUR_HEIGHT}px` }}
                        >
                          {formatHourLabel(hour)}
                        </div>
                      ))}
                    </div>
                    {plannerWeekDates.map((dateValue) => {
                      const blocksForDate = timeBlocks.filter(
                        (block) => toLocalDateString(new Date(block.startAt)) === dateValue,
                      );

                      return (
                        <div
                          key={`column-${dateValue}`}
                          className="week-sketch-day"
                          style={{ height: `${24 * CALENDAR_HOUR_HEIGHT}px` }}
                        >
                          {calendarHours.map((hour) => (
                            <div
                              key={`${dateValue}-${hour}`}
                              className="week-sketch-hour"
                              style={{ height: `${CALENDAR_HOUR_HEIGHT}px` }}
                              onDragOver={(event) => event.preventDefault()}
                              onDrop={(event) => {
                                event.preventDefault();
                                planDroppedItem(
                                  event.dataTransfer.getData('text/planner-item'),
                                  dateValue,
                                  hour,
                                );
                              }}
                            />
                          ))}
                          {blocksForDate.map((block) => (
                            <button
                              key={block.id}
                              className={`week-sketch-block is-${block.status}`}
                              type="button"
                              style={getCalendarBlockStyle(block)}
                              onClick={() => {
                                setPlannerDate(dateValue);
                                setActivePlannerPanel('day');
                                handleEditTimeBlock(block);
                              }}
                              title={`${formatTimeOnly(block.startAt)}-${formatTimeOnly(
                                block.endAt,
                              )} ${block.title}`}
                            >
                              {block.title}
                            </button>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>
              ) : null}
            </div>
          ) : null}

          {activeView === 'week' ? (
            <section className="panel-card">
              <div className="panel-top">
                <div>
                  <p className="section-kicker">Week</p>
                  <h3>What is coming up over the next 7 days</h3>
                  <p className="section-copy">
                    This view mixes one-time tasks with repeating work so you can see the whole week at once.
                  </p>
                </div>
              </div>

              <div className="week-grid">
                {weekDates.map((dateValue) => {
                  const items = weeklyPlan.get(dateValue) ?? [];
                  const isToday = dateValue === toLocalDateString(new Date());

                  return (
                    <article key={dateValue} className={`week-card ${isToday ? 'is-today' : ''}`}>
                      <div className="week-card-header">
                        <div className="week-card-title">{formatDateOnly(dateValue)}</div>
                        <span className="status-chip muted">{items.length}</span>
                      </div>

                      {items.length === 0 ? (
                        <p className="week-empty">Nothing scheduled.</p>
                      ) : (
                        <div className="week-item-stack">
                          {items.map((item) => (
                            <article key={item.id} className="week-item">
                              <div className="week-item-top">
                                <span className={`status-dot ${item.tone}`} />
                                <span className="week-item-title">{item.title}</span>
                              </div>
                              <div className="week-item-meta">{item.meta}</div>
                            </article>
                          ))}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          ) : null}

          {activeView === 'routines' ? (
            <>
              <section className="panel-card" ref={routineEditorRef}>
                <div className="panel-top">
                  <div>
                    <p className="section-kicker">Add Routine</p>
                    <h3>{editingRoutineId ? 'Update a repeating task' : 'Create a repeating task'}</h3>
                    <p className="section-copy">
                      For things like a Monday, Wednesday, Friday assignment, choose Week and check those days.
                    </p>
                  </div>

                  <div className="row-actions">
                    {editingRoutineId ? (
                      <span className="status-chip accent">Editing routine</span>
                    ) : null}
                    <button
                      className="icon-button"
                      type="button"
                      aria-label={routineEditorOpen ? 'Collapse routine form' : 'Expand routine form'}
                      onClick={() => setRoutineEditorOpen((current) => !current)}
                    >
                      {routineEditorOpen ? '-' : '+'}
                    </button>
                  </div>
                </div>

                {routineEditorOpen ? (
                <form className="composer-form" onSubmit={handleRoutineSubmit}>
                  <div className="quick-row routine-quick-row">
                    <input
                      ref={routineTitleInputRef}
                      className="title-input"
                      placeholder="Study math"
                      value={routineFormValues.title}
                      onChange={(event) => {
                        const { value } = event.currentTarget;
                        setRoutineFormValues((current) => ({
                          ...current,
                          title: value,
                        }));
                      }}
                    />

                    <input
                      className="small-input"
                      type="number"
                      min="1"
                      step="1"
                      value={routineFormValues.interval}
                      onChange={(event) => {
                        const { value } = event.currentTarget;
                        setRoutineFormValues((current) => ({
                          ...current,
                          interval: value,
                        }));
                      }}
                    />

                    <select
                      className="small-input"
                      value={routineFormValues.unit}
                      onChange={(event) => {
                        const { value } = event.currentTarget;
                        setRoutineFormValues((current) => ({
                          ...current,
                          unit: value as RoutineUnit,
                          weekdays:
                            value === 'week'
                              ? current.weekdays.length
                                ? current.weekdays
                                : [getWeekdayForDateString(current.startDate)]
                              : current.weekdays,
                        }));
                      }}
                    >
                      <option value="day">day</option>
                      <option value="week">week</option>
                      <option value="month">month</option>
                    </select>

                    <button className="soft-button primary" type="submit" disabled={isSubmitting}>
                      {isSubmitting ? 'Saving...' : editingRoutineId ? 'Update' : 'Add'}
                    </button>
                  </div>

                  <div className="field">
                    <label htmlFor="routine-priority">Priority</label>
                    <select
                      id="routine-priority"
                      value={routineFormValues.priority}
                      onChange={(event) => {
                        const { value } = event.currentTarget;
                        setRoutineFormValues((current) => ({
                          ...current,
                          priority: value as TaskPriority,
                        }));
                      }}
                    >
                      {TASK_PRIORITY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <div className="field-hint">
                      {
                        TASK_PRIORITY_OPTIONS.find(
                          (option) => option.value === routineFormValues.priority,
                        )?.description
                      }
                    </div>
                  </div>

                  {routineFormValues.unit === 'week' ? (
                    <div className="weekday-grid">
                      {WEEKDAY_ORDER.map((weekday) => {
                        const isActive = routineFormValues.weekdays.includes(weekday);

                        return (
                          <button
                            key={weekday}
                            className={`weekday-chip ${isActive ? 'is-active' : ''}`}
                            type="button"
                            onClick={() =>
                              setRoutineFormValues((current) => ({
                                ...current,
                                weekdays:
                                  isActive && current.weekdays.length === 1
                                    ? current.weekdays
                                    : isActive
                                    ? current.weekdays.filter((value) => value !== weekday)
                                    : [...current.weekdays, weekday],
                              }))
                            }
                          >
                            {WEEKDAY_LABELS[weekday]}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}

                  <div className="routine-form-actions">
                    <button
                      className="link-button"
                      type="button"
                      onClick={() => setRoutineDetailsOpen((current) => !current)}
                    >
                      {routineDetailsOpen ? 'Hide details' : 'Show dates, times, and notes'}
                    </button>

                    {editingRoutineId ? (
                      <button
                        className="link-button"
                        type="button"
                        onClick={() => {
                          setEditingRoutineId(null);
                          setRoutineFormValues(createEmptyRoutineForm());
                          setRoutineEditorOpen(false);
                        }}
                      >
                        Cancel edit
                      </button>
                    ) : null}
                  </div>

                  {routineDetailsOpen ? (
                    <div className="details-panel">
                      <div className="three-fields">
                        <div className="field">
                          <label htmlFor="routine-start">Start date</label>
                          <input
                            className="schedule-input"
                            id="routine-start"
                            type="date"
                            value={routineFormValues.startDate}
                            onChange={(event) => {
                              const { value } = event.currentTarget;
                              setRoutineFormValues((current) => ({
                                ...current,
                                startDate: value,
                              }));
                            }}
                          />
                          <PickerRow
                            choices={getDatePresetChoices()}
                            currentValue={routineFormValues.startDate}
                            onSelect={(value) =>
                              setRoutineFormValues((current) => ({
                                ...current,
                                startDate: value,
                              }))
                            }
                          />
                        </div>

                        <div className="field">
                          <label htmlFor="routine-end">End date</label>
                          <input
                            className="schedule-input"
                            id="routine-end"
                            type="date"
                            value={routineFormValues.endDate}
                            onChange={(event) => {
                              const { value } = event.currentTarget;
                              setRoutineFormValues((current) => ({
                                ...current,
                                endDate: value,
                              }));
                            }}
                          />
                          <PickerRow
                            choices={getDatePresetChoices()}
                            currentValue={routineFormValues.endDate}
                            onSelect={(value) =>
                              setRoutineFormValues((current) => ({
                                ...current,
                                endDate: value,
                              }))
                            }
                          />
                        </div>

                        <div className="field">
                          <label htmlFor="routine-due-time">Due time</label>
                          <input
                            className="schedule-input"
                            id="routine-due-time"
                            type="time"
                            value={routineFormValues.dueTime}
                            onChange={(event) => {
                              const { value } = event.currentTarget;
                              setRoutineFormValues((current) => ({
                                ...current,
                                dueTime: value,
                              }));
                            }}
                          />
                          <PickerRow
                            choices={DUE_TIME_PRESETS}
                            currentValue={routineFormValues.dueTime}
                            onSelect={(value) =>
                              setRoutineFormValues((current) => ({
                                ...current,
                                dueTime: value,
                              }))
                            }
                          />
                        </div>
                      </div>

                      <div className="split-fields">
                        <ScheduleCard
                          title="Reminder"
                          timeInputId="routine-reminder-time"
                          timeValue={routineFormValues.reminderTime}
                          showDate={false}
                          timeLabel="Reminder time"
                          timePresets={REMINDER_TIME_PRESETS}
                          onTimeChange={(value) =>
                            setRoutineFormValues((current) => ({
                              ...current,
                              reminderTime: value,
                            }))
                          }
                          onClear={() =>
                            setRoutineFormValues((current) => ({
                              ...current,
                              reminderTime: '',
                            }))
                          }
                        />

                        <div className="field routine-notes-field">
                          <label htmlFor="routine-notes">Notes</label>
                          <textarea
                            id="routine-notes"
                            placeholder="Optional details"
                            value={routineFormValues.notes}
                            onChange={(event) => {
                              const { value } = event.currentTarget;
                              setRoutineFormValues((current) => ({
                                ...current,
                                notes: value,
                              }));
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  ) : null}
                </form>
                ) : null}
              </section>

              <section className="panel-card">
                <div className="panel-top">
                  <div>
                    <p className="section-kicker">Routines</p>
                    <h3>Repeating tasks that reset themselves</h3>
                  </div>
                </div>

                {routines.length === 0 ? (
                  <p className="empty-state">No routines yet.</p>
                ) : (
                  <div className="list-stack">
                    {routines.map((item) => (
                      <RoutineRow
                        key={item.template.id}
                        item={item}
                        isSelected={selectedRoutineId === item.template.id}
                        onComplete={handleCompleteRoutine}
                        onReopen={handleReopenRoutine}
                        onDelete={handleDeleteRoutine}
                        onEdit={handleEditRoutine}
                      />
                    ))}
                  </div>
                )}
              </section>
            </>
          ) : null}

          {activeView === 'history' ? (
            <section className="panel-card">
              <div className="panel-top">
                <div>
                  <p className="section-kicker">History</p>
                  <h3>See what you finished and what slipped past</h3>
                </div>
              </div>

              {!hasAnyHistory ? (
                <p className="empty-state">
                  History fills in after you complete a passive task or start using routines.
                </p>
              ) : (
                <>
                  <div className="history-toolbar">
                    <div className="history-nav">
                      <button
                        className="soft-button"
                        type="button"
                        onClick={() => setHistoryMonthKey((current) => shiftMonthKey(current, -1))}
                      >
                        Prev
                      </button>
                      <span className="month-label">{formatMonthLabel(historyMonthKey)}</span>
                      <button
                        className="soft-button"
                        type="button"
                        onClick={() => setHistoryMonthKey((current) => shiftMonthKey(current, 1))}
                      >
                        Next
                      </button>
                    </div>

                    {routines.length ? (
                      <select
                        value={historyRoutineId ?? ''}
                        onChange={(event) => {
                          const { value } = event.currentTarget;
                          setHistoryRoutineId(value);
                        }}
                      >
                        {routines.map((item) => (
                          <option key={item.template.id} value={item.template.id}>
                            {item.template.title}
                          </option>
                        ))}
                      </select>
                    ) : null}
                  </div>

                  <div className="history-stack">
                    <div className="history-block">
                      <div className="mini-section-head">
                        <h4>Passive one-time tasks</h4>
                        <span className="status-chip muted">{completedPassiveTasks.length}</span>
                      </div>

                      <div className="history-chips">
                        <span className="status-chip accent">
                          {completedPassiveTasks.length} completed
                        </span>
                        <span className="status-chip muted">
                          {passiveCompletionsThisMonth} this month
                        </span>
                        <span className="status-chip muted">
                          {passiveTasks.length} total passive tasks
                        </span>
                      </div>

                      <div className="calendar-shell">
                        <div className="calendar-header">
                          {WEEKDAY_ORDER.map((weekday) => (
                            <div key={weekday} className="calendar-weekday">
                              {WEEKDAY_LABELS[weekday]}
                            </div>
                          ))}
                        </div>

                        <div className="calendar-grid">
                          {calendarCells.map((dateValue, index) => {
                            if (!dateValue) {
                              return <div key={`blank-${index}`} className="calendar-cell ghost" />;
                            }

                            const tasksForDate = passiveHistoryByDate.get(dateValue) ?? [];

                            return (
                              <button
                                key={dateValue}
                                className={`calendar-cell interactive ${tasksForDate.length ? 'completed task-history-cell' : 'blank'}`}
                                type="button"
                                title={
                                  tasksForDate.length
                                    ? `Completed ${tasksForDate.length} passive task${
                                        tasksForDate.length === 1 ? '' : 's'
                                      } on ${formatDateOnly(dateValue)}: ${tasksForDate
                                        .map((task) => task.title)
                                        .join(', ')}`
                                    : formatDateOnly(dateValue)
                                }
                                onClick={() => setSelectedHistoryDate(dateValue)}
                              >
                                <div className="calendar-stack">
                                  <span className="calendar-day">{dateValue.split('-')[2]}</span>
                                  {tasksForDate.length ? (
                                    <span className="calendar-count">{tasksForDate.length}</span>
                                  ) : null}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="recent-history">
                        <h4>Recent passive completions</h4>
                        {completedPassiveTasks.length === 0 ? (
                          <p className="empty-state">Passive tasks show up here after you finish them.</p>
                        ) : (
                          <div className="list-stack">
                            {completedPassiveTasks.slice(0, 8).map((task) => (
                              <article key={task.id} className="history-row">
                                <div>
                                  <div className="row-title">{task.title}</div>
                                  <div className="row-meta">
                                    Done {formatDateTime(task.completedAt) ?? formatDateOnly(getCompletedTaskDate(task) ?? toLocalDateString(new Date()))}
                                  </div>
                                </div>
                                <span className="status-chip success">completed</span>
                              </article>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {routines.length ? (
                      <div className="history-block">
                        <div className="mini-section-head">
                          <h4>{selectedHistoryTitle}</h4>
                          <span className="status-chip muted">routine</span>
                        </div>

                        {isHistoryLoading ? (
                          <p className="empty-state">Loading routine history...</p>
                        ) : (
                          <>
                            <div className="history-chips">
                              <span className="status-chip accent">
                                {historySummary?.totalCompleted ?? 0} completed
                              </span>
                              <span className="status-chip danger">
                                {historySummary?.totalMissed ?? 0} missed
                              </span>
                              <span className="status-chip muted">
                                {historySummary?.completionRate ?? 0}% rate
                              </span>
                              <span className="status-chip muted">
                                Streak {historySummary?.currentStreak ?? 0}
                              </span>
                              <span className="status-chip muted">
                                Best {historySummary?.bestStreak ?? 0}
                              </span>
                            </div>

                            <div className="calendar-shell">
                              <div className="calendar-header">
                                {WEEKDAY_ORDER.map((weekday) => (
                                  <div key={weekday} className="calendar-weekday">
                                    {WEEKDAY_LABELS[weekday]}
                                  </div>
                                ))}
                              </div>

                              <div className="calendar-grid">
                                {calendarCells.map((dateValue, index) => {
                                  if (!dateValue) {
                                    return <div key={`routine-blank-${index}`} className="calendar-cell ghost" />;
                                  }

                                  const occurrence = occurrenceByDate.get(dateValue);
                                  const status = occurrence?.status ?? 'blank';

                                  return (
                                    <button
                                      key={`routine-${dateValue}`}
                                      className={`calendar-cell interactive ${status}`}
                                      type="button"
                                      title={
                                        occurrence
                                          ? `${selectedHistoryTitle}: ${occurrence.status} on ${formatDateOnly(
                                              dateValue,
                                            )}`
                                          : formatDateOnly(dateValue)
                                      }
                                      onClick={() => setSelectedHistoryDate(dateValue)}
                                    >
                                      <span className="calendar-day">{dateValue.split('-')[2]}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            <div className="recent-history">
                              <h4>Recent routine cycles</h4>
                              {recentHistory.length === 0 ? (
                                <p className="empty-state">No routine history yet.</p>
                              ) : (
                                <div className="list-stack">
                                  {recentHistory.map((occurrence) => (
                                    <article key={occurrence.id} className="history-row">
                                      <div>
                                        <div className="row-title">{formatDateOnly(occurrence.scheduledDate)}</div>
                                        <div className="row-meta">
                                          Boundary {formatDateTime(occurrence.dueAt)}
                                        </div>
                                      </div>
                                      <span className={`status-chip ${getRoutineStatusTone(occurrence.status)}`}>
                                        {occurrence.status}
                                      </span>
                                    </article>
                                  ))}
                                </div>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    ) : null}
                  </div>
                </>
              )}
            </section>
          ) : null}

          {activeView === 'submissions' && isDevVariant ? (
            <section className="panel-card">
              <div className="panel-top">
                <div>
                  <p className="section-kicker">Website queue</p>
                  <h3>Review suggestions before they touch your workflow</h3>
                </div>
                <span className={`status-chip ${pendingWebsiteQueueCount ? 'danger' : 'muted'}`}>
                  {pendingWebsiteQueueCount} pending
                </span>
              </div>

              {pendingWebsiteQueueCount === 0 ? (
                <p className="empty-state">
                  Website-submitted tasks and edit suggestions will appear here. Accept only applies
                  them after you review them, and dismiss keeps them out of your planner.
                </p>
              ) : (
                <div className="list-stack">
                  <section className="details-panel">
                    <div className="panel-top">
                      <div>
                        <p className="section-kicker">New tasks</p>
                        <h4>Suggestions that could become real tasks</h4>
                      </div>
                      <span
                        className={`status-chip ${pendingSubmissionCount ? 'danger' : 'muted'}`}
                      >
                        {pendingSubmissionCount}
                      </span>
                    </div>

                    {submissions.length === 0 ? (
                      <p className="empty-state">No pending new-task suggestions right now.</p>
                    ) : (
                      <div className="list-stack">
                        {submissions.map((submission) => (
                          <SubmissionRow
                            key={submission.id}
                            submission={submission}
                            onAccept={handleAcceptSubmission}
                            onDismiss={handleDismissSubmission}
                          />
                        ))}
                      </div>
                    )}
                  </section>

                  <section className="details-panel">
                    <div className="panel-top">
                      <div>
                        <p className="section-kicker">Task edits</p>
                        <h4>Suggested changes to existing local tasks</h4>
                      </div>
                      <span
                        className={`status-chip ${
                          pendingEditSuggestionCount ? 'accent' : 'muted'
                        }`}
                      >
                        {pendingEditSuggestionCount}
                      </span>
                    </div>

                    {editSuggestions.length === 0 ? (
                      <p className="empty-state">No pending task-edit suggestions right now.</p>
                    ) : (
                      <div className="list-stack">
                        {editSuggestions.map((suggestion) => (
                          <TaskEditSuggestionRow
                            key={suggestion.id}
                            suggestion={suggestion}
                            currentTask={taskById.get(suggestion.localTaskId)}
                            onAccept={handleAcceptEditSuggestion}
                            onDismiss={handleDismissEditSuggestion}
                          />
                        ))}
                      </div>
                    )}
                  </section>
                </div>
              )}
            </section>
          ) : null}

          {activeView === 'network' ? (
            <section className="panel-card">
              <div className="panel-top">
                <div>
                  <p className="section-kicker">Friend network</p>
                  <h3>Installed-app popups between friends</h3>
                  <p className="section-copy">
                    Save friends, exchange popups, and suggest tasks without letting anything touch
                    a planner until the recipient accepts it.
                  </p>
                </div>
                <span
                  className={`status-chip ${
                    friendNetworkStatus?.isConfigured ? 'success' : 'danger'
                  }`}
                >
                  {friendNetworkStatus?.isConfigured ? 'connected' : 'needs setup'}
                </span>
              </div>

              <div className="network-tabs">
                {networkPanelItems.map((item) => (
                  <button
                    key={item.id}
                    className={`network-tab ${activeNetworkPanel === item.id ? 'is-active' : ''}`}
                    type="button"
                    onClick={() => setActiveNetworkPanel(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {!accountStatus?.session ? (
                <p className="empty-state">
                  Please log in from Settings to communicate with other users.
                </p>
              ) : null}

              <div className="list-stack">
                {activeNetworkPanel === 'friends' ? (
                <section className="details-panel">
                  <div className="panel-top">
                    <div>
                      <p className="section-kicker">Saved friends</p>
                      <h4>Friends saved by username</h4>
                      <p className="field-hint">
                        Add friends by username. Your nickname for them is private and never changes
                        who messages are sent to.
                      </p>
                    </div>
                    <span className="status-chip muted">{friendContacts.length} saved</span>
                  </div>

                  {!accountStatus?.session ? (
                    <p className="empty-state">Sign in to save friends across devices.</p>
                  ) : (
                    <form className="composer-form" onSubmit={handleFriendContactSubmit}>
                      <div className="split-fields">
                        <div className="field">
                          <label htmlFor="friend-contact-nickname">
                            Private nickname (optional)
                          </label>
                          <input
                            id="friend-contact-nickname"
                            value={friendContactForm.nickname}
                            maxLength={60}
                            placeholder="Defaults to username"
                            onChange={(event) =>
                              setFriendContactForm((current) => ({
                                ...current,
                                nickname: event.target.value,
                              }))
                            }
                            onBlur={() => clearFriendFormErrors('contactNickname')}
                          />
                          <FieldError message={friendFormErrors.contactNickname} />
                        </div>
                        <div className="field">
                          <label htmlFor="friend-contact-username">Friend username</label>
                          <input
                            id="friend-contact-username"
                            value={friendContactForm.friendUsername}
                            maxLength={40}
                            placeholder="@username"
                            onChange={(event) =>
                              setFriendContactForm((current) => ({
                                ...current,
                                friendUsername: event.target.value.replace(/^@/, ''),
                              }))
                            }
                            onBlur={() => clearFriendFormErrors('contactUsername')}
                          />
                          <FieldError message={friendFormErrors.contactUsername} />
                        </div>
                      </div>
                      <div className="field">
                        <label htmlFor="friend-contact-permission">Task access</label>
                        <select
                          id="friend-contact-permission"
                          value={friendContactForm.taskPermission}
                          onChange={(event) =>
                            setFriendContactForm((current) => ({
                              ...current,
                              taskPermission: event.target.value as FriendTaskPermission,
                            }))
                          }
                        >
                          {FRIEND_TASK_PERMISSION_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <div className="field-hint">
                          {
                            FRIEND_TASK_PERMISSION_OPTIONS.find(
                              (option) => option.value === friendContactForm.taskPermission,
                            )?.description
                          }
                        </div>
                      </div>
                      <button className="soft-button primary" type="submit">
                        Save friend
                      </button>
                    </form>
                  )}

                  {friendContacts.length ? (
                    <div className="list-stack">
                      {friendContacts.map((contact) => (
                        <article key={contact.id} className="history-row compact-row">
                          <div>
                            <div className="row-title">{contact.nickname}</div>
                            <span className="status-chip muted">
                              {
                                FRIEND_TASK_PERMISSION_OPTIONS.find(
                                  (option) => option.value === contact.taskPermission,
                                )?.label
                              }
                            </span>
                            <div className="row-meta">
                              {contact.friendDisplayName ?? contact.friendUsername} · @{contact.friendUsername}
                            </div>
                          </div>
                          <div className="row-actions">
                            <button
                              className="soft-button"
                              type="button"
                              onClick={() => prepareFriendContactRename(contact)}
                            >
                              Rename
                            </button>
                            <button
                              className="soft-button"
                              type="button"
                              onClick={() => {
                                void handleFriendContactDelete(contact.id);
                              }}
                            >
                              Remove
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : null}
                </section>
                ) : null}

                {activeNetworkPanel === 'friends' ? (
                <section className="details-panel">
                  <div className="panel-top">
                    <div>
                      <p className="section-kicker">Emergency passwords</p>
                      <h4>Control who can send you mega popups</h4>
                      <p className="field-hint">
                        You set a password for a saved friend. That friend can see the password you
                        granted them, and only that password can emergency-popup you.
                      </p>
                    </div>
                    <span className="status-chip muted">{emergencyPasswords.length} granted</span>
                  </div>

                  {!accountStatus?.session || friendContacts.length === 0 ? (
                    <p className="empty-state">
                      Sign in and save a friend before granting emergency popup access.
                    </p>
                  ) : (
                    <form className="composer-form" onSubmit={handleEmergencyPasswordSubmit}>
                      <div className="split-fields">
                      <div className="field">
                        <label htmlFor="emergency-friend">Friend</label>
                        <select
                            id="emergency-friend"
                            value={emergencyPasswordForm.friendAccountId}
                            required
                            onChange={(event) =>
                              setEmergencyPasswordForm((current) => ({
                                ...current,
                                friendAccountId: event.target.value,
                              }))
                            }
                            onBlur={() => clearFriendFormErrors('emergencyFriend')}
                          >
                            <option value="">Choose a saved friend</option>
                            {friendContacts.map((contact) => (
                              <option key={contact.id} value={contact.friendAccountId}>
                                {contact.nickname} (@{contact.friendUsername})
                              </option>
                            ))}
                          </select>
                          <FieldError message={friendFormErrors.emergencyFriend} />
                        </div>
                        <div className="field">
                          <label htmlFor="emergency-grant-password">Password they use</label>
                          <input
                            id="emergency-grant-password"
                            value={emergencyPasswordForm.password}
                            required
                            minLength={1}
                            maxLength={128}
                            onChange={(event) =>
                              setEmergencyPasswordForm((current) => ({
                                ...current,
                                password: event.target.value,
                              }))
                            }
                            onBlur={() => clearFriendFormErrors('emergencyPassword')}
                          />
                          <FieldError message={friendFormErrors.emergencyPassword} />
                        </div>
                      </div>
                      <button className="soft-button primary" type="submit">
                        Save password grant
                      </button>
                    </form>
                  )}

                  {emergencyPasswords.length ? (
                    <div className="list-stack">
                      {emergencyPasswords.map((grant) => (
                        <article key={grant.id} className="history-row compact-row">
                          <div>
                            <div className="row-title">
                              {grant.friendNickname ?? grant.friendUsername}
                            </div>
                            <div className="row-meta password-row">
                              <span>
                                Password:{' '}
                                {visibleEmergencyPasswordIds[grant.id]
                                  ? grant.password
                                  : getMaskedPassword(grant.password)}
                              </span>
                              <button
                                className="icon-button"
                                type="button"
                                aria-label={
                                  visibleEmergencyPasswordIds[grant.id]
                                    ? 'Hide password'
                                    : 'Show password'
                                }
                                onClick={() => toggleEmergencyPasswordVisibility(grant.id)}
                              >
                                {visibleEmergencyPasswordIds[grant.id] ? 'Hide' : 'Show'}
                              </button>
                            </div>
                          </div>
                          <button
                            className="soft-button"
                            type="button"
                            onClick={() => {
                              void handleEmergencyPasswordDelete(grant.id);
                            }}
                          >
                            Remove
                          </button>
                        </article>
                      ))}
                    </div>
                  ) : null}

                  {emergencyPasswordsForMe.length ? (
                    <div className="list-stack">
                      <p className="field-hint">Passwords friends granted you:</p>
                      {emergencyPasswordsForMe.map((grant) => (
                        <article key={grant.id} className="history-row compact-row">
                          <div>
                            <div className="row-title">
                              {grant.friendNickname ?? grant.friendUsername}
                            </div>
                            <div className="row-meta password-row">
                              <span>
                                Use:{' '}
                                {visibleEmergencyPasswordIds[grant.id]
                                  ? grant.password
                                  : getMaskedPassword(grant.password)}
                              </span>
                              <button
                                className="icon-button"
                                type="button"
                                aria-label={
                                  visibleEmergencyPasswordIds[grant.id]
                                    ? 'Hide password'
                                    : 'Show password'
                                }
                                onClick={() => toggleEmergencyPasswordVisibility(grant.id)}
                              >
                                {visibleEmergencyPasswordIds[grant.id] ? 'Hide' : 'Show'}
                              </button>
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : null}
                </section>
                ) : null}

                {activeNetworkPanel === 'review' ? (
                <section className="details-panel">
                  <div className="panel-top">
                    <div>
                      <p className="section-kicker">Friend review queue</p>
                      <h4>Task suggestions waiting for a decision</h4>
                    </div>
                    <span
                      className={`status-chip ${pendingFriendSuggestionCount ? 'danger' : 'muted'}`}
                    >
                      {pendingFriendSuggestionCount} pending
                    </span>
                  </div>

                  {pendingFriendSuggestionEvents.length === 0 ? (
                    <p className="empty-state">
                      Friend task suggestions and edit suggestions will wait here until you accept
                      or deny them.
                    </p>
                  ) : (
                    <div className="list-stack">
                      {pendingFriendSuggestionEvents.map((popupEvent) => (
                        <article key={popupEvent.id} className="history-row">
                          <div>
                            <div className="row-title">
                              {popupEvent.title ??
                                popupEvent.relatedTaskTitle ??
                                popupEvent.kind}
                            </div>
                            <div className="row-meta">
                              {formatDateTime(popupEvent.createdAt)} · {popupEvent.kind}
                              {popupEvent.senderName ? ` · ${popupEvent.senderName}` : ''}
                            </div>
                            {popupEvent.kind === 'task_edit_suggestion' ? (
                              getFriendTaskEditChangeRows(popupEvent).map((changeRow) => (
                                <p key={changeRow} className="row-note">
                                  {changeRow}
                                </p>
                              ))
                            ) : (
                              <p className="row-note">{popupEvent.message}</p>
                            )}
                          </div>
                          <div className="row-actions">
                            {popupEvent.kind === 'task_submission' ||
                            popupEvent.kind === 'task_edit_suggestion' ? (
                              <button
                                className="soft-button primary"
                                type="button"
                                onClick={() => {
                                  void handleAcceptFriendEvent(popupEvent.id);
                                }}
                              >
                                Accept
                              </button>
                            ) : null}
                            <button
                              className="soft-button"
                              type="button"
                              onClick={() => {
                                void handleDenyFriendEvent(popupEvent.id);
                              }}
                            >
                              Deny
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </section>
                ) : null}

                {activeNetworkPanel === 'send' ? (
                <details className="details-panel collapsible-panel" open>
                  <summary className="collapsible-summary">
                    <div>
                      <p className="section-kicker">Send popup</p>
                      <h4>Test app-to-app delivery</h4>
                    </div>
                    <span className="status-chip muted">
                      {queuedFriendPopupCount} queued messages
                    </span>
                  </summary>

                  <form className="composer-form" onSubmit={handleFriendPopupSubmit}>
                    <div className="split-fields">
                      <FriendRecipientPicker
                        id="recipient-code"
                        label="Recipient"
                        contacts={friendContacts}
                        value={friendPopupForm.recipientUsername}
                        selectedAccountId={friendPopupForm.recipientAccountId}
                        error={friendFormErrors.popupRecipient}
                        onSelect={applyContactToPopupForm}
                        onClear={(value) => {
                          clearFriendFormErrors('popupRecipient', 'popupTask');
                          setFriendPopupTasks([]);
                          setFriendPopupForm((current) => ({
                            ...current,
                            recipientUsername: value,
                            recipientAccountId: '',
                            relatedTaskId: '',
                          }));
                        }}
                      />
                      <div className="field">
                        <label htmlFor="sender-name">Sender name</label>
                        <input
                          id="sender-name"
                          value={friendPopupForm.senderName}
                          maxLength={80}
                          placeholder="Optional"
                          onChange={(event) =>
                            setFriendPopupForm((current) => ({
                              ...current,
                              senderName: event.target.value,
                            }))
                          }
                        />
                      </div>
                    </div>

                    <div className="field">
                      <label htmlFor="popup-related-task">Related task</label>
                      <select
                        id="popup-related-task"
                        value={friendPopupForm.relatedTaskId}
                        disabled={
                          !friendPopupForm.recipientAccountId || isLoadingFriendPopupTasks
                        }
                        onChange={(event) =>
                          setFriendPopupForm((current) => ({
                            ...current,
                            relatedTaskId: event.target.value,
                          }))
                        }
                      >
                        <option value="">
                          {!friendPopupForm.recipientAccountId
                            ? 'Choose a friend first'
                            : isLoadingFriendPopupTasks
                              ? 'Loading live tasks...'
                              : 'General popup'}
                        </option>
                        {friendPopupTasks.map((task) => (
                          <option key={task.id} value={task.id}>
                            {task.title}
                          </option>
                        ))}
                      </select>
                      <FieldError message={friendFormErrors.popupTask} />
                    </div>

                    <div className="field">
                      <label htmlFor="friend-message">Message</label>
                      <textarea
                        id="friend-message"
                        value={friendPopupForm.message}
                        maxLength={4000}
                        onKeyDown={submitFormOnEnter}
                        onChange={(event) =>
                          setFriendPopupForm((current) => ({
                            ...current,
                            message: event.target.value,
                          }))
                        }
                        onBlur={() => clearFriendFormErrors('popupMessage')}
                      />
                      <FieldError message={friendFormErrors.popupMessage} />
                    </div>

                    <label className="inline-check">
                      <input
                        type="checkbox"
                        checked={friendPopupForm.isEmergency}
                        onChange={(event) =>
                          setFriendPopupForm((current) => ({
                            ...current,
                            isEmergency: event.target.checked,
                          }))
                        }
                      />
                      Send as emergency mega popup
                    </label>

                    {friendPopupForm.isEmergency ? (
                      <div className="field">
                        <label htmlFor="friend-emergency-password">Emergency password</label>
                        <input
                          id="friend-emergency-password"
                          type="password"
                          value={friendPopupForm.emergencyPassword}
                          placeholder="Required for emergency mega popups"
                          onChange={(event) =>
                            setFriendPopupForm((current) => ({
                              ...current,
                              emergencyPassword: event.target.value,
                            }))
                          }
                          onBlur={() => clearFriendFormErrors('popupEmergencyPassword')}
                        />
                        <FieldError message={friendFormErrors.popupEmergencyPassword} />
                      </div>
                    ) : null}

                    <button className="soft-button primary" type="submit">
                      Send popup
                    </button>
                  </form>
                </details>
                ) : null}

                {activeNetworkPanel === 'send' ? (
                <details className="details-panel collapsible-panel">
                  <summary className="collapsible-summary">
                    <div>
                      <p className="section-kicker">Suggest task</p>
                      <h4>Send a task for a friend to accept or deny</h4>
                    </div>
                    <span className="status-chip muted">reviewed by them</span>
                  </summary>

                  <form className="composer-form" onSubmit={handleFriendTaskSuggestionSubmit}>
                    <div className="split-fields">
                      <FriendRecipientPicker
                        id="task-suggestion-recipient"
                        label="Recipient"
                        contacts={friendContacts}
                        value={friendTaskSuggestionForm.recipientUsername}
                        selectedAccountId={friendTaskSuggestionForm.recipientAccountId}
                        error={friendFormErrors.taskRecipient}
                        onSelect={applyContactToTaskSuggestionForm}
                        onClear={(value) => {
                          clearFriendFormErrors('taskRecipient');
                          setFriendTaskSuggestionForm((current) => ({
                            ...current,
                            recipientUsername: value,
                            recipientAccountId: '',
                          }));
                        }}
                      />
                      <div className="field">
                        <label htmlFor="task-suggestion-sender">Sender name</label>
                        <input
                          id="task-suggestion-sender"
                          value={friendTaskSuggestionForm.senderName}
                          maxLength={80}
                          placeholder="Optional"
                          onChange={(event) =>
                            setFriendTaskSuggestionForm((current) => ({
                              ...current,
                              senderName: event.target.value,
                            }))
                          }
                        />
                      </div>
                    </div>

                    <div className="field">
                      <label htmlFor="task-suggestion-title">Task title</label>
                      <input
                        id="task-suggestion-title"
                        value={friendTaskSuggestionForm.title}
                        maxLength={160}
                        onChange={(event) =>
                          setFriendTaskSuggestionForm((current) => ({
                            ...current,
                            title: event.target.value,
                          }))
                        }
                        onBlur={() => clearFriendFormErrors('taskTitle')}
                      />
                      <FieldError message={friendFormErrors.taskTitle} />
                    </div>

                    <div className="field">
                      <label htmlFor="task-suggestion-notes">Description</label>
                      <textarea
                        id="task-suggestion-notes"
                        value={friendTaskSuggestionForm.notes}
                        onKeyDown={submitFormOnEnter}
                        onChange={(event) =>
                          setFriendTaskSuggestionForm((current) => ({
                            ...current,
                            notes: event.target.value,
                          }))
                        }
                      />
                    </div>

                    <div className="three-fields">
                      <div className="field">
                        <label htmlFor="task-suggestion-due-date">Due date</label>
                        <input
                          id="task-suggestion-due-date"
                          type="date"
                          value={friendTaskSuggestionForm.dueDate}
                          onChange={(event) =>
                            setFriendTaskSuggestionForm((current) => ({
                              ...current,
                              dueDate: event.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="field">
                        <label htmlFor="task-suggestion-reminder-date">Reminder date</label>
                        <input
                          id="task-suggestion-reminder-date"
                          type="date"
                          value={friendTaskSuggestionForm.reminderDate}
                          onChange={(event) =>
                            setFriendTaskSuggestionForm((current) => ({
                              ...current,
                              reminderDate: event.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="field">
                        <label htmlFor="task-suggestion-priority">Priority</label>
                        <select
                          id="task-suggestion-priority"
                          value={friendTaskSuggestionForm.priority}
                          onChange={(event) =>
                            setFriendTaskSuggestionForm((current) => ({
                              ...current,
                              priority: event.target.value as TaskPriority,
                            }))
                          }
                        >
                          {TASK_PRIORITY_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <button className="soft-button primary" type="submit">
                      Send task suggestion
                    </button>
                  </form>
                </details>
                ) : null}

                {activeNetworkPanel === 'send' ? (
                  <>
                <details className="details-panel collapsible-panel">
                  <summary className="collapsible-summary">
                    <div>
                      <p className="section-kicker">Suggest edit</p>
                      <h4>Ask a friend to change one of their tasks</h4>
                      <p className="field-hint">
                        Pick from the tasks your friend is publicly sharing, then suggest the
                        changes you want them to review.
                      </p>
                    </div>
                    <span className="status-chip muted">public tasks</span>
                  </summary>

                  <form className="composer-form" onSubmit={handleFriendTaskEditSuggestionSubmit}>
                    <div className="split-fields">
                      <FriendRecipientPicker
                        id="task-edit-recipient"
                        label="Recipient"
                        contacts={friendContacts}
                        value={friendTaskEditSuggestionForm.recipientUsername}
                        selectedAccountId={friendTaskEditSuggestionForm.recipientAccountId}
                        error={friendFormErrors.editRecipient}
                        onSelect={applyContactToTaskEditSuggestionForm}
                        onClear={(value) => {
                          clearFriendFormErrors('editRecipient', 'editTask');
                          setFriendPublicTasks([]);
                          setFriendTaskEditSuggestionForm((current) => ({
                            ...current,
                            recipientUsername: value,
                            recipientAccountId: '',
                            publicTaskId: '',
                            taskTitle: '',
                          }));
                        }}
                      />
                      <div className="field">
                        <label htmlFor="task-edit-sender">Sender name</label>
                        <input
                          id="task-edit-sender"
                          value={friendTaskEditSuggestionForm.senderName}
                          maxLength={80}
                          placeholder="Optional"
                          onChange={(event) =>
                            setFriendTaskEditSuggestionForm((current) => ({
                              ...current,
                              senderName: event.target.value,
                            }))
                          }
                        />
                      </div>
                    </div>

                    <div className="field">
                      <label htmlFor="task-edit-target">Public task or routine to edit</label>
                      <select
                        id="task-edit-target"
                        value={friendTaskEditSuggestionForm.publicTaskId}
                        disabled={
                          !friendTaskEditSuggestionForm.recipientAccountId ||
                          isLoadingFriendPublicTasks
                        }
                        onChange={(event) =>
                          {
                            const selectedTask = friendPublicTasks.find(
                              (task) => task.id === event.target.value,
                            );
                            clearFriendFormErrors('editTask');
                            setFriendTaskEditSuggestionForm((current) => ({
                              ...current,
                              publicTaskId: selectedTask?.id ?? '',
                              taskTitle: selectedTask?.title ?? '',
                              suggestedTitle:
                                selectedTask?.kind === 'routine'
                                  ? selectedTask.title
                                  : current.suggestedTitle,
                              suggestedPriority:
                                selectedTask?.kind === 'routine'
                                  ? normalizeTaskPriority(selectedTask.priority as TaskPriority)
                                  : current.suggestedPriority,
                              suggestedRoutineStartDate:
                                selectedTask?.kind === 'routine'
                                  ? selectedTask.scheduledDate ?? toLocalDateString(new Date())
                                  : current.suggestedRoutineStartDate,
                              suggestedRoutineDueTime:
                                selectedTask?.kind === 'routine' && selectedTask.dueAt
                                  ? splitDateTimeValue(selectedTask.dueAt).time
                                  : current.suggestedRoutineDueTime,
                              suggestedRoutineReminderTime:
                                selectedTask?.kind === 'routine' && selectedTask.reminderAt
                                  ? splitDateTimeValue(selectedTask.reminderAt).time
                                  : current.suggestedRoutineReminderTime,
                            }));
                          }
                        }
                      >
                        <option value="">
                          {isLoadingFriendPublicTasks
                            ? 'Loading public items...'
                            : 'Choose a public item'}
                        </option>
                        {friendPublicTasks.map((task) => (
                          <option key={task.id} value={task.id}>
                            {task.kind === 'routine' ? 'Routine: ' : 'Task: '}
                            {task.title}
                          </option>
                        ))}
                      </select>
                      <FieldError message={friendFormErrors.editTask} />
                    </div>

                    <div className="split-fields">
                      <div className="field">
                        <label htmlFor="task-edit-title">Suggested new title</label>
                        <input
                          id="task-edit-title"
                          value={friendTaskEditSuggestionForm.suggestedTitle}
                          maxLength={160}
                          placeholder="Leave blank for no title change"
                          onChange={(event) =>
                            setFriendTaskEditSuggestionForm((current) => ({
                              ...current,
                              suggestedTitle: event.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="field">
                        <label htmlFor="task-edit-priority">Suggested priority</label>
                        <select
                          id="task-edit-priority"
                          value={friendTaskEditSuggestionForm.suggestedPriority}
                          onChange={(event) =>
                            setFriendTaskEditSuggestionForm((current) => ({
                              ...current,
                              suggestedPriority: event.target.value as TaskPriority,
                            }))
                          }
                        >
                          {TASK_PRIORITY_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="field">
                      <label htmlFor="task-edit-notes">Suggested description</label>
                      <textarea
                        id="task-edit-notes"
                        value={friendTaskEditSuggestionForm.suggestedNotes}
                        placeholder="Leave blank for no description change"
                        onKeyDown={submitFormOnEnter}
                        onChange={(event) =>
                          setFriendTaskEditSuggestionForm((current) => ({
                            ...current,
                            suggestedNotes: event.target.value,
                          }))
                        }
                      />
                    </div>

                    {isSuggestingRoutineEdit ? (
                      <div className="details-panel">
                        <div className="quick-row routine-quick-row">
                          <input
                            className="small-input"
                            type="number"
                            min="1"
                            step="1"
                            value={friendTaskEditSuggestionForm.suggestedRoutineInterval}
                            onChange={(event) =>
                              setFriendTaskEditSuggestionForm((current) => ({
                                ...current,
                                suggestedRoutineInterval: event.target.value,
                              }))
                            }
                          />
                          <select
                            className="small-input"
                            value={friendTaskEditSuggestionForm.suggestedRoutineUnit}
                            onChange={(event) => {
                              const nextUnit = event.target.value as RoutineUnit;
                              setFriendTaskEditSuggestionForm((current) => ({
                                ...current,
                                suggestedRoutineUnit: nextUnit,
                                suggestedRoutineWeekdays:
                                  nextUnit === 'week' && current.suggestedRoutineWeekdays.length === 0
                                    ? [getWeekdayForDateString(current.suggestedRoutineStartDate)]
                                    : current.suggestedRoutineWeekdays,
                              }));
                            }}
                          >
                            <option value="day">day</option>
                            <option value="week">week</option>
                            <option value="month">month</option>
                          </select>
                        </div>

                        {friendTaskEditSuggestionForm.suggestedRoutineUnit === 'week' ? (
                          <div className="weekday-grid">
                            {WEEKDAY_ORDER.map((weekday) => {
                              const isActive =
                                friendTaskEditSuggestionForm.suggestedRoutineWeekdays.includes(
                                  weekday,
                                );

                              return (
                                <button
                                  key={weekday}
                                  className={`weekday-chip ${isActive ? 'is-active' : ''}`}
                                  type="button"
                                  onClick={() =>
                                    setFriendTaskEditSuggestionForm((current) => ({
                                      ...current,
                                      suggestedRoutineWeekdays:
                                        isActive && current.suggestedRoutineWeekdays.length === 1
                                          ? current.suggestedRoutineWeekdays
                                          : isActive
                                          ? current.suggestedRoutineWeekdays.filter(
                                              (value) => value !== weekday,
                                            )
                                          : [...current.suggestedRoutineWeekdays, weekday],
                                    }))
                                  }
                                >
                                  {WEEKDAY_LABELS[weekday]}
                                </button>
                              );
                            })}
                          </div>
                        ) : null}

                        <div className="three-fields">
                          <div className="field">
                            <label htmlFor="routine-edit-start">Suggested start date</label>
                            <input
                              id="routine-edit-start"
                              className="schedule-input"
                              type="date"
                              value={friendTaskEditSuggestionForm.suggestedRoutineStartDate}
                              onChange={(event) =>
                                setFriendTaskEditSuggestionForm((current) => ({
                                  ...current,
                                  suggestedRoutineStartDate: event.target.value,
                                }))
                              }
                            />
                          </div>
                          <div className="field">
                            <label htmlFor="routine-edit-end">Suggested end date</label>
                            <input
                              id="routine-edit-end"
                              className="schedule-input"
                              type="date"
                              value={friendTaskEditSuggestionForm.suggestedRoutineEndDate}
                              onChange={(event) =>
                                setFriendTaskEditSuggestionForm((current) => ({
                                  ...current,
                                  suggestedRoutineEndDate: event.target.value,
                                }))
                              }
                            />
                          </div>
                          <div className="field">
                            <label htmlFor="routine-edit-due-time">Suggested due time</label>
                            <input
                              id="routine-edit-due-time"
                              className="schedule-input"
                              type="time"
                              value={friendTaskEditSuggestionForm.suggestedRoutineDueTime}
                              onChange={(event) =>
                                setFriendTaskEditSuggestionForm((current) => ({
                                  ...current,
                                  suggestedRoutineDueTime: event.target.value,
                                }))
                              }
                            />
                          </div>
                        </div>

                        <div className="field">
                          <label htmlFor="routine-edit-reminder-time">Suggested reminder time</label>
                          <input
                            id="routine-edit-reminder-time"
                            className="schedule-input"
                            type="time"
                            value={friendTaskEditSuggestionForm.suggestedRoutineReminderTime}
                            onChange={(event) =>
                              setFriendTaskEditSuggestionForm((current) => ({
                                ...current,
                                suggestedRoutineReminderTime: event.target.value,
                              }))
                            }
                          />
                        </div>
                      </div>
                    ) : (
                    <div className="split-fields">
                      <div className="field">
                        <label htmlFor="task-edit-due-date">Suggested due date</label>
                        <input
                          id="task-edit-due-date"
                          type="date"
                          value={friendTaskEditSuggestionForm.suggestedDueDate}
                          onChange={(event) =>
                            setFriendTaskEditSuggestionForm((current) => ({
                              ...current,
                              suggestedDueDate: event.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="field">
                        <label htmlFor="task-edit-reminder-date">Suggested reminder date</label>
                        <input
                          id="task-edit-reminder-date"
                          type="date"
                          value={friendTaskEditSuggestionForm.suggestedReminderDate}
                          onChange={(event) =>
                            setFriendTaskEditSuggestionForm((current) => ({
                              ...current,
                              suggestedReminderDate: event.target.value,
                            }))
                          }
                        />
                      </div>
                    </div>
                    )}

                    <button className="soft-button primary" type="submit">
                      Send edit suggestion
                    </button>
                  </form>
                </details>
                  </>
                ) : null}

                {activeNetworkPanel === 'review' && isDevVariant ? (
                  <section className="details-panel">
                  <div className="panel-top">
                    <div>
                      <p className="section-kicker">Recent popups</p>
                      <h4>Local popup history</h4>
                      <p className="field-hint">
                        Dev builds can inspect recent app-to-app popup events without a password.
                        User builds do not show this review history.
                      </p>
                    </div>
                    <span className="status-chip muted">{recentFriendEvents.length} stored</span>
                  </div>

                  {isRecentPopupsVisible ? (
                    <div className="list-stack">
                      <div className="row-actions">
                        <button
                          className="soft-button"
                          type="button"
                          onClick={() => setIsRecentPopupsVisible(false)}
                        >
                          Hide recent popups
                        </button>
                      </div>

                      {recentFriendEvents.length === 0 ? (
                        <p className="empty-state">No app-to-app popup events yet.</p>
                      ) : (
                        recentFriendEvents.slice(0, 50).map((popupEvent) => {
                          const senderLabel =
                            popupEvent.senderName ??
                            popupEvent.senderDisplayName ??
                            popupEvent.source ??
                            'Unknown sender';
                          const recipientLabel =
                            popupEvent.recipientAccountId === accountStatus?.session?.accountId
                              ? `you (@${accountStatus.session.username})`
                              : popupEvent.recipientAccountId;

                          return (
                            <article key={popupEvent.id} className="history-row">
                            <div>
                              <div className="row-title">
                                {popupEvent.title ?? popupEvent.relatedTaskTitle ?? popupEvent.kind}
                              </div>
                              <div className="row-meta">
                                {formatDateTime(popupEvent.createdAt)} · {popupEvent.status}
                                {popupEvent.senderName ? ` · ${popupEvent.senderName}` : ''}
                              </div>
                              <p className="row-meta">
                                From {senderLabel} to {recipientLabel}
                              </p>
                              {popupEvent.relatedTaskTitle ? (
                                <p className="row-meta">
                                  About task: {popupEvent.relatedTaskTitle}
                                </p>
                              ) : null}
                              <p className="row-note">{popupEvent.message}</p>
                            </div>
                            <span
                              className={`status-chip ${
                                popupEvent.priority === 'emergency' ? 'danger' : 'muted'
                              }`}
                            >
                              {popupEvent.priority}
                            </span>
                            </article>
                          );
                        })
                      )}
                    </div>
                  ) : (
                    <div className="row-actions">
                      <button
                        className="soft-button primary"
                        type="button"
                        onClick={() => setIsRecentPopupsVisible(true)}
                      >
                        View recent popups
                      </button>
                    </div>
                  )}
                  </section>
                ) : null}
              </div>
            </section>
          ) : null}
        </section>
      </div>
      {selectedHistoryDate ? (
        <HistoryDayModal
          payload={
            historyDayPayload ?? {
              date: selectedHistoryDate,
              tasks: [],
              routineEntries: [],
            }
          }
          isLoading={isHistoryDayLoading}
          error={historyDayError}
          onClose={() => setSelectedHistoryDate(null)}
          onRefresh={async () => {
            await refreshAll();

            if (selectedHistoryDate) {
              await loadHistoryDay(selectedHistoryDate);
            }
          }}
          onTaskReopen={handleReopenTask}
          onTaskDelete={handleDeleteTask}
          onTaskCompletionDateChange={handleTaskCompletionDateChange}
          onRoutineOccurrenceUpdate={handleRoutineOccurrenceHistoryUpdate}
        />
      ) : null}
    </main>
  );
}

function MiniWindowScreen() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [routines, setRoutines] = useState<RoutineListItem[]>([]);
  const [composerValues, setComposerValues] = useState<MiniComposerValues>(
    createEmptyMiniComposer(),
  );
  const [showTimingOptions, setShowTimingOptions] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const miniInputRef = useRef<HTMLInputElement | null>(null);
  const hasFocusedOnce = useRef(false);

  const refreshMini = async () => {
    const [nextTasks, nextRoutines] = await Promise.all([
      window.todoApp.tasks.list(),
      window.todoApp.routines.list(),
    ]);

    setTasks(nextTasks);
    setRoutines(nextRoutines);
  };

  useEffect(() => {
    document.title = 'Mini Window';
    void window.todoApp.app.info().then((info) => {
      document.body.dataset.appVariant = info.variant;
    });

    let isActive = true;

    const load = async (markLoaded = false) => {
      try {
        await refreshMini();

        if (isActive) {
          setError(null);
        }
      } catch (loadError) {
        if (isActive) {
          setError(getErrorMessage(loadError));
        }
      } finally {
        if (markLoaded && isActive) {
          setIsLoading(false);
        }
      }
    };

    void load(true);

    const handleDataChange = () => {
      void load(false);
    };

    const handleWindowFocus = () => {
      handleDataChange();
      window.setTimeout(() => {
        miniInputRef.current?.focus({
          preventScroll: true,
        });
      }, 60);
    };

    const removeTaskListener = window.todoApp.tasks.onChanged(handleDataChange);
    const removeRoutineListener = window.todoApp.routines.onChanged(handleDataChange);

    window.addEventListener('focus', handleWindowFocus);

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        window.close();
      }
    };

    window.addEventListener('keydown', handleEscape);

    return () => {
      isActive = false;
      removeTaskListener();
      removeRoutineListener();
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('keydown', handleEscape);
    };
  }, []);

  useEffect(() => {
    if (isLoading || hasFocusedOnce.current) {
      return;
    }

    hasFocusedOnce.current = true;
    const focusTimer = window.setTimeout(() => {
      miniInputRef.current?.focus({
        preventScroll: true,
      });
    }, 90);

    return () => {
      window.clearTimeout(focusTimer);
    };
  }, [isLoading]);

  const applyTaskMutation = async (operation: () => Promise<Task[]>) => {
    setError(null);

    try {
      const nextTasks = await operation();
      setTasks(nextTasks);
    } catch (mutationError) {
      setError(getErrorMessage(mutationError));
    }
  };

  const applyRoutineMutation = async (operation: () => Promise<RoutineListItem[]>) => {
    setError(null);

    try {
      const nextRoutines = await operation();
      setRoutines(nextRoutines);
    } catch (mutationError) {
      setError(getErrorMessage(mutationError));
    }
  };

  const handleCompleteTask = async (taskId: string) => {
    await applyTaskMutation(() => window.todoApp.tasks.complete(taskId));
  };

  const handleReopenTask = async (taskId: string) => {
    await applyTaskMutation(() => window.todoApp.tasks.reopen(taskId));
  };

  const handleDeleteTask = async (taskId: string) => {
    await applyTaskMutation(() => window.todoApp.tasks.delete(taskId));
  };

  const handleCompleteRoutine = async (routineId: string) => {
    await applyRoutineMutation(() => window.todoApp.routines.completeCurrent(routineId));
  };

  const handleReopenRoutine = async (routineId: string) => {
    await applyRoutineMutation(() => window.todoApp.routines.reopenCurrent(routineId));
  };

  const handleDeleteRoutine = async (routineId: string) => {
    await applyRoutineMutation(() => window.todoApp.routines.delete(routineId));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const trimmedTitle = composerValues.title.trim();

    if (!trimmedTitle) {
      setError('Type a task first.');
      miniInputRef.current?.focus({
        preventScroll: true,
      });
      return;
    }

    setIsSubmitting(true);

    try {
      if (composerValues.repeat === 'none') {
        const taskDraft: TaskDraft = buildTaskDraft({
          title: trimmedTitle,
          dueDate: composerValues.dueDate,
          dueTime: composerValues.dueTime,
          reminderDate: composerValues.reminderDate,
          reminderTime: composerValues.reminderTime,
          notes: '',
          priority: composerValues.priority,
          visibility: 'public',
        });

        await window.todoApp.tasks.create(taskDraft);
      } else {
        const today = toLocalDateString(new Date());
        await window.todoApp.routines.create({
          title: trimmedTitle,
          priority: composerValues.priority,
          rule: {
            interval: 1,
            unit: composerValues.repeat === 'daily' ? 'day' : 'week',
            weekdays:
              composerValues.repeat === 'selectedDays'
                ? composerValues.weekdays.length
                  ? composerValues.weekdays
                  : [getWeekdayForDateString(today)]
                : undefined,
            startDate: today,
            dueTime: composerValues.dueTime || undefined,
            reminderTime: composerValues.reminderTime || undefined,
          },
        });
      }

      setComposerValues(createEmptyMiniComposer());
      setShowTimingOptions(false);
      await refreshMini();
      miniInputRef.current?.focus({
        preventScroll: true,
      });
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    } finally {
      setIsSubmitting(false);
    }
  };

  const activeTasks = tasks.filter((task) => task.status === 'pending');
  const activeRoutines = routines.filter(
    (item) => item.currentOccurrence?.status === 'pending',
  );
  const today = toLocalDateString(new Date());
  const completedTodayTasks = tasks.filter(
    (task) => task.status === 'completed' && getCompletedTaskDate(task) === today,
  );
  const completedTodayRoutines = routines.filter((item) => {
    const currentOccurrence = item.currentOccurrence;
    return (
      currentOccurrence?.status === 'completed' &&
      getCompletedLocalDate(currentOccurrence.completedAt) === today
    );
  });
  const buildMiniTaskItem = (task: Task) => {
    const priorityDetails = getTaskPriorityDetails(task);

    return {
      key: `task-${task.id}`,
      title: task.title,
      meta: joinMeta(
        priorityDetails.label,
        formatDateTime(task.dueAt) ? `Due ${formatDateTime(task.dueAt)}` : 'No deadline',
      ),
      rank: priorityDetails.rank,
      sortDate: task.dueAt ?? task.createdAt,
      onToggle: () => handleCompleteTask(task.id),
      onDelete: () => handleDeleteTask(task.id),
    };
  };
  const buildMiniRoutineItem = (item: RoutineListItem) => {
    const priorityDetails = getRoutinePriorityDetails({
      priority: item.template.priority,
      currentOccurrence: item.currentOccurrence,
    });

    return {
      key: `routine-${item.template.id}`,
      title: item.template.title,
      meta: joinMeta(
        priorityDetails.label,
        formatRoutineRule(item.template.rule),
        formatDateTime(item.currentOccurrence?.dueAt)
          ? `Due ${formatDateTime(item.currentOccurrence?.dueAt)}`
          : 'Due by end of day',
      ),
      rank: priorityDetails.rank,
      sortDate: item.currentOccurrence?.dueAt ?? item.template.createdAt,
      onToggle: () => handleCompleteRoutine(item.template.id),
      onDelete: () => handleDeleteRoutine(item.template.id),
    };
  };
  const activeItems = [
    ...activeTasks.map((task) => {
      return buildMiniTaskItem(task);
    }),
    ...activeRoutines.map((item) => {
      return buildMiniRoutineItem(item);
    }),
  ].sort((left, right) => {
    if (left.rank !== right.rank) {
      return left.rank - right.rank;
    }

    if (left.sortDate !== right.sortDate) {
      return left.sortDate.localeCompare(right.sortDate);
    }

    return left.title.localeCompare(right.title);
  });
  const completedItems = [
    ...completedTodayTasks.map((task) => {
      const priorityDetails = getTaskPriorityDetails(task);

      return {
        key: `completed-task-${task.id}`,
        title: task.title,
        meta: joinMeta(
          priorityDetails.label,
          formatDateTime(task.completedAt)
            ? `Done ${formatDateTime(task.completedAt)}`
            : 'Done today',
        ),
        completedAt: task.completedAt ?? task.createdAt,
        onToggle: () => handleReopenTask(task.id),
        onDelete: () => handleDeleteTask(task.id),
      };
    }),
    ...completedTodayRoutines.map((item) => {
      const priorityDetails = getRoutinePriorityDetails({
        priority: item.template.priority,
        currentOccurrence: item.currentOccurrence,
      });

      return {
        key: `completed-routine-${item.template.id}`,
        title: item.template.title,
        meta: joinMeta(
          priorityDetails.label,
          'Routine',
          formatDateTime(item.currentOccurrence?.completedAt)
            ? `Done ${formatDateTime(item.currentOccurrence?.completedAt)}`
            : 'Done today',
        ),
        completedAt: item.currentOccurrence?.completedAt ?? item.template.createdAt,
        onToggle: () => handleReopenRoutine(item.template.id),
        onDelete: () => handleDeleteRoutine(item.template.id),
      };
    }),
  ].sort((left, right) => right.completedAt.localeCompare(left.completedAt));

  return (
    <main className="mini-shell">
      <section className="mini-window">
        <header className="mini-header">
          <div>
            <p className="section-kicker">Mini Window</p>
            <h1>What is open</h1>
          </div>

          <button
            className="link-button"
            type="button"
            onClick={() => {
              void window.todoApp.app.show();
            }}
          >
            Full app
          </button>
        </header>

        {error ? <div className="banner">{error}</div> : null}

        <form className="mini-quick-form" onSubmit={handleSubmit}>
          <div className="mini-topbar">
            <input
              ref={miniInputRef}
              autoFocus
              className="title-input"
              placeholder="Type a task and press Enter"
              value={composerValues.title}
              onChange={(event) => {
                const { value } = event.currentTarget;
                setComposerValues((current) => ({
                  ...current,
                  title: value,
                }));
              }}
            />
            <button className="soft-button primary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Adding...' : 'Add'}
            </button>
          </div>

          <div className="mini-inline-actions">
            <button
              className="link-button"
              type="button"
              onClick={() => setShowTimingOptions((current) => !current)}
            >
              {showTimingOptions ? 'Hide details' : 'Timing, repeat, and priority'}
            </button>
          </div>

          {showTimingOptions ? (
            <div className="details-panel">
              <div className="field">
                <label htmlFor="mini-repeat">Repeat</label>
                <select
                  id="mini-repeat"
                  value={composerValues.repeat}
                  onChange={(event) => {
                    const { value } = event.currentTarget;
                    setComposerValues((current) => ({
                      ...current,
                      repeat: value as MiniRepeatMode,
                      weekdays:
                        value === 'selectedDays'
                          ? current.weekdays.length
                            ? current.weekdays
                            : [getWeekdayForDateString(toLocalDateString(new Date()))]
                          : current.weekdays,
                    }));
                  }}
                >
                  <option value="none">One time</option>
                  <option value="daily">Every day</option>
                  <option value="selectedDays">Selected days</option>
                </select>
              </div>

              {composerValues.repeat === 'selectedDays' ? (
                <div className="weekday-grid">
                  {WEEKDAY_ORDER.map((weekday) => {
                    const isActive = composerValues.weekdays.includes(weekday);

                    return (
                      <button
                        key={weekday}
                        className={`weekday-chip ${isActive ? 'is-active' : ''}`}
                        type="button"
                        onClick={() =>
                          setComposerValues((current) => {
                            if (isActive && current.weekdays.length === 1) {
                              return current;
                            }

                            return {
                              ...current,
                              weekdays: isActive
                                ? current.weekdays.filter((value) => value !== weekday)
                                : [...current.weekdays, weekday],
                            };
                          })
                        }
                      >
                        {WEEKDAY_LABELS[weekday]}
                      </button>
                    );
                  })}
                </div>
              ) : null}

              <div className="field">
                <label htmlFor="mini-priority">Priority</label>
                <select
                  id="mini-priority"
                  value={composerValues.priority}
                  onChange={(event) => {
                    const { value } = event.currentTarget;
                    setComposerValues((current) => ({
                      ...current,
                      priority: value as TaskPriority,
                    }));
                  }}
                >
                  {TASK_PRIORITY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <div className="field-hint">
                  {
                    TASK_PRIORITY_OPTIONS.find(
                      (option) => option.value === composerValues.priority,
                    )?.description
                  }
                </div>
              </div>

              {composerValues.repeat === 'none' ? (
                <div className="schedule-grid">
                  <ScheduleCard
                    title="Reminder"
                    dateInputId="mini-reminder-date"
                    timeInputId="mini-reminder-time"
                    dateValue={composerValues.reminderDate}
                    timeValue={composerValues.reminderTime}
                    datePresets={getDatePresetChoices()}
                    timePresets={REMINDER_TIME_PRESETS}
                    onDateChange={(value) =>
                      setComposerValues((current) => ({
                        ...current,
                        reminderDate: value,
                      }))
                    }
                    onTimeChange={(value) =>
                      setComposerValues((current) => ({
                        ...current,
                        reminderTime: value,
                      }))
                    }
                    onClear={() =>
                      setComposerValues((current) => ({
                        ...current,
                        reminderDate: '',
                        reminderTime: '',
                      }))
                    }
                  />

                  <ScheduleCard
                    title="Due"
                    dateInputId="mini-due-date"
                    timeInputId="mini-due-time"
                    dateValue={composerValues.dueDate}
                    timeValue={composerValues.dueTime}
                    datePresets={getDatePresetChoices()}
                    timePresets={DUE_TIME_PRESETS}
                    onDateChange={(value) =>
                      setComposerValues((current) => ({
                        ...current,
                        dueDate: value,
                      }))
                    }
                    onTimeChange={(value) =>
                      setComposerValues((current) => ({
                        ...current,
                        dueTime: value,
                      }))
                    }
                    onClear={() =>
                      setComposerValues((current) => ({
                        ...current,
                        dueDate: '',
                        dueTime: '',
                      }))
                    }
                  />
                </div>
              ) : (
                <div className="schedule-grid">
                  <ScheduleCard
                    title="Reminder"
                    timeInputId="mini-routine-reminder"
                    timeValue={composerValues.reminderTime}
                    showDate={false}
                    timeLabel="Reminder time"
                    timePresets={REMINDER_TIME_PRESETS}
                    onTimeChange={(value) =>
                      setComposerValues((current) => ({
                        ...current,
                        reminderTime: value,
                      }))
                    }
                    onClear={() =>
                      setComposerValues((current) => ({
                        ...current,
                        reminderTime: '',
                      }))
                    }
                  />

                  <ScheduleCard
                    title="Due"
                    timeInputId="mini-routine-due"
                    timeValue={composerValues.dueTime}
                    showDate={false}
                    timeLabel="Due time"
                    timePresets={DUE_TIME_PRESETS}
                    onTimeChange={(value) =>
                      setComposerValues((current) => ({
                        ...current,
                        dueTime: value,
                      }))
                    }
                    onClear={() =>
                      setComposerValues((current) => ({
                        ...current,
                        dueTime: '',
                      }))
                    }
                  />
                </div>
              )}
            </div>
          ) : null}
        </form>

        <div className="mini-section">
          <div className="mini-section-head">
            <div className="mini-section-title">
              <h2>Active tasks</h2>
            </div>
            <span className="status-chip accent">{activeItems.length}</span>
          </div>

          {isLoading ? (
            <p className="empty-state">Loading active tasks...</p>
          ) : activeItems.length === 0 ? (
            <p className="empty-state">Nothing active right now.</p>
          ) : (
            <div className="mini-list">
              {activeItems.map((item) => (
                <div key={item.key} className="mini-item">
                  <button
                    className="mini-check"
                    type="button"
                    aria-label={`Complete ${item.title}`}
                    onClick={() => {
                      void item.onToggle();
                    }}
                  />
                  <div className="mini-copy">
                    <span className="mini-title">{item.title}</span>
                    <span className="mini-meta">{item.meta}</span>
                  </div>
                  <button
                    className="mini-delete"
                    type="button"
                    aria-label={`Delete ${item.title}`}
                    onClick={() => {
                      void item.onDelete();
                    }}
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mini-section">
          <div className="mini-section-head">
            <h2>Completed tasks</h2>
            <span className="status-chip success">{completedItems.length}</span>
          </div>

          {completedItems.length === 0 ? (
            <p className="empty-state">Completed items from today show up here with a strikethrough.</p>
          ) : (
            <div className="mini-list">
              {completedItems.map((item) => (
                <div key={item.key} className="mini-item is-completed">
                  <button
                    className="mini-check is-complete"
                    type="button"
                    aria-label={`Reopen ${item.title}`}
                    onClick={() => {
                      void item.onToggle();
                    }}
                  >
                    Y
                  </button>
                  <div className="mini-copy">
                    <span className="mini-title is-complete">{item.title}</span>
                    <span className="mini-meta">{item.meta}</span>
                  </div>
                  <button
                    className="mini-delete"
                    type="button"
                    aria-label={`Delete ${item.title}`}
                    onClick={() => {
                      void item.onDelete();
                    }}
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <footer className="mini-footer">
          <div className="mini-footer-copy">
            Open with <strong>{MINI_SHORTCUT_LABEL}</strong>
          </div>
          <div className="mini-footer-copy">Press Enter to add fast.</div>
        </footer>
      </section>
    </main>
  );
}

function ReminderPopupScreen() {
  const payload = getReminderPopupPayload();
  const [resolvedSubject, setResolvedSubject] = useState<string>(() => payload?.title ?? '');
  const [resolvedSender, setResolvedSender] = useState<string>(() => payload?.contextValue ?? '');
  const presentation = payload?.presentation ?? 'standard';
  const reminderType =
    payload?.contextLabel ?? (payload?.selection ? 'Task Reminder' : 'General Reminder');
  const messageContent =
    payload?.body ?? 'The reminder popup opened, but the message did not load correctly.';
  const queuedCount = payload?.queuedCount ?? 0;

  useEffect(() => {
    document.title = presentation === 'mega' ? 'Emergency Popup' : 'Reminder';
    void window.todoApp.app.info().then((info) => {
      document.body.dataset.appVariant = info.variant;
    });
  }, [presentation]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        void window.todoApp.app.closeCurrentWindow('dismiss');
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  useEffect(() => {
    setResolvedSubject(payload?.title ?? '');
    setResolvedSender(payload?.contextValue ?? '');

    if (
      !payload?.selection ||
      payload.title.trim() ||
      payload.selection.kind === 'view'
    ) {
      return;
    }

    let isActive = true;

    const resolveSelectionSubject = async () => {
      try {
        if (payload.selection.kind === 'task') {
          const tasks = await window.todoApp.tasks.list();
          const taskTitle =
            tasks.find((task) => task.id === payload.selection?.id)?.title?.trim() ?? '';

          if (isActive && taskTitle) {
            setResolvedSubject(taskTitle);
          }

          return;
        }

        const routines = await window.todoApp.routines.list();
        const routineTitle =
          routines.find((item) => item.template.id === payload.selection?.id)?.template.title?.trim() ??
          '';

        if (isActive && routineTitle) {
          setResolvedSubject(routineTitle);
        }
      } catch (_error) {
        // Keep the popup usable even if subject lookup fails.
      }
    };

    void resolveSelectionSubject();

    return () => {
      isActive = false;
    };
  }, [payload]);

  const openButtonLabel = payload?.selection
    ? payload.selection.kind === 'routine'
      ? 'Open routine'
      : payload.selection.kind === 'view'
      ? 'Open queue'
      : 'Open task'
    : 'Open app';

  const handleDismiss = async () => {
    await window.todoApp.app.closeCurrentWindow('dismiss');
  };

  const handleOpen = async () => {
    if (payload?.selection) {
      await window.todoApp.app.showSelection(payload.selection);
    } else {
      await window.todoApp.app.show();
    }

    await window.todoApp.app.closeCurrentWindow('open');
  };

  if (presentation === 'mega') {
    return (
      <main className="reminder-popup-shell mega">
        <section className="reminder-popup mega">
          <div className="reminder-popup-copy mega">
            <p className="section-kicker">{reminderType}</p>
            <h1 className={`reminder-popup-subject mega${resolvedSubject ? '' : ' is-empty'}`}>
              {resolvedSubject || 'Emergency Popup'}
            </h1>
            <p className="reminder-popup-field-label">Sender:</p>
            <p className={`reminder-popup-field-value mega${resolvedSender ? '' : ' is-empty'}`}>
              {resolvedSender || '\u00A0'}
            </p>
            <p className="reminder-popup-field-label">Message:</p>
            <p className="reminder-popup-body mega">{messageContent}</p>
          </div>

          <div className="reminder-popup-actions mega">
            <button className="soft-button primary" type="button" onClick={() => void handleOpen()}>
              {openButtonLabel}
            </button>
            <button className="soft-button" type="button" onClick={() => void handleDismiss()}>
              Acknowledge
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="reminder-popup-shell">
      <section className="reminder-popup">
        <div className="reminder-popup-copy">
          <div className="reminder-popup-topline">
            <p className="section-kicker">{reminderType}</p>
            {queuedCount > 0 ? (
              <span className="reminder-popup-queued">{queuedCount} queued</span>
            ) : null}
          </div>
          <h1 className={`reminder-popup-subject${resolvedSubject ? '' : ' is-empty'}`}>
            {resolvedSubject || '\u00A0'}
          </h1>
          <p className="reminder-popup-field-label">Sender:</p>
          <p className={`reminder-popup-field-value${resolvedSender ? '' : ' is-empty'}`}>
            {resolvedSender || '\u00A0'}
          </p>
          <p className="reminder-popup-field-label">Message:</p>
          <p className="reminder-popup-body">{messageContent}</p>
        </div>

        <div className="reminder-popup-actions">
          <button className="soft-button primary" type="button" onClick={() => void handleOpen()}>
            {openButtonLabel}
          </button>
          <button className="soft-button" type="button" onClick={() => void handleDismiss()}>
            Dismiss
          </button>
        </div>
      </section>
    </main>
  );
}

export default function App() {
  const hashRoute = getHashRoute();
  const [themeSettings, setThemeSettings] = useState<AppThemeSettings>(loadThemeSettings);

  useEffect(() => {
    applyThemeSettings(themeSettings);
    saveThemeSettings(themeSettings);
  }, [themeSettings]);

  useEffect(() => {
    const refreshTheme = () => {
      setThemeSettings(loadThemeSettings());
    };

    window.addEventListener('focus', refreshTheme);
    window.addEventListener('storage', refreshTheme);

    return () => {
      window.removeEventListener('focus', refreshTheme);
      window.removeEventListener('storage', refreshTheme);
    };
  }, []);

  return (
    <AppErrorBoundary>
      {hashRoute === 'quick-add' ? (
        <MiniWindowScreen />
      ) : hashRoute === 'reminder-popup' ? (
        <ReminderPopupScreen />
      ) : (
        <MainScreen themeSettings={themeSettings} onThemeChange={setThemeSettings} />
      )}
    </AppErrorBoundary>
  );
}
