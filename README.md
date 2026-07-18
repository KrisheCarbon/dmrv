# KriSHE Carbon — Monorepo

Unified workspace for the KriSHE Carbon DMRV platform.

## Structure

```
Tech/
├── Web/                 # Next.js admin dashboard (TypeScript)
├── Mobile/              # Expo / React Native field app (TypeScript)
├── Backend/             # NestJS API (TypeScript)
├── packages/
│   └── shared/          # Shared types, validation, constants
└── supabase/
    └── migrations/      # Shared database migrations
```

## Prerequisites

- Node.js 20+
- npm 10+
- For Mobile: Expo CLI, Xcode (iOS), Android Studio (Android)

## Setup

```bash
# Install all workspace dependencies from the repo root
npm install

# Copy environment files
cp Web/.env.example Web/.env.local
cp Mobile/.env.example Mobile/.env
cp Backend/.env.example Backend/.env
```

## Development

```bash
# Run all apps (web + backend)
npm run dev

# Run individually
npm run dev:web
npm run dev:mobile
npm run dev:backend
```

| App     | Default URL              |
|---------|--------------------------|
| Web     | http://localhost:3000    |
| Backend | http://localhost:3001    |
| Mobile  | Expo dev server (8081)   |

## Shared package

`@krishecarbon/shared` contains types and validation used across Web, Mobile, and Backend:

```ts
import { validateFarmerForm, CROP_OPTIONS } from "@krishecarbon/shared";
```

## Database

All apps connect to the same Supabase project. Migrations live in `supabase/migrations/`.

Apply migrations via the Supabase CLI or dashboard.

## Note on nested git repos

`Web/` and `Mobile/` may still have their own `.git` folders from before the monorepo. Remove them when you're ready to use a single root git repo:

```bash
rm -rf Web/.git Mobile/.git
git init
```
