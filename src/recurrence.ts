import type { RoutineRule, RoutineWeekday } from './types';

export const WEEKDAY_ORDER: RoutineWeekday[] = [
  'sun',
  'mon',
  'tue',
  'wed',
  'thu',
  'fri',
  'sat',
];

export const WEEKDAY_LABELS: Record<RoutineWeekday, string> = {
  sun: 'Sun',
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
};

const pad = (value: number): string => String(value).padStart(2, '0');

const assertLocalDate = (value: string): void => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    throw new Error('Please use a valid date.');
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    throw new Error('Please use a valid date.');
  }
};

export const assertLocalTime = (value: string): void => {
  if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(value)) {
    throw new Error('Please use a valid time.');
  }
};

export const isValidLocalDateString = (value: string): boolean => {
  try {
    assertLocalDate(value);
    return true;
  } catch {
    return false;
  }
};

export const isValidLocalTimeString = (value: string): boolean => {
  try {
    assertLocalTime(value);
    return true;
  } catch {
    return false;
  }
};

export const createLocalDate = (value: string): Date => {
  assertLocalDate(value);
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
};

export const createLocalDateTime = (dateValue: string, timeValue: string): Date => {
  assertLocalDate(dateValue);
  assertLocalTime(timeValue);
  const [year, month, day] = dateValue.split('-').map(Number);
  const [hours, minutes] = timeValue.split(':').map(Number);
  return new Date(year, month - 1, day, hours, minutes, 0, 0);
};

export const toLocalDateString = (value: Date): string =>
  `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;

export const toMonthKey = (value: Date): string =>
  `${value.getFullYear()}-${pad(value.getMonth() + 1)}`;

export const compareLocalDateStrings = (left: string, right: string): number =>
  left.localeCompare(right);

export const addDaysToDateString = (value: string, days: number): string => {
  const date = createLocalDate(value);
  date.setDate(date.getDate() + days);
  return toLocalDateString(date);
};

export const addMonthsToDateString = (value: string, months: number): string => {
  const date = createLocalDate(value);
  const currentDay = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + months);
  const lastDayOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(currentDay, lastDayOfMonth));
  return toLocalDateString(date);
};

export const getWeekdayForDateString = (value: string): RoutineWeekday =>
  WEEKDAY_ORDER[createLocalDate(value).getDay()];

export const getWeekStart = (value: string): string => {
  const date = createLocalDate(value);
  date.setDate(date.getDate() - date.getDay());
  return toLocalDateString(date);
};

export const normalizeWeekdays = (
  weekdays: RoutineWeekday[] | undefined,
): RoutineWeekday[] => {
  if (!weekdays) {
    return [];
  }

  const set = new Set<RoutineWeekday>(weekdays);
  return WEEKDAY_ORDER.filter((weekday) => set.has(weekday));
};

export const getDueAtForScheduledDate = (
  rule: Pick<RoutineRule, 'dueTime'>,
  scheduledDate: string,
): string => {
  if (rule.dueTime) {
    return createLocalDateTime(scheduledDate, rule.dueTime).toISOString();
  }

  return createLocalDateTime(addDaysToDateString(scheduledDate, 1), '00:00').toISOString();
};

export const getReminderAtForScheduledDate = (
  rule: Pick<RoutineRule, 'reminderTime'>,
  scheduledDate: string,
): string | undefined => {
  if (!rule.reminderTime) {
    return undefined;
  }

  return createLocalDateTime(scheduledDate, rule.reminderTime).toISOString();
};

const getMonthlyScheduledDate = (startDate: string, monthOffset: number): string => {
  const start = createLocalDate(startDate);
  const year = start.getFullYear();
  const month = start.getMonth();
  const target = new Date(year, month + monthOffset, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  const targetDay = Math.min(start.getDate(), lastDay);

  return `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(targetDay)}`;
};

const listDailyDates = (rule: RoutineRule, endDate: string): string[] => {
  const dates: string[] = [];
  let cursor = rule.startDate;

  while (compareLocalDateStrings(cursor, endDate) <= 0) {
    dates.push(cursor);
    cursor = addDaysToDateString(cursor, rule.interval);
  }

  return dates;
};

const listWeeklyDates = (rule: RoutineRule, endDate: string): string[] => {
  const weekdays = normalizeWeekdays(rule.weekdays);

  if (!weekdays.length) {
    return [];
  }

  const dates: string[] = [];
  let cursorWeek = getWeekStart(rule.startDate);

  while (compareLocalDateStrings(cursorWeek, endDate) <= 0) {
    WEEKDAY_ORDER.forEach((weekday, index) => {
      if (!weekdays.includes(weekday)) {
        return;
      }

      const scheduledDate = addDaysToDateString(cursorWeek, index);

      if (
        compareLocalDateStrings(scheduledDate, rule.startDate) >= 0 &&
        compareLocalDateStrings(scheduledDate, endDate) <= 0
      ) {
        dates.push(scheduledDate);
      }
    });

    cursorWeek = addDaysToDateString(cursorWeek, rule.interval * 7);
  }

  return dates.sort(compareLocalDateStrings);
};

const listMonthlyDates = (rule: RoutineRule, endDate: string): string[] => {
  const dates: string[] = [];
  const maxMonths = 2400;

  for (let monthOffset = 0; monthOffset <= maxMonths; monthOffset += rule.interval) {
    const scheduledDate = getMonthlyScheduledDate(rule.startDate, monthOffset);

    if (compareLocalDateStrings(scheduledDate, endDate) > 0) {
      break;
    }

    if (compareLocalDateStrings(scheduledDate, rule.startDate) >= 0) {
      dates.push(scheduledDate);
    }
  }

  return dates;
};

export const listScheduledDatesUntil = (
  rule: RoutineRule,
  endDateInclusive: string,
): string[] => {
  const effectiveEndDate =
    rule.endDate && compareLocalDateStrings(rule.endDate, endDateInclusive) < 0
      ? rule.endDate
      : endDateInclusive;

  if (compareLocalDateStrings(rule.startDate, effectiveEndDate) > 0) {
    return [];
  }

  switch (rule.unit) {
    case 'day':
      return listDailyDates(rule, effectiveEndDate);
    case 'week':
      return listWeeklyDates(rule, effectiveEndDate);
    case 'month':
      return listMonthlyDates(rule, effectiveEndDate);
    default:
      return [];
  }
};

const getSearchEndDate = (rule: RoutineRule, referenceDate: Date): string => {
  const today = toLocalDateString(referenceDate);

  switch (rule.unit) {
    case 'day':
      return addDaysToDateString(today, Math.max(14, rule.interval + 2));
    case 'week':
      return addDaysToDateString(today, Math.max(28, rule.interval * 7 + 14));
    case 'month':
      return addMonthsToDateString(today, Math.max(12, rule.interval + 2));
    default:
      return today;
  }
};

export const getUpcomingScheduledDate = (
  rule: RoutineRule,
  referenceDate: Date,
): string | undefined => {
  const searchEndDate = rule.endDate ?? getSearchEndDate(rule, referenceDate);
  const schedule = listScheduledDatesUntil(rule, searchEndDate);
  const referenceMs = referenceDate.getTime();

  return schedule.find(
    (scheduledDate) =>
      new Date(getDueAtForScheduledDate(rule, scheduledDate)).getTime() >= referenceMs,
  );
};

export const validateRoutineRule = (rule: RoutineRule): void => {
  if (!Number.isInteger(rule.interval) || rule.interval <= 0) {
    throw new Error('Repeat interval must be a whole number greater than 0.');
  }

  assertLocalDate(rule.startDate);

  if (rule.endDate) {
    assertLocalDate(rule.endDate);

    if (compareLocalDateStrings(rule.endDate, rule.startDate) < 0) {
      throw new Error('End date must be the same as or after the start date.');
    }
  }

  if (rule.dueTime) {
    assertLocalTime(rule.dueTime);
  }

  if (rule.reminderTime) {
    assertLocalTime(rule.reminderTime);
  }

  if (rule.unit === 'week') {
    const weekdays = normalizeWeekdays(rule.weekdays);

    if (!weekdays.length) {
      throw new Error('Choose at least one weekday for weekly routines.');
    }
  }

  if (rule.dueTime && rule.reminderTime && rule.reminderTime > rule.dueTime) {
    throw new Error('Reminder time must be earlier than or equal to the due time.');
  }
};

const formatOrdinal = (value: number): string => {
  const mod100 = value % 100;

  if (mod100 >= 11 && mod100 <= 13) {
    return `${value}th`;
  }

  switch (value % 10) {
    case 1:
      return `${value}st`;
    case 2:
      return `${value}nd`;
    case 3:
      return `${value}rd`;
    default:
      return `${value}th`;
  }
};

export const formatRoutineRule = (rule: RoutineRule): string => {
  if (rule.unit === 'day') {
    return rule.interval === 1 ? 'Every day' : `Every ${rule.interval} days`;
  }

  if (rule.unit === 'week') {
    const weekdays = normalizeWeekdays(rule.weekdays).map((weekday) => WEEKDAY_LABELS[weekday]);
    const prefix = rule.interval === 1 ? 'Every week' : `Every ${rule.interval} weeks`;
    return weekdays.length ? `${prefix} on ${weekdays.join(', ')}` : prefix;
  }

  const dayOfMonth = createLocalDate(rule.startDate).getDate();
  const prefix = rule.interval === 1 ? 'Every month' : `Every ${rule.interval} months`;
  return `${prefix} on the ${formatOrdinal(dayOfMonth)}`;
};

export const formatMonthLabel = (monthKey: string): string => {
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(year, month - 1, 1, 12, 0, 0, 0);

  return date.toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
};
