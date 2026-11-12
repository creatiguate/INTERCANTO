export function isOpen(env) {
  if (String(env.VOTING_ENABLED || 'true').toLowerCase() === 'false') return false;
  if (env.VOTING_CLOSE_AT) {
    const closeAt = Date.parse(env.VOTING_CLOSE_AT);
    if (!Number.isNaN(closeAt) && Date.now() >= closeAt) return false;
  }
  return true;
}
