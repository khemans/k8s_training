## Module 1 – Single-Node k3s Cluster on ESXi

**Goal:** Deploy a single-node **k3s** cluster in a VM and connect to it from your Windows workstation (or your Docker-based `k8s-dev` shell).

---

### Concepts

- **k3s architecture**
  - `k3s server`: control plane + worker on a single node (for this module).
  - Optional `k3s agent` nodes (workers) will come later when you scale out.
- **kubeconfig**
  - File that tells `kubectl` how to authenticate and where to find the cluster API.
  - k3s stores it at `/etc/rancher/k3s/k3s.yaml` on the server node.
- **Core Kubernetes objects (at a high level)**
  - **Node**: a machine (VM or physical) in the cluster.
  - **Pod**: smallest deployable unit (containers + volumes + networking).
  - **Deployment**: manages Pods and rolling updates.
  - **Service**: stable DNS and virtual IP for accessing Pods.

---

### Hands-on Labs

#### 1.1 – Create the k3s master VM

- In ESXi, clone from your Ubuntu template or create a new VM with:
  - Name: `k3s-master-01`.
  - vCPU: **4** (more if you like).
  - RAM: **16–24 GB**.
  - Disk: **120 GB** or more on a suitable datastore.
- Install/boot Ubuntu and:
  - Configure a **static IP** or DHCP reservation.
  - Confirm SSH from your workstation:

    ```bash
    ssh <username>@<k3s-master-01-ip>
    ```

#### 1.2 – Install k3s

- On `k3s-master-01`, as a user with `sudo`:

  ```bash
  curl -sfL https://get.k3s.io | sh -
  ```

- After installation completes, verify:

  ```bash
  sudo k3s kubectl get nodes
  ```

- You should see `k3s-master-01` in state `Ready`.

#### 1.3 – Set up `kubectl` on Windows (and Docker dev shell)

- On the k3s node:

  ```bash
  sudo cat /etc/rancher/k3s/k3s.yaml
  ```

- Copy the contents to your Windows machine into a file such as:

  ```text
  C:\Users\<you>\.kube\config-k3s
  ```

- Edit that file and replace any `127.0.0.1` references with the **LAN IP** of `k3s-master-01`.
- In a PowerShell window (native use) or your Docker `k8s-dev` container (with `C:\Users\<you>\.kube` mounted to `/root/.kube` as in Module 0):

  ```powershell
  $env:KUBECONFIG="$HOME\.kube\config-k3s"
  kubectl get nodes
  ```

- Confirm that the node appears and is `Ready`.

#### 1.4 – First workload (nginx)

- Create a sandbox namespace and deploy nginx:

  ```bash
  kubectl create namespace sandbox
  kubectl -n sandbox create deployment nginx --image=nginx
  kubectl -n sandbox expose deployment nginx --port=80 --type=ClusterIP
  kubectl -n sandbox get pods,svc
  ```

- Test via port-forward from your workstation:

  ```bash
  kubectl -n sandbox port-forward deploy/nginx 8080:80
  ```

- Open your browser to:

```text
http://localhost:8080
```

You should see the default nginx welcome page.

---

### Completion Checklist

- [ ] `kubectl get nodes` works from your workstation (Windows or Docker `k8s-dev` shell) and shows `k3s-master-01` as `Ready`.
- [ ] You deployed an nginx Deployment and exposed it via a Service.
- [ ] You reached nginx from your browser using `kubectl port-forward`.

