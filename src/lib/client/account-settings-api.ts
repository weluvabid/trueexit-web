import * as v from 'valibot';
import { ApiClientError, requestApi } from './api-client';
import { parseApiBody } from './api-schemas';
import { applyAppearancePreference, readAppearancePreference, type AppearancePreference } from '@/components/shared/app-shell-controls/appearance-preference';
import type { QueryClient } from '@tanstack/query-core';

export const accountSettingsQueryKeys = {
  profile: ['account-settings', 'profile'] as const,
  preferences: ['account-settings', 'preferences'] as const,
};

const nullableString = v.nullable(v.string());

export const currentUserProfileSchema = v.object({
  user_id: v.string(),
  email: v.string(),
  email_verified: v.boolean(),
  display_name: nullableString,
  first_name: nullableString,
  last_name: nullableString,
  profile_picture_url: nullableString,
});

export const appearancePreferenceSchema = v.object({
  theme: v.picklist(['system', 'light', 'dark']),
});

export type CurrentUserProfile = v.InferOutput<typeof currentUserProfileSchema>;
export type AppearancePreferenceResponse = v.InferOutput<typeof appearancePreferenceSchema>;
export type DisplayNameValidation =
  | { valid: true; value: string }
  | { valid: false; reason: 'required' | 'too_long' };

export function validateDisplayName(input: string): DisplayNameValidation {
  const value = input.trim();
  if (value.length === 0) return { valid: false, reason: 'required' };
  // Rust's backend validation counts Unicode scalar values, not UTF-16 code units.
  if (Array.from(value).length > 200) return { valid: false, reason: 'too_long' };
  return { valid: true, value };
}

export function profileInitials(profile: Pick<CurrentUserProfile, 'display_name' | 'email'>): string {
  const displayName = profile.display_name?.trim();
  const source = displayName
    ? displayName.split(/\s+/u).filter(Boolean).slice(0, 2)
    : [profile.email.split('@')[0].trim()].filter(Boolean);
  const initials = source.map((part) => Array.from(part)[0] ?? '').join('').toUpperCase();
  return initials || 'TE';
}

export function accountSettingsErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof ApiClientError)) return fallback;
  if (error.status === 401) return 'Your session needs attention. Sign in again to continue.';
  if (error.status === 403) return 'You do not have permission to make this change.';
  if (error.status === 404) return 'This profile is no longer available. Refresh and try again.';
  if (error.status === 422 || error.code === 'invalid_display_name') return 'The server rejected this value. Check it and try again.';
  if (error.status === 0) return 'Could not reach TrueExit. Check your connection and try again.';
  if (error.status >= 500) return 'TrueExit could not complete this request right now. Try again shortly.';
  return fallback;
}

export function profileQueryOptions() {
  return {
    queryKey: accountSettingsQueryKeys.profile,
    staleTime: 30_000,
    retry: false,
    queryFn: async ({ signal }: { signal: AbortSignal }): Promise<CurrentUserProfile> => {
      const { response, body, code, requestId } = await requestApi('/api/backend/me', { signal });
      if (!response.ok) {
        throw new ApiClientError('http', `Profile request failed with status ${response.status}.`, response.status, code, requestId);
      }
      return parseApiBody(currentUserProfileSchema, body, { status: response.status, requestId });
    },
  };
}

export function appearancePreferenceQueryOptions(initialPreference?: AppearancePreference | null) {
  return {
    queryKey: accountSettingsQueryKeys.preferences,
    staleTime: 30_000,
    retry: false,
    // The local value is an immediate cache only. Timestamp zero forces an
    // authoritative backend refresh while allowing the cached theme to render.
    initialData: (): AppearancePreferenceResponse => ({
      theme: initialPreference ?? (typeof window === 'undefined' ? 'system' : readAppearancePreference()),
    }),
    initialDataUpdatedAt: initialPreference ? Date.now() : 0,
    queryFn: async ({ signal }: { signal: AbortSignal }): Promise<AppearancePreferenceResponse> => {
      const { response, body, code, requestId } = await requestApi('/api/backend/me/preferences', { signal });
      if (!response.ok) {
        throw new ApiClientError('http', `Preference request failed with status ${response.status}.`, response.status, code, requestId);
      }
      return parseApiBody(appearancePreferenceSchema, body, { status: response.status, requestId });
    },
  };
}

function idempotencyHeaders(): HeadersInit {
  return { 'Idempotency-Key': crypto.randomUUID() };
}

export async function updateDisplayName(displayName: string): Promise<{ display_name: string }> {
  const { response, body, code, requestId } = await requestApi('/api/backend/me/profile', {
    method: 'PATCH',
    headers: { ...idempotencyHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ display_name: displayName }),
  });
  if (!response.ok) {
    throw new ApiClientError('http', `Profile update failed with status ${response.status}.`, response.status, code, requestId);
  }
  return parseApiBody(v.object({ display_name: v.string() }), body, { status: response.status, requestId });
}

export function updateDisplayNameMutationOptions(queryClient: QueryClient) {
  return {
    mutationFn: updateDisplayName,
    onSuccess: (result: { display_name: string }) => {
      queryClient.setQueryData<CurrentUserProfile>(accountSettingsQueryKeys.profile, (current) =>
        current ? { ...current, display_name: result.display_name } : current,
      );
    },
  };
}

export async function updateAppearancePreference(theme: AppearancePreference): Promise<AppearancePreferenceResponse> {
  const { response, body, code, requestId } = await requestApi('/api/backend/me/preferences', {
    method: 'PATCH',
    headers: { ...idempotencyHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ theme }),
  });
  if (!response.ok) {
    throw new ApiClientError('http', `Preference update failed with status ${response.status}.`, response.status, code, requestId);
  }
  return parseApiBody(appearancePreferenceSchema, body, { status: response.status, requestId });
}

export function updateAppearancePreferenceMutationOptions(queryClient: QueryClient) {
  return {
    mutationFn: updateAppearancePreference,
    onMutate: async (theme: AppearancePreference) => {
      await queryClient.cancelQueries({ queryKey: accountSettingsQueryKeys.preferences });
      const previous = queryClient.getQueryData<AppearancePreferenceResponse>(accountSettingsQueryKeys.preferences)
        ?? { theme: readAppearancePreference() };
      queryClient.setQueryData<AppearancePreferenceResponse>(accountSettingsQueryKeys.preferences, { theme });
      applyAppearancePreference(theme);
      return { previous };
    },
    onError: (_error: unknown, _theme: AppearancePreference, context: { previous: AppearancePreferenceResponse } | undefined) => {
      if (context?.previous) {
        queryClient.setQueryData(accountSettingsQueryKeys.preferences, context.previous);
        applyAppearancePreference(context.previous.theme);
      }
    },
    onSuccess: (result: AppearancePreferenceResponse) => {
      queryClient.setQueryData(accountSettingsQueryKeys.preferences, result);
      applyAppearancePreference(result.theme);
    },
  };
}
