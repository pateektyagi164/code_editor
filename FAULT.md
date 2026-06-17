
# System Role
You are an expert Senior Full-Stack Developer, Distributed Systems Architect, and UI/UX Specialist. Your objective is to fix a series of critical bugs and implement missing standard features in a React + FastAPI real-time collaborative code editor powered by Yjs/WebSockets.

# Mission Objective
The application is currently failing to maintain real-time state across multiple files, losing data on disconnect, crashing on empty states, and failing basic UX/routing standards. Please tackle the following 4 Epics sequentially. Analyze the root cause before writing code, and provide complete, copy-pasteable updates for the affected files.

---

## Epic 1: Real-Time Sync & CRDT Persistence (Critical Data Integrity)
* **1.1 Global Real-Time Sync (The "CodeSandbox" Model):** Currently, users must manually reload the page to see changes made by others in different files. The WebSocket/Yjs implementation must be upgraded to sync the *entire* file tree and all active editor buffers in real-time, not just the initial load.
* **1.2 Multiplayer Presence & Cursors (The "Figma/Google Docs" Model):** There is no visual indicator of who is working on what. Implement `y-protocols/awareness` to show floating, colored name tags above remote user cursors in the editor. Also, add UI indicators on the file tree showing which user is currently editing which file.
* **1.3 Auto-Save & Data Persistence (The "Google Docs" Model):** When all users close the workspace, all changes are lost. Implement a backend persistence layer (e.g., saving the Yjs state vector to PostgreSQL or Redis periodically and on disconnect) so workspaces auto-save and rehydrate perfectly when reopened.
 * **1.4 Vite WebSocket Disconnects:** The frontend console is flooding with `ws proxy socket error: Error: read ECONNRESET`. This indicates the Vite development proxy (`vite.config.js`) is dropping WebSocket connections ungracefully, or the FastAPI backend is not handling TCP keep-alives/ping-pongs properly. Stabilize the WebSocket proxy configuration to silence these errors.

## Epic 2: Authentication Routing & Deep Linking (High Severity)
* **2.1 The "Lost Invite" Bug:** If a user clicks a shared workspace link but is unauthenticated, they are forced to log in. After logging in, they are incorrectly redirected to the default dashboard instead of the shared workspace. Implement proper `next` URL parameter tracking in the OAuth flow so deep-links survive the authentication redirect.

## Epic 3: UI/UX & State Management (Medium Severity)
* **3.1 Profile Dropdown Refinement (The "Google Workspace" Model):** The top-right profile menu is unresponsive. Implement a fully functional dropdown that includes:
    * A "Sign Out" button (clears cookies/storage and redirects to login).
    * An "Add another account" or "Login with different account" option.
    * A "Click Outside" hook: The dropdown menu must automatically close if the user clicks anywhere else on the screen.
* **3.2 The "Empty State" Crash:** Deleting all files and folders, and then attempting to create a new one, causes a black screen (app crash). This indicates an unhandled null/undefined reference when the file tree array/object is empty. Add proper null checks and an empty-state UI fallback.

**Execution Rules:**
Acknowledge these tasks. Start by providing the architectural plan to fix **Epic 1 (Real-Time Sync & CRDT Persistence)**, as that requires the heaviest structural changes to the Yjs implementation and backend storage. Do not move to Epic 2 until Epic 1 is fully resolved.