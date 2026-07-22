# Security advisory status

Last reviewed: 2026-07-22

## Production dependencies

`npm run audit:production` reports zero known vulnerabilities. This is the audit enforced by CI because it represents dependencies shipped in the browser/Worker application.

## Development-tool exception

The complete development tree currently reports three high-severity inherited `sharp/libvips` CVEs through `wrangler -> miniflare -> sharp` (`GHSA-f88m-g3jw-g9cj`). Wrangler and Miniflare are build/local-emulation tools and are not bundled into the deployed Worker.

npm proposes downgrading Wrangler to 4.15.2. That version was evaluated and rejected because its dependency tree reintroduced high-severity `undici` and `ws` advisories. The project therefore pins current Wrangler 4.113.0, which confines the known finding to `sharp`, and will upgrade when Cloudflare releases a compatible patched dependency tree.

Mitigations:

- CI runs in an isolated, short-lived runner with untrusted image processing disabled.
- Production deployment contains neither Wrangler, Miniflare, nor Sharp.
- The lockfile pins the reviewed versions.
- Dependabot/Renovate should alert on the first safe upstream release.

Do not use `npm audit fix --force` for this finding; it would silently select the older network stack described above.
