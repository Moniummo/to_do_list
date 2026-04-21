declare module '@supabase/supabase-js' {
  export type RealtimeChannel = {
    [key: string]: unknown;
  };

  type QueryResponse = Promise<{
    data: unknown[] | null;
    error: unknown | null;
  }>;

  type MutationResponse = Promise<{
    error: unknown | null;
  }>;

  type UpdateBuilder = {
    eq: (
      column: string,
      value: unknown,
    ) => MutationResponse;
    in: (
      column: string,
      values: unknown[],
    ) => MutationResponse;
  };

  type SelectBuilder = {
    eq: (
      column: string,
      value: unknown,
    ) => SelectBuilder;
    order: (
      column: string,
      options: {
        ascending: boolean;
      },
    ) => SelectBuilder;
    limit: (count: number) => QueryResponse;
  };

  type DeleteBuilder = {
    eq: (
      column: string,
      value: unknown,
    ) => MutationResponse;
    in: (
      column: string,
      values: unknown[],
    ) => MutationResponse;
  };

  type ChannelBuilder = {
    subscribe: (callback: (status: string) => void) => RealtimeChannel;
  };

  type SupabaseClientLike = {
    from: (table: string) => {
      update: (values: Record<string, unknown>) => UpdateBuilder;
      upsert: (
        values: Record<string, unknown>[],
        options: {
          onConflict: string;
        },
      ) => MutationResponse;
      delete: () => DeleteBuilder;
      select: (columns: string) => SelectBuilder;
    };
    channel: (name: string) => {
      on: (
        eventType: string,
        filter: Record<string, unknown>,
        callback: (payload: { new: unknown }) => void,
      ) => ChannelBuilder;
    };
    removeChannel: (channel: RealtimeChannel) => Promise<unknown>;
  };

  export function createClient(...args: unknown[]): SupabaseClientLike;
}
