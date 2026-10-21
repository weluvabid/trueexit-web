/** Frontend contracts for Overview data that will be supplied by later API work. */
export interface UpcomingPingItem {
  monitor_id: string;
  monitor_name: string;
  expected_at: string;
  /** Optional backend-computed status; the UI must not infer this from cadence alone. */
  status?: 'scheduled' | 'delayed' | 'cancelled';
}

export interface UpcomingPingsResponse {
  generated_at: string;
  items: UpcomingPingItem[];
  page?: { next_cursor: string | null };
}

/**
 * Keep the future scheduling feed behind this adapter so the Overview UI does not
 * depend on a guessed endpoint or calculate expected timestamps client-side.
 * Replace the implementation once the authorized API contract is finalized.
 */
export async function loadUpcomingPings(_workspaceId: string): Promise<UpcomingPingsResponse> {
  return { generated_at: new Date().toISOString(), items: [] };
}
