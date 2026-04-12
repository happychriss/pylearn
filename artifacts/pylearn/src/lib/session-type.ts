/**
 * Module-level session type for the current page context.
 * Student pages set this to 'student', admin pages to 'admin'.
 * All API requests include this as X-Session-Type header so the
 * backend resolves the correct session cookie.
 */

let _sessionType: 'admin' | 'student' = 'admin';

export function setSessionType(type: 'admin' | 'student') {
  _sessionType = type;
}

export function getSessionType(): 'admin' | 'student' {
  return _sessionType;
}
