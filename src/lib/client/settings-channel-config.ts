export type NotificationChannelKind = 'email' | 'webhook' | 'slack' | 'discord';
export type ChannelConfigResult =
  | { ok: true; config: Record<string, unknown> }
  | { ok: false; error: string };

export function buildNotificationChannelConfig(
  type: NotificationChannelKind,
  address: string,
  headersText: string,
): ChannelConfigResult {
  const value = address.trim();
  if (type === 'email') {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) || value.length > 320) {
      return { ok: false, error: 'Enter a valid recipient email address.' };
    }
    return { ok: true, config: { to: value } };
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { ok: false, error: 'Enter a valid HTTPS webhook URL.' };
  }

  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash) {
    return { ok: false, error: 'Webhook destinations must use HTTPS and cannot contain embedded credentials or fragments.' };
  }

  const host = parsed.hostname.toLowerCase();
  if (type === 'slack' && !(['hooks.slack.com', 'hooks.slack-gov.com'].includes(host) && parsed.pathname.startsWith('/services/'))) {
    return { ok: false, error: 'Use a supported Slack incoming-webhook URL.' };
  }
  if (type === 'discord' && (!(host === 'discord.com' || host === 'discordapp.com') || !parsed.pathname.startsWith('/api/webhooks/'))) {
    return { ok: false, error: 'Use a supported Discord webhook URL.' };
  }

  const config: Record<string, unknown> = { url: value };
  if (headersText.trim()) {
    try {
      const parsedHeaders: unknown = JSON.parse(headersText);
      if (!parsedHeaders || typeof parsedHeaders !== 'object' || Array.isArray(parsedHeaders) ||
          Object.values(parsedHeaders).some((entry) => typeof entry !== 'string')) {
        return { ok: false, error: 'Custom headers must be a JSON object with string values.' };
      }
      config.headers = parsedHeaders;
    } catch {
      return { ok: false, error: 'Custom headers must be valid JSON.' };
    }
  }

  return { ok: true, config };
}
