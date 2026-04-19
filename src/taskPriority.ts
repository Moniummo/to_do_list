import { compareLocalDateStrings, toLocalDateString } from './recurrence';
import type { RoutineOccurrence, RoutineTemplate, TaskPriority } from './types';

export type TaskPriorityTone = 'accent' | 'danger' | 'muted';

export type TaskPriorityDetails = {
  label: string;
  rank: number;
  tone: TaskPriorityTone;
};

const PRIORITY_LABELS: Record<Exclude<TaskPriority, 'auto'>, TaskPriorityDetails> = {
  high: {
    label: 'High',
    rank: 1,
    tone: 'danger',
  },
  medium: {
    label: 'Medium',
    rank: 4,
    tone: 'accent',
  },
  low: {
    label: 'Low',
    rank: 8,
    tone: 'muted',
  },
};

const toMiddayMs = (value: string): number => new Date(`${value}T12:00:00`).getTime();

const getDayDifference = (leftDate: string, rightDate: string): number =>
  Math.round((toMiddayMs(rightDate) - toMiddayMs(leftDate)) / 86_400_000);

export const normalizeTaskPriority = (value?: TaskPriority | null): TaskPriority => {
  if (!value) {
    return 'auto';
  }

  if (value === 'auto' || value === 'high' || value === 'medium' || value === 'low') {
    return value;
  }

  throw new Error('Please choose a valid priority.');
};

export const getTaskPriorityDetails = (
  task: Pick<{ dueAt?: string; priority?: TaskPriority }, 'dueAt' | 'priority'>,
  referenceDate: Date = new Date(),
): TaskPriorityDetails => {
  const priority = normalizeTaskPriority(task.priority);

  if (priority !== 'auto') {
    return PRIORITY_LABELS[priority];
  }

  if (!task.dueAt) {
    return {
      label: 'Passive',
      rank: 7,
      tone: 'muted',
    };
  }

  const dueDate = toLocalDateString(new Date(task.dueAt));
  const today = toLocalDateString(referenceDate);
  const dayDifference = getDayDifference(today, dueDate);

  if (compareLocalDateStrings(dueDate, today) < 0) {
    return {
      label: 'Overdue',
      rank: 0,
      tone: 'danger',
    };
  }

  if (dayDifference === 0) {
    return {
      label: 'Today',
      rank: 1,
      tone: 'danger',
    };
  }

  if (dayDifference === 1) {
    return {
      label: 'Tomorrow',
      rank: 2,
      tone: 'accent',
    };
  }

  if (dayDifference <= 7) {
    return {
      label: `${dayDifference} days`,
      rank: dayDifference + 1,
      tone: 'muted',
    };
  }

  return {
    label: 'Later',
    rank: 10,
    tone: 'muted',
  };
};

export const getRoutinePriorityDetails = (
  routine: Pick<RoutineTemplate, 'priority'> & {
    currentOccurrence?: Pick<RoutineOccurrence, 'dueAt' | 'scheduledDate' | 'status'>;
  },
  referenceDate: Date = new Date(),
): TaskPriorityDetails => {
  const priority = normalizeTaskPriority(routine.priority);
  const currentOccurrence = routine.currentOccurrence;

  if (priority !== 'auto') {
    return PRIORITY_LABELS[priority];
  }

  if (!currentOccurrence) {
    return {
      label: 'Ended',
      rank: 10,
      tone: 'muted',
    };
  }

  return getTaskPriorityDetails(
    {
      priority,
      dueAt: currentOccurrence.dueAt,
    },
    referenceDate,
  );
};
