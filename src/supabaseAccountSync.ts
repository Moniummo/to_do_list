import { createHash } from 'node:crypto';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import type {
  AccountCredentials,
  AccountSession,
  PlannerState,
  SavedFriendContact,
  SavedFriendContactDraft,
} from './types';

dotenv.config();

const SUPABASE_URL_ENV = 'SUPABASE_URL';
const SUPABASE_PUBLISHABLE_KEY_ENV = 'SUPABASE_PUBLISHABLE_KEY';
const CREATE_ACCOUNT_RPC = 'create_app_account';
const LOGIN_ACCOUNT_RPC = 'login_app_account';
const LOAD_PLANNER_RPC = 'load_app_planner_state';
const SAVE_PLANNER_RPC = 'save_app_planner_state';
const LIST_CONTACTS_RPC = 'list_app_friend_contacts';
const UPSERT_CONTACT_RPC = 'upsert_app_friend_contact';
const DELETE_CONTACT_RPC = 'delete_app_friend_contact';
const PASSWORD_HASH_NAMESPACE = 'to-do-list-account-v1';

type AccountRpcRow = {
  account_id: string;
  username: string;
  planner_state: unknown;
  planner_state_updated_at: string;
};

type PlannerRpcRow = {
  planner_state: unknown;
  planner_state_updated_at: string;
};

type SavePlannerRpcRow = {
  planner_state_updated_at: string;
};

type ContactRpcRow = {
  contact_id: string;
  contact_account_id: string;
  contact_nickname: string;
  contact_friend_code: string;
  contact_friend_code_normalized: string;
  contact_created_at: string;
  contact_updated_at: string;
  contact_last_resolved_at: string | null;
};

export type AccountSyncSession = AccountSession & {
  passwordHash: string;
};

export type AccountSyncResult = {
  session: AccountSyncSession;
  plannerState: PlannerState;
  plannerStateUpdatedAt: string;
};

export type SupabaseAccountSyncService = {
  isConfigured: boolean;
  missingEnvKeys: string[];
  createAccount: (
    credentials: AccountCredentials,
    initialPlannerState: PlannerState,
  ) => Promise<AccountSyncResult>;
  login: (credentials: AccountCredentials) => Promise<AccountSyncResult>;
  loadPlannerState: (session: AccountSyncSession) => Promise<{
    plannerState: PlannerState;
    plannerStateUpdatedAt: string;
  }>;
  savePlannerState: (
    session: AccountSyncSession,
    plannerState: PlannerState,
  ) => Promise<string>;
  listContacts: (session: AccountSyncSession) => Promise<SavedFriendContact[]>;
  saveContact: (
    session: AccountSyncSession,
    input: SavedFriendContactDraft,
  ) => Promise<SavedFriendContact>;
  deleteContact: (session: AccountSyncSession, contactId: string) => Promise<void>;
};

type ServiceOptions = {
  onError: (message: string, error?: unknown) => void;
};

const getMissingSupabaseEnvKeys = (): string[] =>
  [SUPABASE_URL_ENV, SUPABASE_PUBLISHABLE_KEY_ENV].filter(
    (key) => !process.env[key]?.trim(),
  );

const normalizeOptionalText = (value?: string | null): string | undefined => {
  const trimmedValue = value?.trim();
  return trimmedValue ? trimmedValue : undefined;
};

const normalizeUsername = (username: string): string => {
  const normalizedUsername = username.trim();

  if (normalizedUsername.length < 2 || normalizedUsername.length > 40) {
    throw new Error('Username must be between 2 and 40 characters.');
  }

  return normalizedUsername;
};

const hashPassword = ({ username, password }: AccountCredentials): string => {
  const normalizedUsername = normalizeUsername(username).toLowerCase();
  const normalizedPassword = password.trim();

  if (normalizedPassword.length < 4 || normalizedPassword.length > 128) {
    throw new Error('Password must be between 4 and 128 characters.');
  }

  return createHash('sha256')
    .update(`${PASSWORD_HASH_NAMESPACE}:${normalizedUsername}:${normalizedPassword}`)
    .digest('hex');
};

const normalizePlannerState = (value: unknown): PlannerState => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Synced planner state is malformed.');
  }

  const state = value as Partial<PlannerState>;

  return {
    schemaVersion: typeof state.schemaVersion === 'number' ? state.schemaVersion : 3,
    oneOffTasks: Array.isArray(state.oneOffTasks) ? state.oneOffTasks : [],
    timeBlocks: Array.isArray(state.timeBlocks) ? state.timeBlocks : [],
    routineTemplates: Array.isArray(state.routineTemplates) ? state.routineTemplates : [],
    routineOccurrences: Array.isArray(state.routineOccurrences)
      ? state.routineOccurrences
      : [],
    notifiedReminders:
      state.notifiedReminders &&
      typeof state.notifiedReminders === 'object' &&
      !Array.isArray(state.notifiedReminders)
        ? (state.notifiedReminders as Record<string, string>)
        : {},
  };
};

const getFirstRpcRow = <TRow>(data: unknown): TRow => {
  if (Array.isArray(data)) {
    if (!data[0]) {
      throw new Error('Supabase did not return a row.');
    }

    return data[0] as TRow;
  }

  if (!data || typeof data !== 'object') {
    throw new Error('Supabase did not return a row.');
  }

  return data as unknown as TRow;
};

const mapAccountRow = (
  row: AccountRpcRow,
  passwordHash: string,
): AccountSyncResult => ({
  session: {
    accountId: row.account_id,
    username: row.username,
    passwordHash,
  },
  plannerState: normalizePlannerState(row.planner_state),
  plannerStateUpdatedAt: row.planner_state_updated_at,
});

const mapContactRow = (row: ContactRpcRow): SavedFriendContact => ({
  id: row.contact_id,
  accountId: row.contact_account_id,
  nickname: row.contact_nickname,
  friendCode: row.contact_friend_code,
  normalizedFriendCode: row.contact_friend_code_normalized,
  createdAt: row.contact_created_at,
  updatedAt: row.contact_updated_at,
  lastResolvedAt: normalizeOptionalText(row.contact_last_resolved_at),
});

export const createSupabaseAccountSyncService = ({
  onError,
}: ServiceOptions): SupabaseAccountSyncService => {
  const missingEnvKeys = getMissingSupabaseEnvKeys();

  if (missingEnvKeys.length > 0) {
    return {
      isConfigured: false,
      missingEnvKeys,
      createAccount: async () => {
        throw new Error('Supabase account sync is not configured.');
      },
      login: async () => {
        throw new Error('Supabase account sync is not configured.');
      },
      loadPlannerState: async () => {
        throw new Error('Supabase account sync is not configured.');
      },
      savePlannerState: async () => {
        throw new Error('Supabase account sync is not configured.');
      },
      listContacts: async () => [],
      saveContact: async () => {
        throw new Error('Supabase account sync is not configured.');
      },
      deleteContact: async () => undefined,
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

  const buildSessionArgs = (session: AccountSyncSession): Record<string, unknown> => ({
    p_account_id: session.accountId,
    p_password_hash: session.passwordHash,
  });

  return {
    isConfigured: true,
    missingEnvKeys: [],
    createAccount: async (credentials, initialPlannerState) => {
      const passwordHash = hashPassword(credentials);
      const { data, error } = await supabase.rpc(CREATE_ACCOUNT_RPC, {
        p_username: normalizeUsername(credentials.username),
        p_password_hash: passwordHash,
        p_initial_planner_state: initialPlannerState,
      });

      if (error) {
        onError('Supabase account could not be created.', error);
        throw new Error('Account could not be created. That username may already be taken.');
      }

      return mapAccountRow(getFirstRpcRow<AccountRpcRow>(data), passwordHash);
    },
    login: async (credentials) => {
      const passwordHash = hashPassword(credentials);
      const { data, error } = await supabase.rpc(LOGIN_ACCOUNT_RPC, {
        p_username: normalizeUsername(credentials.username),
        p_password_hash: passwordHash,
      });

      if (error) {
        onError('Supabase account login failed.', error);
        throw new Error('Username or password did not match.');
      }

      return mapAccountRow(getFirstRpcRow<AccountRpcRow>(data), passwordHash);
    },
    loadPlannerState: async (session) => {
      const { data, error } = await supabase.rpc(LOAD_PLANNER_RPC, buildSessionArgs(session));

      if (error) {
        onError('Supabase planner state could not be loaded.', error);
        throw new Error('Planner sync could not load your account.');
      }

      const row = getFirstRpcRow<PlannerRpcRow>(data);

      return {
        plannerState: normalizePlannerState(row.planner_state),
        plannerStateUpdatedAt: row.planner_state_updated_at,
      };
    },
    savePlannerState: async (session, plannerState) => {
      const { data, error } = await supabase.rpc(SAVE_PLANNER_RPC, {
        ...buildSessionArgs(session),
        p_planner_state: plannerState,
      });

      if (error) {
        onError('Supabase planner state could not be saved.', error);
        throw new Error('Planner sync could not save your latest changes.');
      }

      const row = getFirstRpcRow<SavePlannerRpcRow>(data);
      return row.planner_state_updated_at;
    },
    listContacts: async (session) => {
      const { data, error } = await supabase.rpc(LIST_CONTACTS_RPC, buildSessionArgs(session));

      if (error) {
        onError('Supabase saved friend contacts could not be loaded.', error);
        return [];
      }

      return (Array.isArray(data) ? data : []).map((row) =>
        mapContactRow(row as ContactRpcRow),
      );
    },
    saveContact: async (session, input) => {
      const { data, error } = await supabase.rpc(UPSERT_CONTACT_RPC, {
        ...buildSessionArgs(session),
        p_friend_code: input.friendCode,
        p_nickname: input.nickname,
      });

      if (error) {
        onError('Supabase saved friend contact could not be saved.', error);
        throw new Error('Saved friend could not be saved. Check that the friend code exists.');
      }

      return mapContactRow(getFirstRpcRow<ContactRpcRow>(data));
    },
    deleteContact: async (session, contactId) => {
      const { error } = await supabase.rpc(DELETE_CONTACT_RPC, {
        ...buildSessionArgs(session),
        p_contact_id: contactId,
      });

      if (error) {
        onError('Supabase saved friend contact could not be deleted.', error);
        throw new Error('Saved friend could not be deleted.');
      }
    },
  };
};
