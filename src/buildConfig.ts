declare const TODO_BUILD_SUPABASE_URL: string;
declare const TODO_BUILD_SUPABASE_PUBLISHABLE_KEY: string;
declare const TODO_BUILD_EMERGENCY_POPUP_PASSWORDS: string;
declare const TODO_BUILD_APP_VARIANT: string;

const normalizeOptionalBuildValue = (value: string): string | undefined => {
  const trimmedValue = value.trim();
  return trimmedValue ? trimmedValue : undefined;
};

export const SUPABASE_URL_ENV = 'SUPABASE_URL';
export const SUPABASE_PUBLISHABLE_KEY_ENV = 'SUPABASE_PUBLISHABLE_KEY';

export const getSupabaseUrl = (): string | undefined =>
  process.env[SUPABASE_URL_ENV]?.trim() ||
  normalizeOptionalBuildValue(TODO_BUILD_SUPABASE_URL);

export const getSupabasePublishableKey = (): string | undefined =>
  process.env[SUPABASE_PUBLISHABLE_KEY_ENV]?.trim() ||
  normalizeOptionalBuildValue(TODO_BUILD_SUPABASE_PUBLISHABLE_KEY);

export const getMissingSupabaseConfigKeys = (): string[] =>
  [
    [SUPABASE_URL_ENV, getSupabaseUrl()],
    [SUPABASE_PUBLISHABLE_KEY_ENV, getSupabasePublishableKey()],
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key);

export const getBuildEmergencyPopupPasswords = (): string | undefined =>
  normalizeOptionalBuildValue(TODO_BUILD_EMERGENCY_POPUP_PASSWORDS);

export const getBuildAppVariant = (): string | undefined =>
  normalizeOptionalBuildValue(TODO_BUILD_APP_VARIANT);
