# Nour — Local Video Studio

Nour is an Apple-focused, local-first video editor with a companion operations Console.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/nour-studio run dev` — run the web editor and Console
- `pnpm --filter @workspace/nour-studio run desktop:dev` — run the API, frontend, and native Tauri window on macOS
- `.github/workflows/nour-desktop-release.yml` — build, sign, notarize, verify, and publish separate Apple Silicon and Intel Tauri releases from a `v*` tag
- `pnpm --filter @workspace/nour-studio run desktop:check` — check the native Rust layer
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Desktop: Tauri 2 + Rust, reusing the Nour React frontend

## Where things live

- `artifacts/nour-studio/` — React editor, Console, and Tauri desktop shell
- `artifacts/nour-studio/src-tauri/` — native macOS commands and desktop configuration
- `artifacts/nour-studio/DESKTOP.md` — desktop setup and test instructions
- `artifacts/api-server/` — shared Express API
- `lib/api-spec/openapi.yaml` — API contract source of truth

## Architecture decisions

- Keep raw footage and project media local by default.
- Reuse the React editor inside Tauri; native file/media capabilities belong in Rust.
- Keep the Express API behind `/api` so web and desktop clients share one contract.

## Product

Create local video projects, import and preview media, organize A-roll/B-roll, shape a story, edit a timeline, adjust color/audio, prepare captions, and export.

## User preferences

No durable user preferences recorded.

## Gotchas

- Replit can verify the Rust layer; signed releases are built on native GitHub-hosted macOS runners.
- Keep Apple and Tauri updater signing credentials in GitHub Actions secrets, never in the repository.
- The desktop dev runner reserves ports 5000 (API) and 1420 (Vite).

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
