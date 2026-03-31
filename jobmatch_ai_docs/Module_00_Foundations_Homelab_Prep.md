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

#### 0.3 – Developer workstation setup (Windows)

- Install **kubectl**:
  - Download from Kubernetes releases or via a package manager (e.g. Chocolatey).
  - Verify:

    ```powershell
    kubectl version --client
    ```

- Install **git** (if not already installed).
- Ensure you have:
  - **Windows Terminal** (or equivalent).
  - **Cursor** as your main editor.
- (Optional, but will be needed later):
  - Install **helm**.
  - Install **flux** CLI.

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
- [ ] `kubectl` and `git` are installed and working on Windows.
- [ ] A local Git repo for cluster configuration (`k8s_gitops` or similar) is initialized.

