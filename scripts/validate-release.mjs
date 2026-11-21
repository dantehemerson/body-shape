import { readFileSync, appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function validateRelease({ tag, version, prerelease }) {
  const match = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-rc\.(0|[1-9]\d*))?$/.exec(tag ?? '');
  if (!match) throw new Error('Release tag must be vX.Y.Z or vX.Y.Z-rc.N (no leading zeros).');
  if (tag.slice(1) !== version) throw new Error(`Tag ${tag} does not match package.json version ${version}.`);
  if (typeof prerelease !== 'boolean') throw new Error('GitHub prerelease status must be a boolean.');
  const isRC = Boolean(match[4]);
  if (prerelease !== isRC) throw new Error('RC versions must be GitHub prereleases; stable versions must not be prereleases.');
  return { version, npmTag: isRC ? 'next' : 'latest' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const raw = process.env.RELEASE_PRERELEASE;
  if (raw !== 'true' && raw !== 'false') throw new Error('RELEASE_PRERELEASE must be true or false.');
  const release = validateRelease({ tag: process.env.RELEASE_TAG, version, prerelease: raw === 'true' });
  console.log(`Validated ${release.version} → npm @${release.npmTag}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `npm_tag=${release.npmTag}\nversion=${release.version}\n`);
}
