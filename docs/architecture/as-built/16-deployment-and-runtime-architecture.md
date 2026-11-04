# RaktaSetu — Deployment & Runtime Architecture

## 1. Physical Deployment Topology

```mermaid
flowchart TB
    classDef devBox fill:#0f172a,stroke:#334155,color:#ffffff;
    classDef runtimeBox fill:#1e3a8a,stroke:#1d4ed8,color:#ffffff;
    classDef cloudBox fill:#065f46,stroke:#047857,color:#ffffff;

    subgraph LocalEnvironment ["Host Runtime Environment (Windows 11 / Node.js v22.14.0)"]
        subgraph WebProcess ["Next.js Frontend (PID 8860)"]
            NextServer["Next.js App Server\nHTTP: http://localhost:3000\nClient-Side Direct Fetch to API"]:::devBox
        end

        subgraph ApiProcess ["Express & WebSocket Backend (PID 13536)"]
            ExpressServer["Express REST API (Port 4000)\nWebSocket Broker (ws://localhost:4000/ws)"]:::devBox
        end

        subgraph MobileProcess ["Metro Bundler (Port 8081)"]
            ExpoServer["Expo CLI Bundler\nTarget: Android Emulator (10.0.2.2:4000)"]:::devBox
        end
    end

    subgraph ManagedCloudServices ["Managed Cloud Services (Neon Cloud / AWS Oregon)"]
        PgBouncer["PgBouncer Pooled Endpoint (Port 6543)\nDATABASE_URL (Runtime Query Pooling)"]:::cloudBox
        PgDirect["Direct PostgreSQL Engine (Port 5432)\nDIRECT_URL (Prisma CLI Migrations)"]:::cloudBox
    end

    NextServer -->|"HTTP REST & WebSocket"| ExpressServer
    ExpoServer -->|"HTTP REST & WebSocket"| ExpressServer
    ExpressServer -->|"Prisma Client Query Engine"| PgBouncer
    PgBouncer --> PgDirect
```

---

## 2. Process Tree & Port Allocation

| Component / Subsystem | Runtime Process Command | Operating Port | Protocol | Process State |
|---|---|---|---|---|
| **Next.js Web Portal** | `next dev` (`npm run dev:web`) | `3000` | HTTP / HTML / SSE | **Active & Running** (PID 8860) |
| **Express API Backend** | `tsx watch src/server.ts` (`npm run dev:api`) | `4000` | HTTP/1.1 REST | **Active & Running** (PID 13536) |
| **WebSocket Realtime Broker**| Integrated in `server.ts` | `4000` (`/ws`) | WSS / RFC 6455 | **Active & Listening** |
| **Metro Mobile Bundler** | `expo start` (`npm run dev:mobile`) | `8081` | HTTP / Metro HMR | Configured & Testable |
| **Neon PostgreSQL Database** | Managed Serverless Cloud | `6543` / `5432` | TCP PostgreSQL Wire | **Online (Neon AWS Oregon)** |

---

## 3. Database Connection Pooling Strategy

RaktaSetu connects to Neon Cloud PostgreSQL using a dual-connection string configuration in [`apps/api/src/config/env.ts`](file:///d:/MyProject/RaktSetu/apps/api/src/config/env.ts):

1. **Pooled Connection (`DATABASE_URL`):**
   - Connects through Neon's serverless connection pooler (PgBouncer) on port 6543.
   - Handles thousands of concurrent short-lived HTTP API requests without exhausting database backend connection limits.
   - Enforces SSL encryption via `?sslmode=require&pgbouncer=true`.
2. **Direct Connection (`DIRECT_URL`):**
   - Bypasses PgBouncer and connects directly to PostgreSQL compute on port 5432.
   - Required for Prisma schema migrations (`prisma migrate dev`) and schema push operations that utilize session-level advisory locks.

---

## 4. System Startup & Dependency Sequence

```mermaid
sequenceDiagram
    autonumber
    participant Env as Environment Config (env.ts)
    participant DB as Neon PostgreSQL
    participant Schema as Schema Initializers
    participant App as Express App (app.ts)
    participant WS as WebSocket Broker (realtime.ts)
    participant Server as HTTP Server (server.ts)

    Server->>Env: Load and validate environment variables
    Note over Env: Ensures DATABASE_URL exists & demo OTP is guarded
    Server->>Schema: initDonorRegistrationSchema() & initDonorLocationSchema()
    Schema->>DB: Execute DDL safety checks / table verification
    Server->>App: Mount 19 REST routers & CORS middleware
    Server->>WS: RealtimeService.init(server)
    WS->>Server: Attach upgrade listener for /ws
    Server->>Server: server.listen(4000)
    Note over Server: API ready on http://localhost:4000<br/>WS ready on ws://localhost:4000/ws
```

