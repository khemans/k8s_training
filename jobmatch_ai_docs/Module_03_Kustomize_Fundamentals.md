## Module 3 – Kustomize Fundamentals

**Goal:** Use **Kustomize** to manage Kubernetes manifests and environment overlays (dev vs prod) in a Git-friendly way.

---

### Concepts

- **`kustomization.yaml`**
  - Acts as an index of resources and patches.
  - Built into `kubectl` (`kubectl apply -k`).
- **Base vs overlay**
  - **Base**: common manifests shared across environments.
  - **Overlay**: environment-specific changes (replicas, env vars, image tags).
- **Patch types**
  - Strategic merge patches (YAML).
  - JSON patches (RFC 6902).

---

### Hands-on Labs

#### 3.1 – Create Kustomize directory structure

- In your GitOps repo (e.g. `e:\working\k8s_gitops`), create:

```text
apps/
  nginx-demo/
    base/
      kustomization.yaml
      deployment.yaml
      service.yaml
    overlays/
      dev/
        kustomization.yaml
        patch-deployment.yaml
      prod/
        kustomization.yaml
        patch-deployment.yaml
```

#### 3.2 – Base manifests

- In `apps/nginx-demo/base`:
  - `deployment.yaml`: nginx Deployment with `replicas: 1` and a simple label.
  - `service.yaml`: ClusterIP Service pointing to the Deployment.
  - `kustomization.yaml`:
    - References `deployment.yaml` and `service.yaml`.

#### 3.3 – Overlays for dev and prod

- In `apps/nginx-demo/overlays/dev`:
  - `kustomization.yaml`:
    - `resources: ["../../base"]`.
    - `patches` section referencing `patch-deployment.yaml`.
  - `patch-deployment.yaml`:
    - Sets `replicas: 1`.
    - Adds a label or env var `ENV=dev`.

- In `apps/nginx-demo/overlays/prod`:
  - Similar `kustomization.yaml` referencing base.
  - `patch-deployment.yaml`:
    - Sets `replicas: 3`.
    - Adds a label or env var `ENV=prod`.

#### 3.4 – Applying with Kustomize

- From the root of your GitOps repo:

  ```bash
  kubectl apply -k apps/nginx-demo/overlays/dev
  kubectl get deployments -A
  ```

- Then switch to prod:

  ```bash
  kubectl apply -k apps/nginx-demo/overlays/prod
  kubectl get deployments -A
  ```

- Observe how the replica count and labels change between dev and prod overlays.

---

### Completion Checklist

- [ ] You have a working Kustomize base and dev/prod overlays for `nginx-demo`.
- [ ] You can apply different overlays with `kubectl apply -k`.
- [ ] You understand how to use patches to vary configuration per environment.

