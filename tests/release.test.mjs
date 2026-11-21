import { describe, it, expect } from 'vitest';
import { validateRelease } from '../scripts/validate-release.mjs';

describe('release channel safety', () => {
  it('publishes stable releases to latest', () => {
    expect(validateRelease({ tag: 'v1.2.3', version: '1.2.3', prerelease: false }).npmTag).toBe('latest');
  });
  it('publishes release candidates to next, never latest', () => {
    expect(validateRelease({ tag: 'v1.2.3-rc.1', version: '1.2.3-rc.1', prerelease: true }).npmTag).toBe('next');
  });
  it('rejects a tag/version mismatch', () => {
    expect(() => validateRelease({ tag: 'v1.2.3', version: '1.2.4', prerelease: false })).toThrow(/does not match/);
  });
  it.each([
    { tag: 'v1.2.3', version: '1.2.3', prerelease: true },
    { tag: 'v1.2.3-rc.1', version: '1.2.3-rc.1', prerelease: false },
  ])('rejects incorrect GitHub prerelease status: $tag', values => expect(() => validateRelease(values)).toThrow(/prereleases/));
  it.each(['1.2.3', 'v01.2.3', 'v1.2.3-rc.01', 'v1.2.3-beta.1', 'v1.2.3+build', '', undefined])('rejects unsupported tag %s', tag => {
    expect(() => validateRelease({ tag, version: '1.2.3', prerelease: false })).toThrow();
  });
});
