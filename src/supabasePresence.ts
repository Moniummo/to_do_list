import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const SUPABASE_URL_ENV = 'SUPABASE_URL';
const SUPABASE_PUBLISHABLE_KEY_ENV = 'SUPABASE_PUBLISHABLE_KEY';
const SUPABASE_PRESENCE_TABLE_ENV = 'SUPABASE_PRESENCE_TABLE';
const DEFAULT_SUPABASE_PRESENCE_TABLE = 'app_presence';

type SupabasePresenceServiceOptions = {
  deviceId: string;
  deviceName?: string;
  heartbeatIntervalMs: number;
  onError: (message: string, error?: unknown) => void;
};

export type SupabasePresenceService = {
  isConfigured: boolean;
  missingEnvKeys: string[];
  start: () => Promise<void>;
  heartbeat: () => Promise<void>;
  stop: () => Promise<void>;
};

const getMissingSupabaseEnvKeys = (): string[] =>
  [SUPABASE_URL_ENV, SUPABASE_PUBLISHABLE_KEY_ENV].filter(
    (key) => !process.env[key]?.trim(),
  );

const getPresenceTableName = (): string =>
  process.env[SUPABASE_PRESENCE_TABLE_ENV]?.trim() || DEFAULT_SUPABASE_PRESENCE_TABLE;

export const createSupabasePresenceService = ({
  deviceId,
  deviceName,
  heartbeatIntervalMs,
  onError,
}: SupabasePresenceServiceOptions): SupabasePresenceService => {
  const missingEnvKeys = getMissingSupabaseEnvKeys();

  if (missingEnvKeys.length > 0) {
    return {
      isConfigured: false,
      missingEnvKeys,
      start: async () => undefined,
      heartbeat: async () => undefined,
      stop: async () => undefined,
    };
  }

  const supabase = createClient(
    process.env[SUPABASE_URL_ENV] as string,
    process.env[SUPABASE_PUBLISHABLE_KEY_ENV] as string,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );

  const presenceTable = getPresenceTableName();
  let heartbeatTimer: NodeJS.Timeout | null = null;

  const sendHeartbeat = async (): Promise<void> => {
    const timestamp = new Date().toISOString();
    const row = {
      device_id: deviceId,
      device_name: deviceName ?? null,
      last_seen_at: timestamp,
      updated_at: timestamp,
    };

    const { error } = await supabase.from(presenceTable).upsert([row], {
      onConflict: 'device_id',
    });

    if (error) {
      onError(`Supabase app presence heartbeat could not be recorded for ${deviceId}.`, error);
    }
  };

  return {
    isConfigured: true,
    missingEnvKeys: [],
    start: async () => {
      await sendHeartbeat();

      if (heartbeatTimer) {
        return;
      }

      heartbeatTimer = setInterval(() => {
        void sendHeartbeat();
      }, heartbeatIntervalMs);
    },
    heartbeat: async () => {
      await sendHeartbeat();
    },
    stop: async () => {
      if (!heartbeatTimer) {
        return;
      }

      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    },
  };
};
