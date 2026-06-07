/**
 * Module-level session type for the current page context.
 * Student pages set this to 'student', admin pages to 'admin'.
 * All API requests include this as X-Session-Type header so the
 * backend resolves the correct session cookie.
 */

let _sessionType: 'admin' | 'student' = 'admin';

type ChangeListener = (type: 'admin' | 'student') => void;
const changeListeners = new Set<ChangeListener>();

/**
 * Subscribe to session-type *changes* (admin <-> student). Used by the WebSocket
 * layer to drop and re-open sockets so they re-authenticate as the new identity.
 * Returns an unsubscribe function.
 */
export function onSessionTypeChange(listener: ChangeListener): () => void {
  changeListeners.add(listener);
  return () => changeListeners.delete(listener);
}

export function setSessionType(type: 'admin' | 'student') {
  if (type === _sessionType) return; // no-op on same value (called every render)
  _sessionType = type;
  changeListeners.forEach((l) => l(type));
}

export function getSessionType(): 'admin' | 'student' {
  return _sessionType;
}
