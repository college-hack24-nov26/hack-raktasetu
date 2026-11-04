# RaktaSetu — Repository Structure & Technology Stack Audit

## 1. Monorepo Architecture & Workspace Layout

RaktaSetu is architected as an npm-managed multi-package monorepo rooted at `D:\MyProject\RaktSetu`.

```text
D:\MyProject\RaktSetu
├── package.json                   # Root monorepo workspace configuration
├── prisma/                        # Database schema, migrations, and seed scripts
│   ├── schema.prisma              # Single source of truth for 33 PostgreSQL data models
│   └── migrations/                # Version-controlled SQL migration history
├── packages/
│   └── shared/                    # @raktasetu/shared: Cross-platform TypeScript contracts & DTOs
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           └── index.ts           # 1,058 lines of shared enums, interfaces, and permissions
├── apps/
│   ├── api/                       # @raktasetu/api: Express.js REST API & WebSocket Realtime Server
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── server.ts          # HTTP & WebSocket server entry point (Port 4000)
│   │       ├── app.ts             # Express application & route mounting
│   │       ├── config/            # Environment & clinical counselling configurations
│   │       ├── middleware/        # Authentication, RBAC, and error handlers
│   │       ├── routes/            # 19 modular REST API route controllers
│   │       └── services/          # Domain business logic & transaction coordinators
│   ├── web/                       # @raktasetu/web: Next.js 16 Web Application (Port 3000)
│   │   ├── package.json
│   │   ├── next.config.ts
│   │   └── app/                   # App Router pages, layouts, and components
│   └── mobile/                    # @raktasetu/mobile: Expo React Native Mobile App
│       ├── package.json
│       ├── app.json
│       ├── App.tsx                # Mobile root navigator and state coordinator
│       └── src/                   # Screens, location tasks, secure storage, and services
└── docs/                          # Comprehensive technical documentation & architectural guides
```

---

## 2. Technology Stack Matrix

| Architectural Layer | Technology | Version | Purpose in RaktaSetu | Key Files / Paths | Status |
|---|---|---|---|---|---|
| **Monorepo Manager** | npm Workspaces | `10.x` | Coordinates root dependency linking and workspace scripts | `package.json` | `[IMPLEMENTED & VERIFIED]` |
| **Web Framework** | Next.js (App Router) | `16.4.2` | Full-stack server/client rendering, portal pages | `apps/web/app/*` | `[IMPLEMENTED & VERIFIED]` |
| **Web UI Engine** | React / React DOM | `19.3.0` | Client component rendering and reactive state | `apps/web/package.json` | `[IMPLEMENTED & VERIFIED]` |
| **Styling & Design** | Tailwind CSS / Turbopack | `v4.x` | Modern utility-first styling and theme tokens | `apps/web/app/globals.css` | `[IMPLEMENTED & VERIFIED]` |
| **Mobile Runtime** | Expo SDK / React Native | `~52.0.49` / `0.76.9` | Cross-platform mobile client for Android/iOS | `apps/mobile/package.json` | `[IMPLEMENTED & VERIFIED]` |
| **Mobile Hardware** | expo-location & task-mgr | `~18.0.5` / `~12.0.4` | Background location tracking and geofencing | `apps/mobile/src/services/*` | `[IMPLEMENTED & VERIFIED]` |
| **Backend Runtime** | Node.js | `v22.14.0` | High-performance asynchronous execution engine | System Environment | `[IMPLEMENTED & VERIFIED]` |
| **API Framework** | Express.js | `^4.21.2` | RESTful routing, JSON parsing, middleware chain | `apps/api/src/app.ts` | `[IMPLEMENTED & VERIFIED]` |
| **TypeScript** | TypeScript Compiler | `^5.7.3` | End-to-end static typing across all workspaces | `tsconfig.json` | `[IMPLEMENTED & VERIFIED]` |
| **Database Engine** | PostgreSQL (Neon Cloud) | `16.x` | Relational ACID database with JSONB indexing | Cloud Managed (Oregon) | `[IMPLEMENTED & VERIFIED]` |
| **ORM & Migrations** | Prisma ORM | `^6.4.1` / `^6.19.3` | Type-safe schema, connection pooling, and DDL | `prisma/schema.prisma` | `[IMPLEMENTED & VERIFIED]` |
| **Realtime Messaging** | WebSocket (`ws`) | `^8.22.0` | Bidirectional real-time event broadcasting | `apps/api/src/services/realtime.ts` | `[IMPLEMENTED & VERIFIED]` |
| **Mapping Engine** | Mapbox GL JS | `^3.33.0` | Vector tile interactive maps and donor markers | `apps/web/app/components/*` | `[IMPLEMENTED & VERIFIED]` |
| **Document Generation**| PDFKit | `^0.20.2` | Cold-chain handover manifests & certificate PDFs | `apps/api/src/services/pdfService.ts` | `[IMPLEMENTED & VERIFIED]` |
| **Authentication** | Custom Signed JWT | Bearer tokens | Stateless authorization with phone & role claims | `apps/api/src/services/auth.ts` | `[IMPLEMENTED & VERIFIED]` |
| **External Scraper** | Axios & Cheerio | Dynamic HTTP | Parsing live availability from e-RaktKosh | `apps/api/src/services/eraktkosh.ts` | `[IMPLEMENTED & VERIFIED]` |

---

## 3. Package Manifests & Workspace Dependencies

### Root Package (`package.json`)
```json
{
  "name": "raktasetu-monorepo",
  "version": "0.1.0",
  "private": true,
  "workspaces": [
    "apps/*",
    "packages/*"
  ]
}
```

### Shared Package (`packages/shared/package.json`)
- **Package Name:** `@raktasetu/shared`
- **Output:** Compiles TypeScript declarations to `dist/index.d.ts` and commonjs to `dist/index.js`.
- **Imports:** Imported directly by `@raktasetu/api`, `@raktasetu/web`, and `@raktasetu/mobile` (via `file:../../packages/shared`).

### API Package (`apps/api/package.json`)
- **Package Name:** `@raktasetu/api`
- **Core Scripts:**
  - `npm run dev`: Runs `tsx watch src/server.ts` with instant hot reloading.
  - `npm run build`: Executes `tsc` to produce output in `dist/`.
  - `npm run start`: Runs compiled production server with `node dist/server.js`.
- **Runtime Dependencies:** `@prisma/client`, `cors`, `dotenv`, `express`, `pdfkit`, `ws`.

### Web Package (`apps/web/package.json`)
- **Package Name:** `@raktasetu/web`
- **Core Scripts:**
  - `npm run dev`: Boots Next.js development server on port 3000.
  - `npm run build`: Produces optimized production bundle.
  - `npm run typecheck`: Runs strict TypeScript check (`tsc --noEmit`).
- **Runtime Dependencies:** `next`, `react`, `react-dom`, `mapbox-gl`.

### Mobile Package (`apps/mobile/package.json`)
- **Package Name:** `@raktasetu/mobile`
- **Core Scripts:**
  - `npm run start`: Starts Expo development server.
  - `npm run android`: Compiles and runs Android native build.
  - `npm run prebuild`: Generates native Android/iOS project files.
- **Runtime Dependencies:** `expo`, `expo-location`, `expo-secure-store`, `expo-task-manager`, `react`, `react-native`.

---

## 4. Environment & Configuration Strategy

RaktaSetu employs a defense-in-depth configuration strategy where environment variables are loaded through typed helper modules ([`apps/api/src/config/env.ts`](file:///d:/MyProject/RaktSetu/apps/api/src/config/env.ts)):

| Environment Variable | Required | Default / Format | Purpose | Security Gate |
|---|---|---|---|---|
| `DATABASE_URL` | **Yes** | `postgresql://...@ep-...?sslmode=require&pgbouncer=true` | Pooled connection string for Prisma query client | Secrets redacted from logs |
| `DIRECT_URL` | Optional | `postgresql://...@ep-...?sslmode=require` | Direct session connection string for DDL migrations | Used exclusively by Prisma CLI |
| `PORT` | Optional | `4000` | HTTP and WebSocket listener port for API server | Fallback ensures deterministic port |
| `WEB_ORIGIN` | Optional | `http://localhost:3000` | CORS origin allowed to communicate with API | Rejects untrusted cross-origin requests |
| `NEXT_PUBLIC_API_URL` | Optional | `http://localhost:4000` | Base endpoint used by web browser fetch client | Propagated via `apps/web/.env` |
| `EXPO_PUBLIC_API_URL`| Optional | `http://10.0.2.2:4000/api/v1` | Base endpoint used by Android emulator / device | Configured in `apps/mobile` |
| `JWT_SECRET` | Optional | Fallback dev secret (32+ chars) | Cryptographic secret for signing session tokens | Production requires strict env secret |
| `ALLOW_DEMO_OTP` | Optional | `false` (default) | Permits fixed OTP `123456` in local test scenarios | **Fatal error if true in production** |
| `WHATSAPP_ACCESS_TOKEN`| Optional | Meta Bearer token | Dispatches production SMS / WhatsApp notifications | Graceful fallback if unconfigured |

