# Security Policy

`@mertushka/webrtc-node` is currently a pre-release, data-channel-first WebRTC
binding. Do not deploy it as a security boundary until the selected WPT suite,
native lifetime behavior, and cross-platform CI evidence are stable for your
use case.

## Reporting

For security-sensitive issues, open a private GitHub security advisory if the
repository has advisories enabled. Otherwise contact the maintainer privately
before publishing exploit details.

Include:

- affected commit or version,
- operating system and Node.js version,
- reproduction steps,
- whether the issue involves native memory safety, callback threading,
  certificate handling, SDP/ICE input, or data-channel message handling.

## Supported Versions

No released versions are supported yet. Security support begins after the first
tagged release.
