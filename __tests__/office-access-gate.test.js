import { describe, test, expect } from 'bun:test';
import {
  OFFICE_ACCESS_COOKIE,
  isOfficeRequestAuthorized,
  officeCorsOrigin
} from '../server-utils.js';

const TOKEN = 'a'.repeat(43);

function authorize(overrides = {}) {
  return isOfficeRequestAuthorized({
    reqPath: '/api/save',
    query: {},
    cookieHeader: '',
    token: TOKEN,
    ...overrides
  });
}

describe('isOfficeRequestAuthorized', () => {
  test('allows everything when no token is configured', () => {
    expect(authorize({ token: '' })).toBe(true);
    expect(authorize({ token: '', reqPath: '/open', query: {} })).toBe(true);
  });

  test('always answers the health check, so the host can wait for readiness', () => {
    expect(authorize({ reqPath: '/healthcheck' })).toBe(true);
  });

  test('accepts /open only with the configured token', () => {
    expect(authorize({ reqPath: '/open', query: { token: TOKEN } })).toBe(true);
    expect(authorize({ reqPath: '/open', query: { token: 'b'.repeat(43) } })).toBe(false);
    expect(authorize({ reqPath: '/open', query: {} })).toBe(false);
    expect(authorize({ reqPath: '/open', query: { token: 'short' } })).toBe(false);
  });

  test('accepts a later request that carries the cookie', () => {
    expect(authorize({ cookieHeader: `${OFFICE_ACCESS_COOKIE}=${TOKEN}` })).toBe(true);
    expect(authorize({ cookieHeader: `theme=dark; ${OFFICE_ACCESS_COOKIE}=${TOKEN}; x=1` })).toBe(true);
  });

  test('refuses a request without the cookie, so a website cannot drive the editor', () => {
    expect(authorize()).toBe(false);
    expect(authorize({ cookieHeader: 'theme=dark' })).toBe(false);
    expect(authorize({ cookieHeader: `${OFFICE_ACCESS_COOKIE}=${'c'.repeat(43)}` })).toBe(false);
  });

  test('does not accept the token in the query anywhere except /open', () => {
    expect(authorize({ reqPath: '/api/save', query: { token: TOKEN } })).toBe(false);
    expect(authorize({ reqPath: '/api/doc-base/abc', query: { token: TOKEN } })).toBe(false);
  });
});

describe('officeCorsOrigin', () => {
  test('reflects the editor\'s own origins', () => {
    expect(officeCorsOrigin('http://127.0.0.1:38123', 38123)).toBe('http://127.0.0.1:38123');
    expect(officeCorsOrigin('http://localhost:38123', 38123)).toBe('http://localhost:38123');
  });

  test('refuses every other origin', () => {
    expect(officeCorsOrigin('https://evil.example', 38123)).toBe(null);
    expect(officeCorsOrigin('http://127.0.0.1:38124', 38123)).toBe(null);
    expect(officeCorsOrigin(undefined, 38123)).toBe(null);
    expect(officeCorsOrigin('', 38123)).toBe(null);
  });
});
