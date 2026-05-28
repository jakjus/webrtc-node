# Maintainer Checklist

Use this checklist before publishing a public release or claiming a new
conformance milestone.

## Before Pushing

```sh
git status --short
npm run check
npm run native:check
npm run build
npm test
npm run api:check
npm run types:check
npm run pack:check
npm run wpt:selection:check
```

Run the full selected WPT suite when changing WebRTC behavior:

```sh
npm run wpt:test
npm run wpt:check:strict
npm run wpt:report -- --output wpt-report.md
```

## Public Repository Settings

- enable GitHub Actions;
- enable Dependabot alerts and security updates;
- enable private vulnerability reporting if available;
- protect `main` after the first green public run;
- require `Quality`, the OS/Node CI matrix, and `Verify CI evidence` before
  merging.

## Release Readiness

Before npm publication:

- confirm package contents with `npm run pack:check`;
- keep `publishConfig.access` set to `public` for the scoped npm package;
- decide and document the install model before publishing to npm. The current
  milestone is source-build from the repository; it does not ship prebuilt
  binaries or an npm install-time native build contract yet;
- tag a versioned release;
- publish current WPT conformance results;
- keep all intentional divergences in `docs/divergences.md`.

Do not claim full browser WebRTC compatibility until WPT results support that
claim.
