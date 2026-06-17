Hello!

Building a real-time collaborative code editor with integrated AI.

Here is your production-grade blueprint to architect and build this system.

---

### 1. CORE & ADVANCED FEATURES TO BE INTEGRATED

* **Authentication (Google/GitHub OAuth 2.0):** * **Implementation:** Secure OAuth 2.0 flow initiated by the frontend, verified by the FastAPI backend using `authlib`.
* **Security:** Stateless JWT authentication with short-lived access tokens and HttpOnly secure refresh tokens. Token rotation occurs seamlessly via a dedicated `/api/v1/auth/refresh` endpoint.


* **Real-Time Synchronization (WebSocket & CRDT Engine):**
* **Implementation:** A low-latency WebSocket gateway in FastAPI managed by `asyncio`. Redis Pub/Sub serves as the message broker, broadcasting delta payloads (changes) to all clients subscribed to a specific room channel.


* **Concurrency Control (Conflict-free Replicated Data Types):**
* **Implementation:** To resolve millisecond-level race conditions, we bypass naive locking and implement a CRDT (Conflict-free Replicated Data Type) engine using **Yjs** on the frontend, bound directly to the Monaco Editor. The backend acts as a dumb relay for Yjs binary updates, ensuring perfect eventual consistency without heavy server-side processing.


* **Context-Aware AI Sidebar (SSE Streaming):**
* **Implementation:** An asynchronous pipeline hitting the OpenAI/Gemini APIs. Instead of waiting for the full generation, the backend streams the response back to the right-hand React sidebar using Server-Sent Events (SSE), creating that fast, typewriter-style token streaming effect seen in Google AI Studio.


* **Code Sandbox Execution (Judge0 Integration):**
* **Implementation:** A dedicated service layer in FastAPI that packages the current Monaco editor state, submits it to the Judge0 REST API, polls for completion (or uses a webhook), and returns `stdout`, `stderr`, execution time (ms), and memory limits directly to an integrated terminal panel on the frontend.


* **Recruiter Showcase (Latency & Presence Tracking):**
* **Implementation:** A custom React hook (`useNetworkMetrics`) that pings the WebSocket server at regular intervals to calculate round-trip time (RTT). The UI displays a dynamic latency indicator (Green < 50ms, Yellow > 100ms) in the navbar, alongside a real-time cluster of glowing, rounded-lg avatars representing active users in the session.



---

### 2. UNIFIED MONOREPO DIRECTORY STRUCTURE

```text
code-collab-monorepo/
├── docker-compose.yml
├── README.md
├── frontend/
│   ├── package.json
│   ├── tailwind.config.js          # Configured for deep slate (#0b0b0b, #131314)
│   ├── vite.config.js
│   ├── public/
│   │   └── favicon.ico
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── index.css
│       ├── assets/                 # Icons and static media
│       ├── components/
│       │   ├── layout/
│       │   │   ├── ThreeColumnLayout.jsx
│       │   │   ├── Navbar.jsx
│       │   │   └── LatencyTracker.jsx
│       │   ├── editor/
│       │   │   ├── MonacoWrapper.jsx
│       │   │   ├── ActiveUserAvatars.jsx
│       │   │   └── OutputTerminal.jsx
│       │   ├── ai/
│       │   │   ├── ChatSidebar.jsx
│       │   │   └── RefactorSuggestions.jsx
│       │   └── common/
│       │       └── GlowButton.jsx
│       ├── hooks/
│       │   ├── useWebSockets.js
│       │   ├── useCRDT.js
│       │   └── useNetworkMetrics.js
│       ├── contexts/
│       │   ├── AuthContext.jsx
│       │   └── ThemeContext.jsx
│       ├── services/
│       │   ├── api.js              # Axios interceptors and REST calls
│       │   └── sseClient.js        # AI streaming connection
│       └── utils/
│           └── formatting.js
└── backend/
    ├── requirements.txt
    ├── alembic.ini
    ├── .env
    ├── alembic/
    │   ├── env.py
    │   └── versions/
    └── app/
        ├── main.py
        ├── core/
        │   ├── config.py           # Pydantic settings management
        │   └── security.py         # JWT and password hashing
        ├── api/
        │   ├── deps.py             # Dependency injection (db sessions, current_user)
        │   └── v1/
        │       ├── auth.py
        │       ├── rooms.py
        │       ├── execution.py    # Judge0 routing
        │       └── ai.py           # SSE stream routing
        ├── websockets/
        │   ├── connection_manager.py
        │   └── routes.py
        ├── services/
        │   ├── redis_pubsub.py
        │   ├── judge0_client.py
        │   └── llm_gateway.py
        ├── crud/
        │   ├── crud_user.py
        │   └── crud_room.py
        ├── models/                 # SQLAlchemy ORM definitions
        │   ├── user.py
        │   └── room.py
        ├── schemas/                # Pydantic models for validation
        │   ├── user.py
        │   └── room.py
        └── db/
            └── session.py          # Async asyncpg connection pool

```

---

### 3. COUPLING RATIONALE (THE "WHY")

| Directory/File | Technical Responsibility & Architecture Rationale |
| --- | --- |
| `docker-compose.yml` | Bootstraps Postgres, Redis, and optionally Judge0 containers to ensure identical dev and prod environments. |
| `frontend/tailwind.config.js` | Enforces the strict "Google AI Studio" design system, housing your `#0b0b0b` backgrounds and custom glow drop-shadows. |
| `frontend/src/components/layout/` | Isolates the rigid 3-column dashboard architecture so child components don't have to manage complex Flexbox/Grid behavior. |
| `frontend/src/hooks/useCRDT.js` | Abstracts the complex Yjs setup and binds it to React state, decoupling conflict resolution logic from the UI rendering layer. |
| `backend/app/websockets/connection_manager.py` | Maintains a singleton registry of active WebSocket connections, mapping users to rooms to prevent memory leaks and handle disconnects gracefully. |
| `backend/app/api/deps.py` | Utilizes FastAPI's dependency injection to seamlessly provide secure database sessions and authenticated user objects to route handlers. |
| `backend/app/services/redis_pubsub.py` | Acts as the distributed message broker, ensuring that if you scale the FastAPI backend to multiple workers, keystrokes still broadcast to users connected to different instances. |
| `backend/alembic/` | Tracks and versions all PostgreSQL database schema changes, a mandatory standard for production-grade data modeling. |
| `backend/app/services/llm_gateway.py` | Abstracts the specific AI provider (OpenAI/Gemini), wrapping their SDKs into asynchronous generators that yield chunks for SSE streaming. |

---

### 4. PHASE-WISE ROADMAP (5 PHASES)

#### Phase 1: Foundation & Scaffold (The Monorepo)

Establish the boilerplate, build tools, and underlying layout structure.

* **Files Created/Edited:**
* `docker-compose.yml` (Setup Postgres, Redis)
* `frontend/vite.config.js`, `frontend/tailwind.config.js`
* `frontend/src/components/layout/ThreeColumnLayout.jsx`
* `backend/requirements.txt`
* `backend/app/main.py`
* `backend/app/core/config.py`



#### Phase 2: Data Persistence & Authentication

Build the user layer, database connectivity, and secure routing.

* **Files Created/Edited:**
* `backend/app/db/session.py` (Async SQLAlchemy setup)
* `backend/app/models/user.py`, `backend/app/schemas/user.py`
* `backend/app/core/security.py`
* `backend/app/api/v1/auth.py`
* `backend/alembic/env.py` (Run initial migrations)
* `frontend/src/contexts/AuthContext.jsx`
* `frontend/src/services/api.js`



#### Phase 3: The Engine Layer (Sockets, CRDT, Editor)

The core value proposition: getting code to sync seamlessly between two browsers.

* **Files Created/Edited:**
* `backend/app/websockets/connection_manager.py`
* `backend/app/websockets/routes.py`
* `backend/app/services/redis_pubsub.py`
* `frontend/src/components/editor/MonacoWrapper.jsx`
* `frontend/src/hooks/useWebSockets.js`
* `frontend/src/hooks/useCRDT.js`



#### Phase 4: Code Sandboxing & Execution

Allowing users to actually run the code they are collaborating on.

* **Files Created/Edited:**
* `backend/app/services/judge0_client.py`
* `backend/app/api/v1/execution.py`
* `frontend/src/components/editor/OutputTerminal.jsx`
* `frontend/src/services/api.js` (Add execution endpoints)



#### Phase 5: AI Integration & Recruiter Polish

Adding the "Google AI Studio" aesthetic, the AI refactoring, and performance trackers.

* **Files Created/Edited:**
* `backend/app/services/llm_gateway.py`
* `backend/app/api/v1/ai.py`
* `frontend/src/services/sseClient.js`
* `frontend/src/components/ai/ChatSidebar.jsx`
* `frontend/src/components/layout/LatencyTracker.jsx`
* `frontend/src/components/editor/ActiveUserAvatars.jsx`
* `frontend/src/hooks/useNetworkMetrics.js`
