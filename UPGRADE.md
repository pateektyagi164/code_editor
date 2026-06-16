# MASTER EXECUTION SPECIFICATION: REAL-TIME WEB IDE

**ROLE:** You are an Expert Staff Full-Stack Systems Architect. Your objective is to upgrade our React/FastAPI collaborative code editor from a hardcoded single-file prototype into a production-grade, multi-file, multi-language, real-time IDE. 

**TECH STACK & CONSTRAINTS:**
- Frontend: React, Tailwind CSS, Monaco Editor, Yjs.
- Backend: FastAPI, WebSockets, PostgreSQL, Redis, Judge0, Google Gemini API.
- Aesthetic: Strictly maintain the "Google AI Studio" design system. Use deep slate/charcoal backgrounds (`#0b0b0b`, `#131314`), highly polished minimal borders, and subtle glow accents.

Execute the following architectural upgrades. Do not skip steps. Ensure compilation passes after every phase.

---

## PHASE 1: DYNAMIC ROOMS & SESSION ROUTING
**Goal:** Move from a hardcoded `room/default` to a secure, shareable session model.

1.  **Backend (`backend/app/api/v1/rooms.py`):** Create a `POST /rooms` endpoint that generates a secure UUID, saves the room state in PostgreSQL, and returns the ID.
2.  **Backend (`backend/app/websockets/routes.py`):** Update the WebSocket router to accept a dynamic path parameter: `@router.websocket("/ws/room/{room_id}")`. Ensure `connection_manager.py` groups connections strictly by this `room_id`.
3.  **Frontend Routing (`frontend/src/App.jsx`):** Implement React Router. 
    * `/`: Dashboard layout with a glowing "Create New Workspace" button hitting `POST /rooms`.
    * `/:roomId`: The main IDE layout.
4.  **Invite UI (`frontend/src/components/layout/Navbar.jsx`):** Add a sleek "Share Workspace" button. On click, execute `navigator.clipboard.writeText(window.location.href)` and trigger a temporary "Link Copied!" toast notification.

---

## PHASE 2: MULTI-LANGUAGE & JUDGE0 EXECUTION ENGINE
**Goal:** Allow users to dynamically switch languages and execute them securely.

1.  **Language State (`frontend/src/components/editor/MonacoWrapper.jsx`):** * Create `const [languageId, setLanguageId] = useState(71) // Default Python`.
    * Create a dropdown mapping dictionary for Judge0 IDs (e.g., Python: 71, Node.js: 93, C++: 54, Java: 91, Rust: 73).
2.  **Editor Binding:** Pass the resolved language string (e.g., "python", "cpp") to the Monaco `<Editor language={resolvedLang} />` prop so syntax highlighting updates immediately.
3.  **Execution Hook (`frontend/src/App.jsx` & `services/api.js`):** Modify the `runCode(code, language_id)` payload. When the user clicks the `Run ▶` terminal button, it must pass the dynamic `languageId` state, not a hardcoded value.

---

## PHASE 3: VIRTUAL FILE SYSTEM & MULTI-FILE SYNC
**Goal:** Replace the static sidebar with a dynamic, stateful file tree backed by Yjs.

1.  **File Tree State (`frontend/src/App.jsx`):** Implement a robust client state:
    ```javascript
    const [fileTree, setFileTree] = useState([{ id: "uuid-1", name: "main.py", languageId: 71 }]);
    const [activeFileId, setActiveFileId] = useState("uuid-1");
    ```
2.  **UI Controls (`frontend/src/components/layout/Sidebar.jsx`):** Build a file tree explorer with `+ File` and `+ Folder` icons. Implement inline renaming.
3.  **Yjs Multi-File Architecture (`frontend/src/hooks/useCRDT.js`):** *CRITICAL STEP.* Do not use a single global `Y.Text`. 
    * Initialize a root `Y.Doc()`.
    * Create a `Y.Map('workspace_files')` within the doc.
    * For every file in the tree, instantiate a nested `Y.Text` inside that map, keyed by the `fileId`.
    * When `activeFileId` changes, seamlessly unbind the Monaco editor from the previous `Y.Text` and bind it to the newly selected `Y.Text` using `MonacoBinding`. This ensures background files sync even when not actively viewed.

---

## PHASE 4: LOCAL INGESTION & EXPORT (ADVANCED)
**Goal:** Allow users to upload local projects into the web IDE sandbox.

1.  **Folder Upload:** Add a hidden `<input type="file" webkitdirectory directory multiple />` triggered by an "Import Project" sidebar button.
2.  **State Hydration:** Traverse the uploaded `FileList` object. For every text-based file, create a new entry in the `fileTree` state, read the content using `FileReader`, and initialize a corresponding `Y.Text` in the Yjs map with that content.
3.  **Project Export:** Implement a "Download Workspace" button. Iterate through the `Y.Map('workspace_files')`, extract the string values, and package them into a downloaded zip file using `jszip`.

---

## PHASE 5: PRESENCE & TELEMETRY (RECRUITER POLISH)
**Goal:** Add real-time visual proof of the distributed systems architecture.

1.  **Cursor Awareness (`frontend/src/components/editor/MonacoWrapper.jsx`):** Implement the `y-protocols/awareness` module. Broadcast user names, cursor positions, and a randomly assigned hex color (matching the dark theme palette). Ensure Monaco renders remote cursors natively.
2.  **Active Avatars (`Navbar.jsx`):** Read the Yjs awareness state to render a horizontal stack of rounded, overlapping avatars representing currently connected users.
3.  **Latency Tracker (`frontend/src/hooks/useNetworkMetrics.js`):** Send a ping frame over the WebSocket every 2.5 seconds. Calculate RTT (Round Trip Time). Display it in the Navbar (`< 50ms`: Green, `50-150ms`: Yellow, `> 150ms`: Red).

---

## PHASE 6: CONTEXT-AWARE AI INTEGRATION
**Goal:** Ensure the AI Assistant evaluates the correct code state.

1.  **Context Pipeline (`frontend/src/components/ai/ChatSidebar.jsx`):** When the user asks a question (e.g., "Find bugs"), the frontend must pull the exact text from the *currently active* `Y.Text` document, not stale local React state.
2.  **SSE Streaming (`backend/app/services/llm_gateway.py`):** Ensure the Gemini API payload includes the current file name, the detected language, and the code string. Stream the markdown response back via Server-Sent Events (SSE) to achieve a smooth, zero-lag typewriter effect in the sidebar.

**EXECUTION COMMAND:** Begin by executing Phase 1 and Phase 2. Provide the updated file contents for `App.jsx`, `api.js`, `rooms.py`, and `routes.py`.