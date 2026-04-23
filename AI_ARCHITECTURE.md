# ZeroG PWA — AI Architecture Guardrails

## FRONTEND STACK
This is a **Vite/React PWA**. Do NOT use React Native or Expo.
- Framework: Vite + React + TypeScript
- Routing: React (no React Native Navigation, no Expo Router)
- Styling: Vanilla CSS per-screen (e.g., `ChatScreen.css`)
- Build output: `dist/` via `vite build`

## CI/CD PIPELINE
- All deployments go to the **`master` branch** to trigger the **`zerog-pwa` Codemagic pipeline**
- Do NOT push to `main` for production — `main` does not trigger any CI/CD
- Codemagic project: `zerog-pwa` at `https://codemagic.io/app/69e95bd5e32b1742c5683109`
- Repo: `https://github.com/theanxioustrader/zerog-pwa`

## BACKEND STACK
- Local bridge: Node.js (`C:\Users\akiva\MCSL\zerog-local-agent\cdp-bridge.ts`)
- Memory rules: no zombie WebSockets, explicit HTTP timeout `req.destroy()`, EBUSY file lock resilience
- True backend absolute path: `C:\Users\akiva\MCSL\zerog-local-agent\`

## FILE WRITING
- Always verify absolute paths before writing to disk
- True backend path: `C:\Users\akiva\MCSL\zerog-local-agent\`
- True PWA path: `C:\Users\akiva\ZeroG\zerog-pwa\`
- Do NOT write to `C:\Users\akiva\MCSL\zerog-mobile\` or `C:\Users\akiva\ZeroG\zerog-mobile\` — decoy directories

## KEY FILES
- WebSocket hook: `src/hooks/useSSE.ts`
- Chat UI: `src/screens/ChatScreen.tsx`
- Approvals UI: `src/screens/ApprovalsScreen.tsx`
- API layer: `src/services/api.ts`
