# Releasing

1. Bump the version in `package.json` and `package-lock.json`, commit the change, and merge it to main.
2. Tag that commit `vX.Y.Z` to match the package version and push the tag. The release workflow tests, publishes to npm and attaches the package tarball to a GitHub release. It can also be run manually against a matching tag.

For the first release, configure an npm publishing token as the GitHub Actions `NPM_TOKEN` secret (or publish locally after `npm login`), since npm trusted publishers can only be configured for an existing package.

After the package exists, optionally switch to npm Trusted Publishing: on npmjs.com open the package's Settings → Trusted Publisher and configure GitHub Actions with user `edwinjosechittilappilly`, repository `blast-studio`, and workflow `release.yml`. Then delete the `NPM_TOKEN` secret. The workflow has OIDC permissions and uses a compatible npm version.
