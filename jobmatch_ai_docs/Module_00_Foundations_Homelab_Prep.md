## Module 0 – Foundations & Homelab Prep

**Goal:** Have a clear homelab plan, required tools installed, and a Git repo ready for GitOps.

---

### Concepts

- **Homelab patterns**
  - Single-node cluster: simpler to manage, fewer moving parts.
  - Multi-node cluster: more resilient and realistic, but more operational overhead.
- **Why k3s for homelab**
  - Lightweight Kubernetes distribution from Rancher.
  - Includes an embedded datastore and Ingress controller by default.
  - Great fit for low-friction homelab setups.
- **Why FluxCD + Kustomize**
  - **FluxCD**: implements GitOps – the cluster pulls configuration from Git on a loop.
  - **Kustomize**: manages Kubernetes YAML with bases/overlays, no custom templating language.

---

### Hands-on Labs

#### 0.1 – Confirm homelab hardware and hypervisor

- Use your **Dell PowerEdge R620** with **ESXi 6.x** as the base.
- Ensure:
  - ESXi host has a **management IP** reachable from your Windows workstation.
  - You can log in to the ESXi web/desktop UI and see the host’s CPU/RAM/datastores.

#### 0.2 – Create a base Ubuntu template (optional but recommended)

- Download **Ubuntu Server 22.04 LTS** ISO (or 20.04 if 22.04 is problematic on ESXi 6.x).
- In ESXi:
  - Create a VM:
    - 2 vCPU.
    - 4–8 GB RAM.
    - 40–60 GB disk on your preferred datastore.
  - Attach the Ubuntu ISO and install:
    - Minimal installation.
    - Enable **OpenSSH server** during setup.
  - After installation:
    - Confirm you can SSH from Windows:

      ```bash
      ssh <username>@<vm-ip>
      ```

  - (Optional) Turn this VM into a **template** for easy cloning (or use linked clones/snapshots).

#### 0.3 – Developer workstation setup (Windows + Docker Desktop)

You can keep your developer tooling inside a Docker container so your host stays clean while still editing files from Windows.

##### Option A (recommended): Containerized CLI workstation

- Prereqs on Windows:
  - Install **Docker Desktop** and ensure Linux containers are enabled.
  - Keep **Cursor** on Windows for editing.
  - Ensure your project folder exists (for example `e:\working`).

- Pull a base image and start a reusable shell container:

  ```powershell
  docker pull ubuntu:22.04
  docker run --name k8s-dev -it --rm `
    -v e:\working:/workspace `
    -v $env:USERPROFILE\.kube:/root/.kube `
    -w /workspace `
    ubuntu:22.04 bash
  ```

- Inside the container, install core tooling:

  ```bash
  apt-get update && apt-get install -y curl git ca-certificates
  curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
  install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl
  kubectl version --client
  git --version
  ```

- Optional tools inside the same container:
  - **helm**:

    ```bash
    curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
    helm version
    ```

  - **flux** CLI:

    ```bash
    curl -s https://fluxcd.io/install.sh | bash
    flux --version
    ```

- Verify kube access from container:

  ```bash
  kubectl config get-contexts
  kubectl get nodes
  ```

If `kubectl get nodes` fails, check that your kubeconfig in `C:\Users\<you>\.kube\config` points to a reachable cluster IP (not localhost from inside the container).

##### Option B: Native tools on Windows (simpler, less isolated)

- Install **kubectl** (Kubernetes releases or Chocolatey) and verify:

  ```powershell
  kubectl version --client
  ```

- Install **git** if needed.
- Optional: install **helm** and **flux** CLI directly on Windows.

#### 0.4 – Create a Git repository for GitOps config

- On your Windows machine, under `e:\working`:
  - Create a folder for cluster configuration, for example:

    ```text
    e:\working\k8s_gitops
    ```

  - Initialize a Git repository:

    ```bash
    cd e:\working\k8s_gitops
    git init
    ```

  - Create a simple `README.md` noting that this repo will hold:
    - Cluster configuration (Flux, monitoring, etc.).
    - Application configuration for `jobmatch_ai` (Kustomize bases/overlays).

Later, you will push this repo to GitHub or GitLab so Flux can read from it.

---

### Completion Checklist

- [ ] ESXi host is reachable from your workstation and you can log in.
- [ ] At least one Ubuntu VM (or template) exists and is reachable via SSH.
- [ ] `kubectl` and `git` are installed and working (either in your Docker workstation container or natively on Windows).
- [ ] A local Git repo for cluster configuration (`k8s_gitops` or similar) is initialized.

