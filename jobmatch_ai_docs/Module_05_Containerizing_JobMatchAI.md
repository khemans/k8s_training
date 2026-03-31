## Module 5 – Containerizing `jobmatch_ai`

**Goal:** Ensure `jobmatch_ai` can run fully containerized and is ready to be deployed to k3s.

---

### Concepts

- **Container images, tags, registries**
  - Image: packaged filesystem + entrypoint.
  - Tag: version of the image (e.g. `jobmatch-api:dev`, `jobmatch-api:1.0.0`).
  - Registry: where images are stored (Docker Hub, GHCR, etc.).
- **12‑factor app principles**
  - Configuration via environment variables.
  - Logs to stdout/stderr.
  - Stateless containers; state in external services (DB, object storage).
- **Mapping `docker-compose` to Kubernetes**
  - Each service (`frontend`, `backend`, `worker`, `db`, `redis`) becomes:
    - Deployment/StatefulSet.
    - Service.
    - PVC (for stateful components like Postgres).

---

### Hands-on Labs

#### 5.1 – Review the existing architecture

- Open `JobMatchAI_PRD.md` and identify the components:
  - Frontend (React/Vite) – deployed to Vercel today.
  - Backend API (FastAPI).
  - ARQ worker (background jobs).
  - PostgreSQL (currently Railway).
  - Redis (currently Railway).
- Note which environment variables each component needs (see env vars section in the PRD).

#### 5.2 – Build Docker images

- In the `frontend/` directory:
  - Confirm or create a `Dockerfile` that:
    - Builds the Vite app.
    - Serves static files via a lightweight web server (e.g. nginx or `node:alpine` with a static server).

- In the `backend/` directory:
  - Confirm or create a `Dockerfile` that:
    - Installs Python dependencies from `requirements.txt`.
    - Runs FastAPI via a production server (e.g. `uvicorn`/`gunicorn`).
    - Can start either:
      - API service.
      - ARQ worker service.

- Build and test locally (either on your Windows machine with Docker Desktop or on a Linux VM):

  ```bash
  docker build -t jobmatch-frontend:dev ./frontend
  docker build -t jobmatch-backend:dev ./backend
  ```

- Run containers locally to confirm they start and respond as expected.

#### 5.3 – Publish images to a registry

- Choose a registry:
  - **GitHub Container Registry (GHCR)**, or
  - **Docker Hub**, or
  - A private homelab registry.

- Tag images appropriately, for example:

  ```bash
  docker tag jobmatch-frontend:dev <registry>/jobmatch-frontend:dev
  docker tag jobmatch-backend:dev <registry>/jobmatch-backend:dev
  ```

- Push them:

  ```bash
  docker push <registry>/jobmatch-frontend:dev
  docker push <registry>/jobmatch-backend:dev
  ```

- Ensure your k3s node can pull from that registry:
  - If private, configure imagePullSecrets or node-level auth.

---

### Completion Checklist

- [ ] You understand the `jobmatch_ai` component architecture from the PRD.
- [ ] You have working Docker images for the frontend and backend/worker.
- [ ] Images are published to a registry accessible by your k3s cluster.

