## Module 4 – FluxCD & GitOps Workflow

**Goal:** Let the **cluster pull configuration from Git** using FluxCD, instead of you pushing YAML manually.

---

### Concepts

- **FluxCD controllers**
  - `GitRepository`: points Flux at a Git repo/branch/path.
  - `Kustomization`: tells Flux what to apply from that source.
- **GitOps workflow**
  - Make a change to manifests in Git.
  - Commit and push.
  - Flux detects the change and reconciles the cluster state to match Git.

---

### Hands-on Labs

#### 4.1 – Install Flux CLI

- On Windows, install the Flux CLI (e.g. via Chocolatey or manual download).
- Verify:

  ```bash
  flux --version
  ```

#### 4.2 – Host your GitOps repo remotely

- Create a remote repo on GitHub or GitLab for your GitOps repo (`k8s_gitops`).
- Add it as a remote and push your current content:

  ```bash
  git remote add origin <remote-url>
  git push -u origin main
  ```

#### 4.3 – Bootstrap Flux into k3s

- From your workstation, with `KUBECONFIG` pointing at your k3s cluster:

  ```bash
  flux bootstrap github `
    --owner=<your-github-username> `
    --repository=<gitops-repo-name> `
    --branch=main `
    --path=./clusters/homelab `
    --personal
  ```

- Verify Flux components:

  ```bash
  kubectl get pods -n flux-system
  ```

You should see several Flux controller pods in `Running` state.

#### 4.4 – Wire an app via Flux

- In your GitOps repo, under `clusters/homelab`, define:
  - A `GitRepository` referencing your repo.
  - A `Kustomization` that applies `apps/nginx-demo/overlays/dev`.

- Commit and push these changes.

- Watch Flux reconcile:

  ```bash
  flux get sources git
  flux get kustomizations
  kubectl get deployments -A
  ```

- Edit the `nginx-demo` dev overlay in Git (e.g. change replica count), commit, and push again.
- Confirm Flux updates the Deployment in the cluster without any `kubectl apply` from you.

---

### Completion Checklist

- [ ] Your GitOps repo is hosted on GitHub/GitLab and reachable by Flux.
- [ ] Flux controllers are running in the cluster (`flux-system` namespace).
- [ ] At least one app (`nginx-demo`) is managed via Flux using a `GitRepository` + `Kustomization`.
- [ ] Changes to manifests in Git automatically appear in the cluster.

