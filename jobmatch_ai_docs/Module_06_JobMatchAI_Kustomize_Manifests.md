## Module 6 – `jobmatch_ai` Manifests with Kustomize

**Goal:** Model `jobmatch_ai` as Kubernetes resources with Kustomize bases and overlays, ready for GitOps.

---

### Concepts

- **Multi-service application**
  - Separate Deployments for:
    - API.
    - Worker.
    - Frontend.
  - Separate Services for:
    - API (ClusterIP).
    - Frontend (ClusterIP, fronted by Ingress).
- **Configuration management**
  - Map non-sensitive env vars to `ConfigMap`.
  - Map sensitive env vars to `Secret`.
- **Reusing images**
  - Use the same backend image for:
    - API (command: `uvicorn`/`gunicorn`).
    - Worker (command: ARQ worker entrypoint).

---

### Hands-on Labs

#### 6.1 – Define base resources

- In your GitOps repo, create:

```text
apps/
  jobmatch/
    base/
      kustomization.yaml
      deployment-api.yaml
      deployment-worker.yaml
      deployment-frontend.yaml
      service-api.yaml
      service-frontend.yaml
      configmap-env.yaml
      secret-env.yaml
      ingress.yaml
```

- Base expectations:
  - `deployment-api.yaml`:
    - Uses the backend image.
    - Exposes the FastAPI port.
    - Uses env vars from `configmap-env` and `secret-env`.
  - `deployment-worker.yaml`:
    - Uses the same backend image.
    - Different command/args for ARQ worker.
  - `deployment-frontend.yaml`:
    - Uses the frontend image.
    - Serves static assets.
  - `service-api.yaml` and `service-frontend.yaml`:
    - ClusterIP Services mapping to the appropriate ports.
  - `ingress.yaml`:
    - Routes a host like `jobmatch.local` to the frontend Service.
    - Optionally, exposes API under `/api` path.

#### 6.2 – Overlays for dev and prod

- Create overlays:

```text
apps/
  jobmatch/
    overlays/
      dev/
        kustomization.yaml
        patch-api-resources.yaml
        patch-frontend-resources.yaml
      prod/
        kustomization.yaml
        patch-api-resources.yaml
        patch-frontend-resources.yaml
```

- In **dev** overlay:
  - Lower resource requests/limits.
  - Set `replicas: 1` for each Deployment.
  - Optionally use dev DB/Redis endpoints.

- In **prod** overlay:
  - Higher replicas (e.g. 2–3) for API and frontend.
  - Tuned resource requests/limits.
  - Optionally define an HPA for API.

#### 6.3 – Local dev deployment (manual apply)

- For the first run, apply dev overlay directly:

  ```bash
  kubectl apply -k apps/jobmatch/overlays/dev
  ```

- Verify:
  - Pods are running in the `jobmatch` namespace:

    ```bash
    kubectl -n jobmatch get pods
    ```

  - Services and Ingress:

    ```bash
    kubectl -n jobmatch get svc
    kubectl get ingress -A
    ```

- Confirm you can reach the app via the Ingress host you defined.

#### 6.4 – GitOps integration

- Add a Flux `Kustomization` under `clusters/homelab` that tracks `apps/jobmatch/overlays/dev`.
- Commit and push the change.
- Remove manual applies; allow Flux to reconcile changes going forward.

---

### Completion Checklist

- [ ] `jobmatch_ai` is running on your k3s cluster from Kustomize manifests.
- [ ] All `jobmatch_ai` Kubernetes configuration lives in your GitOps repo.
- [ ] You understand how to adjust resources and replicas via overlays.

