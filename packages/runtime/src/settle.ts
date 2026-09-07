/**
 * Delay between a browser action and the observation that reports its
 * result. Long enough for the replayed GraphQL round trips behind a click
 * to land, so the observation and the on-trail status describe the settled
 * page rather than a transition. Every action path (the eval runner, the
 * MCP adapter) must use the same value or their observations diverge.
 */
export const ACTION_SETTLE_MS = 1_500;
