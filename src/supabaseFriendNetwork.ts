import { createClient, type RealtimeChannel } from '@supabase/supabase-js';
import {
  getMissingSupabaseConfigKeys,
  getSupabasePublishableKey,
  getSupabaseUrl,
} from './buildConfig';
import type {
  AppPopupDraft,
  AppPopupEvent,
  AppPopupEventKind,
  AppPopupEventPriority,
  AppPopupEventStatus,
} from './types';

const SUPABASE_APP_POPUP_EVENTS_TABLE_ENV = 'SUPABASE_APP_POPUP_EVENTS_TABLE';
const DEFAULT_SUPABASE_APP_POPUP_EVENTS_TABLE = 'app_popup_events';
const REGISTER_APP_DEVICE_RPC = 'register_app_device';
const SEND_APP_POPUP_EVENT_RPC = 'send_app_popup_event';
const PENDING_EVENT_BATCH_SIZE = 100;
const RECENT_EVENT_LIMIT = 200;

type SupabaseAppPopupEventRow = {
  id: string;
  recipient_account_id: string;
  recipient_device_key: string | null;
  sender_account_id: string | null;
  sender_device_key: string | null;
  sender_name: string | null;
  sender_display_name: string | null;
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
  accountId: string;
  accountUsername: string;
  accountPasswordHash: string;
  deviceKey: string;
  deviceName?: string;
  onPopupEvent: (event: AppPopupEvent) => boolean | void;
  onChanged: () => void;
  onError: (message: string, error?: unknown) => void;
};

export type SupabaseFriendNetworkService = {
  isConfigured: boolean;
  missingEnvKeys: string[];
  accountId: string;
  accountUsername: string;
  deviceKey: string;
  deviceName?: string;
  start: () => Promise<void>;
  refresh: () => Promise<void>;
  stop: () => Promise<void>;
  registerDevice: () => Promise<void>;
  listPendingEvents: () => Promise<AppPopupEvent[]>;
  listRecentEvents: () => Promise<AppPopupEvent[]>;
  sendPopup: (input: AppPopupDraft) => Promise<void>;
  markDelivered: (eventId: string) => Promise<void>;
  updateStatus: (eventId: string, status: AppPopupEventStatus) => Promise<void>;
};

const getTableName = (envKey: string, defaultName: string): string =>
  process.env[envKey]?.trim() || defaultName;

const normalizeOptionalText = (value?: string | null): string | undefined => {
  const trimmedValue = value?.trim();
  return trimmedValue ? trimmedValue : undefined;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const mapPopupEventRow = (row: SupabaseAppPopupEventRow): AppPopupEvent => ({
  id: row.id,
  recipientAccountId: row.recipient_account_id,
  recipientDeviceKey: normalizeOptionalText(row.recipient_device_key),
  senderAccountId: normalizeOptionalText(row.sender_account_id),
  senderDeviceKey: normalizeOptionalText(row.sender_device_key),
  senderName: normalizeOptionalText(row.sender_name),
  senderDisplayName: normalizeOptionalText(row.sender_display_name),
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

const eventColumns =
  'id, recipient_account_id, recipient_device_key, sender_account_id, sender_device_key, sender_name, sender_display_name, source, kind, priority, title, message, related_task_id, related_task_title, payload, status, created_at, delivered_at, reviewed_at';

export const createSupabaseFriendNetworkService = ({
  accountId,
  accountUsername,
  accountPasswordHash,
  deviceKey,
  deviceName,
  onPopupEvent,
  onChanged,
  onError,
}: SupabaseFriendNetworkServiceOptions): SupabaseFriendNetworkService => {
  const missingEnvKeys = getMissingSupabaseConfigKeys();
  const disabledService: SupabaseFriendNetworkService = {
    isConfigured: false,
    missingEnvKeys,
    accountId,
    accountUsername,
    deviceKey,
    deviceName,
    start: async () => undefined,
    refresh: async () => undefined,
    stop: async () => undefined,
    registerDevice: async () => undefined,
    listPendingEvents: async () => [],
    listRecentEvents: async () => [],
    sendPopup: async () => undefined,
    markDelivered: async () => undefined,
    updateStatus: async () => undefined,
  };

  if (missingEnvKeys.length > 0) {
    return disabledService;
  }

  const supabase = createClient(
    getSupabaseUrl() as string,
    getSupabasePublishableKey() as string,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
  const popupEventsTable = getTableName(
    SUPABASE_APP_POPUP_EVENTS_TABLE_ENV,
    DEFAULT_SUPABASE_APP_POPUP_EVENTS_TABLE,
  );
  const handledEventIds = new Set<string>();
  let channel: RealtimeChannel | null = null;

  const registerDevice = async (): Promise<void> => {
    const { error } = await supabase.rpc(REGISTER_APP_DEVICE_RPC, {
      p_account_id: accountId,
      p_password_hash: accountPasswordHash,
      p_device_key: deviceKey,
      p_device_name: deviceName ?? null,
    });

    if (error) {
      onError(`Supabase app device ${deviceKey} could not be registered.`, error);
    }
  };

  const listPendingEvents = async (): Promise<AppPopupEvent[]> => {
    const { data, error } = await supabase
      .from(popupEventsTable)
      .select(eventColumns)
      .eq('recipient_account_id', accountId)
      .order('created_at', { ascending: false })
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
      .select(eventColumns)
      .eq('recipient_account_id', accountId)
      .order('created_at', { ascending: false })
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
    const updates: Record<string, unknown> = { status };
    const now = new Date().toISOString();

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
    if (event.status !== 'pending') {
      return;
    }

    if (handledEventIds.has(event.id)) {
      await updateStatus(event.id, 'delivered');
      onChanged();
      return;
    }

    if (onPopupEvent(event) !== false) {
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
    ...disabledService,
    isConfigured: true,
    missingEnvKeys: [],
    start: async () => {
      await registerDevice();
      await loadPendingEvents();

      if (channel) {
        return;
      }

      channel = supabase
        .channel(`friend-network-${accountId}-${deviceKey}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: popupEventsTable,
            filter: `recipient_account_id=eq.${accountId}`,
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
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            onError(`Supabase friend network realtime subscription ${status.toLowerCase()}.`);
          }
        });
    },
    refresh: loadPendingEvents,
    stop: async () => {
      handledEventIds.clear();

      if (channel) {
        await supabase.removeChannel(channel);
        channel = null;
      }
    },
    registerDevice,
    listPendingEvents,
    listRecentEvents,
    sendPopup: async (input) => {
      if (!input.message.trim()) {
        throw new Error('Message is required.');
      }

      await registerDevice();
      const { error } = await supabase.rpc(SEND_APP_POPUP_EVENT_RPC, {
        p_account_id: accountId,
        p_password_hash: accountPasswordHash,
        p_device_key: deviceKey,
        p_recipient_username: input.recipientUsername,
        p_recipient_account_id: input.recipientAccountId ?? null,
        p_sender_name: normalizeOptionalText(input.senderName) ?? null,
        p_kind: input.kind,
        p_priority: input.priority,
        p_title: normalizeOptionalText(input.title) ?? null,
        p_message: input.message.trim(),
        p_related_task_id: normalizeOptionalText(input.relatedTaskId) ?? null,
        p_related_task_title: normalizeOptionalText(input.relatedTaskTitle) ?? null,
        p_payload: input.payload ?? {},
        p_emergency_password: normalizeOptionalText(input.emergencyPassword) ?? null,
      });

      if (error) {
        onError('Supabase app popup event could not be sent.', error);
        throw new Error(
          input.priority === 'emergency'
            ? 'Emergency popup could not be sent. Check that friend password.'
            : 'Popup could not be sent. Check the username or saved friend.',
        );
      }
    },
    markDelivered: async (eventId) => {
      await updateStatus(eventId, 'delivered');
    },
    updateStatus,
  };
};
