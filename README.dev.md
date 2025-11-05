# Dev mode with hot reload

Run all services with live reload and bind mounts for faster iteration on Windows.

## Start (dev override)

```powershell
# From project root
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

- backend: uvicorn --reload (watchfiles; polling enabled for Windows)
- frontend: Vite dev server (chokidar polling)
- ai: uvicorn --reload

Volumes
- backend: mounts `backend/app` and persists `backend/app/storage` → served at `/files`
- frontend: mounts `frontend/`
- ai: mounts `ai/`

## Stop

```powershell
docker compose down
```

## Troubleshooting
- Code changes not reflected: start compose from repo root so bind mounts apply.
- Backend not reloading: check logs for "Detected change... reloading".
- Frontend not reloading: hard refresh (Ctrl+F5). On Windows, polling is enabled (CHOKIDAR_USEPOLLING).
- Instagram uploads fail in dev: ensure BACKEND_URL is public HTTPS (use ngrok) so Graph API can fetch files.

## Optional: faster demo timings
To make auto-replies and IG publishing feel snappier in demos, you can tune these env vars in `env/backend.dev`:

- AUTO_REPLY_INTERVAL_SECONDS=30  → run the auto-reply scheduler every 30s
- IG_POLL_INTERVAL_SECONDS=0.5    → poll media container readiness every 0.5s
- IG_POLL_MAX_ATTEMPTS=40         → allow up to ~20s total wait at 0.5s cadence
- IG_PUBLISH_RETRY_SLEEP=0.5      → wait 0.5s before the one-time publish retry

Defaults remain conservative in code (1s poll, 20 attempts, 2s retry, 300s scheduler) if you omit these.
