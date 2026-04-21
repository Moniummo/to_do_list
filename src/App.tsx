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
  AppSelection,
  HistoryDayPayload,
  OccurrenceStatus,
  RoutineDraft,
  RoutineHistoryPayload,
  RoutineHistorySummary,
  RoutineListItem,
  RoutineOccurrenceHistoryUpdate,
  RoutineTemplate,
  RoutineUnit,
  RoutineUpdate,
  RoutineWeekday,
  Task,
  TaskCompletionDateUpdate,
  TaskDraft,
  TaskPriority,
  TaskUpdate,
} from './types';

type OneOffFormValues = {
  title: string;
  dueDate: string;
  dueTime: string;
  reminderDate: string;
  reminderTime: string;
  notes: string;
  priority: TaskPriority;
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

type MainView = 'today' | 'week' | 'routines' | 'history';

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
const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
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

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Something went wrong. Please try again.';

const createEmptyTaskForm = (): OneOffFormValues => ({
  title: '',
  dueDate: '',
  dueTime: '',
  reminderDate: '',
  reminderTime: '',
  notes: '',
  priority: 'auto',
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
  };
};

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

const isTaskForToday = (task: Task): boolean => {
  if (task.status !== 'pending') {
    return false;
  }

  const today = toLocalDateString(new Date());
  const anchorDate = task.dueAt ? toLocalDateString(new Date(task.dueAt)) : today;
  return compareLocalDateStrings(anchorDate, today) <= 0;
};

const isRoutineForToday = (item: RoutineListItem): boolean => {
  const currentOccurrence = item.currentOccurrence;

  if (!currentOccurrence || currentOccurrence.status !== 'pending') {
    return false;
  }

  return compareLocalDateStrings(
    currentOccurrence.scheduledDate,
    toLocalDateString(new Date()),
  ) <= 0;
};

const isTaskForLater = (task: Task): boolean => {
  if (task.status !== 'pending' || !task.dueAt) {
    return false;
  }

  return compareLocalDateStrings(
    toLocalDateString(new Date(task.dueAt)),
    toLocalDateString(new Date()),
  ) > 0;
};

const isRoutineForLater = (item: RoutineListItem): boolean => {
  const currentOccurrence = item.currentOccurrence;

  if (!currentOccurrence || currentOccurrence.status !== 'pending') {
    return false;
  }

  return compareLocalDateStrings(
    currentOccurrence.scheduledDate,
    toLocalDateString(new Date()),
  ) > 0;
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

            return (nextSelection.kind === 'task' ||
              nextSelection.kind === 'routine') &&
              typeof nextSelection.id === 'string'
              ? (nextSelection as AppSelection)
              : undefined;
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

function MainScreen() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [routines, setRoutines] = useState<RoutineListItem[]>([]);
  const [historyPayload, setHistoryPayload] = useState<RoutineHistoryPayload | null>(null);
  const [historySummary, setHistorySummary] = useState<RoutineHistorySummary | null>(null);
  const [taskFormValues, setTaskFormValues] = useState<OneOffFormValues>(createEmptyTaskForm());
  const [routineFormValues, setRoutineFormValues] = useState<RoutineFormValues>(
    createEmptyRoutineForm(),
  );
  const [activeView, setActiveView] = useState<MainView>('today');
  const [editingRoutineId, setEditingRoutineId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedRoutineId, setSelectedRoutineId] = useState<string | null>(null);
  const [historyRoutineId, setHistoryRoutineId] = useState<string | null>(null);
  const [historyMonthKey, setHistoryMonthKey] = useState<string>(toMonthKey(new Date()));
  const [selectedHistoryDate, setSelectedHistoryDate] = useState<string | null>(null);
  const [historyDayPayload, setHistoryDayPayload] = useState<HistoryDayPayload | null>(null);
  const [showCompletedTasks, setShowCompletedTasks] = useState(false);
  const [taskDetailsOpen, setTaskDetailsOpen] = useState(false);
  const [routineDetailsOpen, setRoutineDetailsOpen] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [isHistoryDayLoading, setIsHistoryDayLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyDayError, setHistoryDayError] = useState<string | null>(null);

  const historyRoutineIdRef = useRef<string | null>(null);
  const routineEditorRef = useRef<HTMLElement | null>(null);
  const routineTitleInputRef = useRef<HTMLInputElement | null>(null);

  const syncDashboard = async (): Promise<RoutineListItem[]> => {
    const [nextTasks, nextRoutines] = await Promise.all([
      window.todoApp.tasks.list(),
      window.todoApp.routines.list(),
    ]);

    setTasks(nextTasks);
    setRoutines(nextRoutines);

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

    const load = async (markLoaded = false) => {
      try {
        await refreshAll();

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

    const removeTaskListener = window.todoApp.tasks.onChanged(handleDataChange);
    const removeRoutineListener = window.todoApp.routines.onChanged(handleDataChange);
    const removeSelectionListener = window.todoApp.app.onSelection(
      (selection: AppSelection) => {
        if (selection.kind === 'task') {
          setSelectedTaskId(selection.id);
          setActiveView('today');
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
      removeTaskListener();
      removeRoutineListener();
      removeSelectionListener();
      window.removeEventListener('focus', handleDataChange);
    };
  }, []);

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

  const handleEditRoutine = (template: RoutineTemplate) => {
    setActiveView('routines');
    setEditingRoutineId(template.id);
    setRoutineFormValues(createRoutineFormValues(template));
    setSelectedRoutineId(template.id);
    setRoutineDetailsOpen(true);
  };

  const todayLabel = fullDateFormatter.format(new Date());
  const selectedHistoryTitle =
    routines.find((item) => item.template.id === historyRoutineId)?.template.title ?? 'Routine';

  const headerTitle =
    activeView === 'today'
      ? todayLabel
      : activeView === 'week'
      ? 'Next 7 days'
      : activeView === 'routines'
      ? 'Repeating work'
      : 'History and streaks';

  const headerCopy =
    activeView === 'today'
      ? 'See what is still open and decide whether it is due soon or just stays on the list until you finish it.'
      : activeView === 'week'
      ? 'Plan ahead so deadlines and repeating work do not sneak up on you.'
      : activeView === 'routines'
      ? 'Set up tasks that automatically reset themselves when the next cycle arrives.'
      : 'Look back at passive task completions and routine streaks in one place.';

  const handlePreviewReminder = async () => {
    setError(null);

    try {
      await window.todoApp.app.previewReminderPopup();
    } catch (previewError) {
      const previewMessage = getErrorMessage(previewError);

      if (previewMessage.includes("No handler registered for 'app:previewReminderPopup'")) {
        setError(
          'Preview popup needs one full app restart because it is created by Electron main process code. Close and reopen the app, then try Preview reminder again.',
        );
        return;
      }

      setError(previewMessage);
    }
  };

  return (
    <main className="app-shell">
      <div className="desktop-frame">
        <aside className="sidebar">
          <div className="sidebar-brand">
            <p className="section-kicker">To Do List</p>
            <h1>Desktop Planner</h1>
            <p className="section-copy">
              Use the mini window for quick capture, then open the full app when you want a broader view.
            </p>
          </div>

          <div className="sidebar-nav">
            <button
              className={`sidebar-link ${activeView === 'today' ? 'is-active' : ''}`}
              type="button"
              onClick={() => setActiveView('today')}
            >
              Today
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

          <button
            className="soft-button primary sidebar-launch"
            type="button"
            onClick={() => {
              void window.todoApp.quickAdd.open();
            }}
          >
            Open mini window
          </button>

          <p className="sidebar-note">
            Shortcut: <strong>{MINI_SHORTCUT_LABEL}</strong>
          </p>
        </aside>

        <section className="main-pane">
          <header className="main-header">
            <div>
              <p className="section-kicker">
                {activeView === 'today'
                  ? 'Today'
                  : activeView === 'week'
                  ? 'Week'
                  : activeView === 'routines'
                  ? 'Routines'
                  : 'History'}
              </p>
              <h2>{headerTitle}</h2>
              <p className="section-copy">{headerCopy}</p>
            </div>

            <div className="header-actions">
              <button
                className="soft-button"
                type="button"
                onClick={() => {
                  void handlePreviewReminder();
                }}
              >
                Preview reminder
              </button>
              <button
                className="soft-button primary"
                type="button"
                onClick={() => {
                  void window.todoApp.quickAdd.open();
                }}
              >
                Mini window
              </button>
            </div>
          </header>

          {error ? <div className="banner">{error}</div> : null}

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

                  {editingRoutineId ? (
                    <span className="status-chip accent">Editing routine</span>
                  ) : null}
                </div>

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
  const [showLaterItems, setShowLaterItems] = useState(false);
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

  const todayTasks = tasks.filter(isTaskForToday);
  const todayRoutines = routines.filter(isRoutineForToday);
  const laterTasks = tasks.filter(isTaskForLater);
  const laterRoutines = routines.filter(isRoutineForLater);
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
    ...todayTasks.map((task) => {
      return buildMiniTaskItem(task);
    }),
    ...todayRoutines.map((item) => {
      return buildMiniRoutineItem(item);
    }),
    ...(showLaterItems
      ? [
          ...laterTasks.map((task) => buildMiniTaskItem(task)),
          ...laterRoutines.map((item) => buildMiniRoutineItem(item)),
        ]
      : []),
  ].sort((left, right) => {
    if (left.rank !== right.rank) {
      return left.rank - right.rank;
    }

    if (left.sortDate !== right.sortDate) {
      return left.sortDate.localeCompare(right.sortDate);
    }

    return left.title.localeCompare(right.title);
  });
  const laterItemsCount = laterTasks.length + laterRoutines.length;
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
              {laterItemsCount ? (
                <button
                  className="link-button mini-toggle-link"
                  type="button"
                  onClick={() => setShowLaterItems((current) => !current)}
                >
                  {showLaterItems
                    ? `Hide later (${laterItemsCount})`
                    : `Show later (${laterItemsCount})`}
                </button>
              ) : null}
            </div>
            <span className="status-chip accent">{activeItems.length}</span>
          </div>

          {isLoading ? (
            <p className="empty-state">Loading active tasks...</p>
          ) : activeItems.length === 0 ? (
            <p className="empty-state">
              {laterItemsCount
                ? `Nothing urgent right now. ${laterItemsCount} later item${
                    laterItemsCount === 1 ? '' : 's'
                  } ${showLaterItems ? 'is' : 'are'} ${showLaterItems ? 'already shown above.' : 'hidden for now.'}`
                : 'Nothing active right now.'}
            </p>
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
  const reminderType =
    payload?.contextLabel ?? (payload?.selection ? 'Task Reminder' : 'General Reminder');
  const messageContent =
    payload?.body ?? 'The reminder popup opened, but the message did not load correctly.';

  useEffect(() => {
    document.title = 'Reminder';
  }, []);

  useEffect(() => {
    setResolvedSubject(payload?.title ?? '');
    setResolvedSender(payload?.contextValue ?? '');

    if (!payload?.selection || payload.title.trim()) {
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

  const handleDismiss = async () => {
    await window.todoApp.app.closeCurrentWindow();
  };

  const handleOpen = async () => {
    if (payload?.selection) {
      await window.todoApp.app.showSelection(payload.selection);
    } else {
      await window.todoApp.app.show();
    }

    await window.todoApp.app.closeCurrentWindow();
  };

  return (
    <main className="reminder-popup-shell">
      <section className="reminder-popup">
        <div className="reminder-popup-copy">
          <p className="section-kicker">{reminderType}</p>
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
            {payload?.selection
              ? payload.selection.kind === 'routine'
                ? 'Open routine'
                : 'Open task'
              : 'Open app'}
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

  return (
    <AppErrorBoundary>
      {hashRoute === 'quick-add' ? (
        <MiniWindowScreen />
      ) : hashRoute === 'reminder-popup' ? (
        <ReminderPopupScreen />
      ) : (
        <MainScreen />
      )}
    </AppErrorBoundary>
  );
}
