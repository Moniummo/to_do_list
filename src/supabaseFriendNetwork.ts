import { randomUUID } from 'node:crypto';
import dotenv from 'dotenv';
import { createClient, type RealtimeChannel } from '@supabase/supabase-js';
import type {
  AppPopupDraft,
  AppPopupEvent,
  AppPopupEventKind,
  AppPopupEventPriority,
  AppPopupEventStatus,
  FriendCodeAlias,
} from './types';

dotenv.config();

const SUPABASE_URL_ENV = 'SUPABASE_URL';
const SUPABASE_PUBLISHABLE_KEY_ENV = 'SUPABASE_PUBLISHABLE_KEY';
const SUPABASE_APP_DEVICES_TABLE_ENV = 'SUPABASE_APP_DEVICES_TABLE';
const SUPABASE_FRIEND_CODES_TABLE_ENV = 'SUPABASE_FRIEND_CODES_TABLE';
const SUPABASE_APP_POPUP_EVENTS_TABLE_ENV = 'SUPABASE_APP_POPUP_EVENTS_TABLE';
const DEFAULT_SUPABASE_APP_DEVICES_TABLE = 'app_devices';
const DEFAULT_SUPABASE_FRIEND_CODES_TABLE = 'friend_codes';
const DEFAULT_SUPABASE_APP_POPUP_EVENTS_TABLE = 'app_popup_events';
const REGISTER_FRIEND_CODE_RPC = 'register_friend_code';
const PENDING_EVENT_BATCH_SIZE = 100;
const RECENT_EVENT_LIMIT = 200;

type SupabaseFriendCodeRow = {
  id: string;
  code: string;
  code_normalized: string;
  device_key: string;
  created_at: string;
  retired_at: string | null;
};

type SupabaseAppPopupEventRow = {
  id: string;
  recipient_device_key: string;
  sender_device_key: string | null;
  sender_name: string | null;
  sender_friend_code: string | null;
  source: string;
  kind: AppPopupEventKind;
  priority: AppPopupEventPriority;
  title: string | null;
  message: string;
  related_task_id: string | null;
  related_task_title: string | null;
  payload: Record<string, unknown> | null;
  status: AppPopupEventStatus;
  created_at: string;
  delivered_at: string | null;
  reviewed_at: string | null;
};

type SupabaseFriendNetworkServiceOptions = {
  deviceKey: string;
  deviceName?: string;
  onPopupEvent: (event: AppPopupEvent) => boolean | void;
  onChanged: () => void;
  onError: (message: string, error?: unknown) => void;
};

export type SupabaseFriendNetworkService = {
  isConfigured: boolean;
  missingEnvKeys: string[];
  deviceKey: string;
  deviceName?: string;
  start: () => Promise<void>;
  refresh: () => Promise<void>;
  stop: () => Promise<void>;
  registerDevice: () => Promise<void>;
  setFriendCode: (code: string) => Promise<FriendCodeAlias>;
  listFriendCodes: () => Promise<FriendCodeAlias[]>;
  listPendingEvents: () => Promise<AppPopupEvent[]>;
  listRecentEvents: () => Promise<AppPopupEvent[]>;
  sendPopup: (input: AppPopupDraft) => Promise<void>;
  markDelivered: (eventId: string) => Promise<void>;
  updateStatus: (eventId: string, status: AppPopupEventStatus) => Promise<void>;
};

const getMissingSupabaseEnvKeys = (): string[] =>
  [SUPABASE_URL_ENV, SUPABASE_PUBLISHABLE_KEY_ENV].filter(
    (key) => !process.env[key]?.trim(),
  );

const getTableName = (envKey: string, defaultName: string): string =>
  process.env[envKey]?.trim() || defaultName;

const normalizeOptionalText = (value?: string | null): string | undefined => {
  const trimmedValue = value?.trim();
  return trimmedValue ? trimmedValue : undefined;
};

const normalizeFriendCode = (value: string): string => value.trim().toLowerCase();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const mapFriendCodeRow = (row: SupabaseFriendCodeRow): FriendCodeAlias => ({
  id: row.id,
  code: row.code,
  normalizedCode: row.code_normalized,
  deviceKey: row.device_key,
  createdAt: row.created_at,
  retiredAt: normalizeOptionalText(row.retired_at),
});

const mapPopupEventRow = (row: SupabaseAppPopupEventRow): AppPopupEvent => ({
  id: row.id,
  recipientDeviceKey: row.recipient_device_key,
  senderDeviceKey: normalizeOptionalText(row.sender_device_key),
  senderName: normalizeOptionalText(row.sender_name),
  senderFriendCode: normalizeOptionalText(row.sender_friend_code),
  source: row.source,
  kind: row.kind,
  priority: row.priority,
  title: normalizeOptionalText(row.title),
  message: row.message,
  relatedTaskId: normalizeOptionalText(row.related_task_id),
  relatedTaskTitle: normalizeOptionalText(row.related_task_title),
  payload: isRecord(row.payload) ? row.payload : {},
  status: row.status,
  createdAt: row.created_at,
  deliveredAt: normalizeOptionalText(row.delivered_at),
  reviewedAt: normalizeOptionalText(row.reviewed_at),
});

const buildEventRow = (
  input: AppPopupDraft,
  recipientDeviceKey: string,
  senderDeviceKey: string,
  senderFriendCode?: string,
): Record<string, unknown> => ({
  id: randomUUID(),
  recipient_device_key: recipientDeviceKey,
  sender_device_key: senderDeviceKey,
  sender_name: normalizeOptionalText(input.senderName) ?? null,
  sender_friend_code: senderFriendCode ?? null,
  source: 'desktop',
  kind: input.kind,
  priority: input.priority,
  title: normalizeOptionalText(input.title) ?? null,
  message: input.message.trim(),
  related_task_id: normalizeOptionalText(input.relatedTaskId) ?? null,
  related_task_title: normalizeOptionalText(input.relatedTaskTitle) ?? null,
  payload: input.payload ?? {},
  status: 'pending',
});

export const createSupabaseFriendNetworkService = ({
  deviceKey,
  deviceName,
  onPopupEvent,
  onChanged,
  onError,
}: SupabaseFriendNetworkServiceOptions): SupabaseFriendNetworkService => {
  const missingEnvKeys = getMissingSupabaseEnvKeys();

  if (missingEnvKeys.length > 0) {
    return {
      isConfigured: false,
      missingEnvKeys,
      deviceKey,
      deviceName,
      start: async () => undefined,
      refresh: async () => undefined,
      stop: async () => undefined,
      registerDevice: async () => undefined,
      setFriendCode: async () => {
        throw new Error('Supabase friend network is not configured.');
      },
      listFriendCodes: async () => [],
      listPendingEvents: async () => [],
      listRecentEvents: async () => [],
      sendPopup: async () => undefined,
      markDelivered: async () => undefined,
      updateStatus: async () => undefined,
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

  const devicesTable = getTableName(
    SUPABASE_APP_DEVICES_TABLE_ENV,
    DEFAULT_SUPABASE_APP_DEVICES_TABLE,
  );
  const friendCodesTable = getTableName(
    SUPABASE_FRIEND_CODES_TABLE_ENV,
    DEFAULT_SUPABASE_FRIEND_CODES_TABLE,
  );
  const popupEventsTable = getTableName(
    SUPABASE_APP_POPUP_EVENTS_TABLE_ENV,
    DEFAULT_SUPABASE_APP_POPUP_EVENTS_TABLE,
  );
  const handledEventIds = new Set<string>();
  let channel: RealtimeChannel | null = null;

  const registerDevice = async (): Promise<void> => {
    const { error } = await supabase.from(devicesTable).upsert(
      [
        {
          device_key: deviceKey,
          device_name: deviceName ?? null,
          last_seen_at: new Date().toISOString(),
        },
      ],
      {
        onConflict: 'device_key',
      },
    );

    if (error) {
      onError(`Supabase app device ${deviceKey} could not be registered.`, error);
    }
  };

  const listFriendCodes = async (): Promise<FriendCodeAlias[]> => {
    const { data, error } = await supabase
      .from(friendCodesTable)
      .select('id, code, code_normalized, device_key, created_at, retired_at')
      .eq('device_key', deviceKey)
      .order('created_at', {
        ascending: false,
      })
      .limit(100);

    if (error) {
      onError('Supabase friend codes could not be loaded.', error);
      return [];
    }

    return (data ?? []).map((row) => mapFriendCodeRow(row as SupabaseFriendCodeRow));
  };

  const getCurrentFriendCode = async (): Promise<string | undefined> =>
    (await listFriendCodes())[0]?.code;

  const setFriendCode = async (code: string): Promise<FriendCodeAlias> => {
    await registerDevice();

    const { data, error } = await supabase.rpc(REGISTER_FRIEND_CODE_RPC, {
      p_device_key: deviceKey,
      p_code: code,
    });

    if (error) {
      onError('Supabase friend code could not be registered.', error);
      throw new Error('Friend code could not be registered. It may already be in use.');
    }

    return mapFriendCodeRow(data as SupabaseFriendCodeRow);
  };

  const resolveFriendCode = async (code: string): Promise<SupabaseFriendCodeRow> => {
    const normalizedCode = normalizeFriendCode(code);
    const { data, error } = await supabase
      .from(friendCodesTable)
      .select('id, code, code_normalized, device_key, created_at, retired_at')
      .eq('code_normalized', normalizedCode)
      .limit(1);

    if (error) {
      onError(`Supabase friend code "${code}" could not be resolved.`, error);
      throw new Error('Friend code could not be looked up.');
    }

    const row = data?.[0] as SupabaseFriendCodeRow | undefined;

    if (!row) {
      throw new Error(`No friend is using the code "${code}".`);
    }

    return row;
  };

  const listPendingEvents = async (): Promise<AppPopupEvent[]> => {
    const { data, error } = await supabase
      .from(popupEventsTable)
      .select(
        'id, recipient_device_key, sender_device_key, sender_name, sender_friend_code, source, kind, priority, title, message, related_task_id, related_task_title, payload, status, created_at, delivered_at, reviewed_at',
      )
      .eq('recipient_device_key', deviceKey)
      .order('created_at', {
        ascending: false,
      })
      .limit(PENDING_EVENT_BATCH_SIZE);

    if (error) {
      onError('Supabase app popup events could not be loaded.', error);
      return [];
    }

    return (data ?? [])
      .map((row) => mapPopupEventRow(row as SupabaseAppPopupEventRow))
      .filter(
        (event) =>
          event.status === 'pending' ||
          ((event.kind === 'task_submission' ||
            event.kind === 'task_edit_suggestion') &&
            (event.status === 'delivered' || event.status === 'opened')),
      );
  };

  const listRecentEvents = async (): Promise<AppPopupEvent[]> => {
    const { data, error } = await supabase
      .from(popupEventsTable)
      .select(
        'id, recipient_device_key, sender_device_key, sender_name, sender_friend_code, source, kind, priority, title, message, related_task_id, related_task_title, payload, status, created_at, delivered_at, reviewed_at',
      )
      .eq('recipient_device_key', deviceKey)
      .order('created_at', {
        ascending: false,
      })
      .limit(RECENT_EVENT_LIMIT);

    if (error) {
      onError('Supabase recent app popup events could not be loaded.', error);
      return [];
    }

    return (data ?? []).map((row) => mapPopupEventRow(row as SupabaseAppPopupEventRow));
  };

  const updateStatus = async (
    eventId: string,
    status: AppPopupEventStatus,
  ): Promise<void> => {
    const now = new Date().toISOString();
    const updates: Record<string, unknown> = {
      status,
    };

    if (status === 'delivered') {
      updates.delivered_at = now;
    }

    if (status !== 'pending' && status !== 'delivered') {
      updates.reviewed_at = now;
    }

    const { error } = await supabase.from(popupEventsTable).update(updates).eq('id', eventId);

    if (error) {
      const message = `Supabase app popup event ${eventId} could not be marked ${status}.`;
      onError(message, error);
      throw new Error(message);
    }
  };

  const handleIncomingEvent = async (event: AppPopupEvent): Promise<void> => {
    if (handledEventIds.has(event.id)) {
      if (event.status === 'pending') {
        await updateStatus(event.id, 'delivered');
        onChanged();
      }

      return;
    }

    if (event.status !== 'pending') {
      return;
    }

    const wasHandled = onPopupEvent(event) !== false;

    if (wasHandled) {
      handledEventIds.add(event.id);
    }

    onChanged();
  };

  const loadPendingEvents = async (): Promise<void> => {
    const pendingEvents = await listPendingEvents();

    for (const event of pendingEvents.reverse()) {
      await handleIncomingEvent(event);
    }
  };

  return {
    isConfigured: true,
    missingEnvKeys: [],
    deviceKey,
    deviceName,
    start: async () => {
      await registerDevice();
      await loadPendingEvents();

      if (channel) {
        return;
      }

      channel = supabase
        .channel(`friend-network-${deviceKey}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: popupEventsTable,
            filter: `recipient_device_key=eq.${deviceKey}`,
          },
          (payload: { eventType?: unknown; new?: unknown }) => {
            if (payload.eventType === 'INSERT' && payload.new) {
              void handleIncomingEvent(
                mapPopupEventRow(payload.new as SupabaseAppPopupEventRow),
              );
            }

            onChanged();
          },
        )
        .subscribe((status: string) => {
          if (status === 'CHANNEL_ERROR') {
            onError('Supabase friend network realtime subscription hit a channel error.');
          }

          if (status === 'TIMED_OUT') {
            onError('Supabase friend network realtime subscription timed out.');
          }
        });
    },
    refresh: loadPendingEvents,
    stop: async () => {
      handledEventIds.clear();

      if (!channel) {
        return;
      }

      await supabase.removeChannel(channel);
      channel = null;
    },
    registerDevice,
    setFriendCode,
    listFriendCodes,
    listPendingEvents,
    listRecentEvents,
    sendPopup: async (input: AppPopupDraft) => {
      if (!input.message.trim()) {
        throw new Error('Message is required.');
      }

      await registerDevice();

      const recipientFriendCode = await resolveFriendCode(input.recipientFriendCode);
      const senderFriendCode = await getCurrentFriendCode();
      const { error } = await supabase.from(popupEventsTable).upsert(
        [
          buildEventRow(
            input,
            recipientFriendCode.device_key,
            deviceKey,
            senderFriendCode,
          ),
        ],
        {
          onConflict: 'id',
        },
      );

      if (error) {
        onError('Supabase app popup event could not be sent.', error);
        throw new Error('Popup could not be sent.');
      }
    },
    markDelivered: async (eventId: string) => {
      await updateStatus(eventId, 'delivered');
    },
    updateStatus,
  };
};
