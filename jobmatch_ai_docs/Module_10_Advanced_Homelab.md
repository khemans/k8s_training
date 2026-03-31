## Module 10 – Advanced Homelab Topics (Optional)

**Goal:** Harden and scale your homelab cluster beyond the basics.

---

### Concepts

- **Multi-node k3s**
  - One `k3s server` node (control plane).
  - One or more `k3s agent` nodes (workers).
  - Join tokens and cluster networking requirements.
- **Node labels, taints, and affinities**
  - Labels: key/value tags to target specific nodes.
  - Taints: repel pods unless they tolerate the taint.
  - Affinities: scheduling preferences/requirements.
- **Network policies and RBAC**
  - NetworkPolicy: restricts traffic between Pods/namespaces.
  - RBAC: controls who/what can perform Kubernetes API actions.

---

### Hands-on Labs

#### 10.1 – Add worker nodes

- In ESXi, create 1–2 additional Ubuntu VMs with:
  - 4 vCPU.
  - 16–24 GB RAM.
  - 80–120 GB disk.

- On each worker VM, install `k3s agent` and join it to the server using the token and server URL from the master node.

- Verify from your usual shell:

  ```bash
  kubectl get nodes
  ```

- Use node labels to guide scheduling:

  ```bash
  kubectl label node <node-name> role=db
  kubectl label node <node-name> role=app
  ```

#### 10.2 – Network policies

- In the `jobmatch` namespace, define NetworkPolicies to:
  - Allow Postgres traffic only from API Pods.
  - Restrict Redis access to API and worker Pods.

- Apply policies and validate:
  - Confirm allowed traffic still works.
  - Confirm blocked traffic (e.g. from unrelated Pods) fails.

#### 10.3 – Resource tuning and autoscaling

- Configure resource requests/limits for API and frontend Deployments.
- Set up a Horizontal Pod Autoscaler (HPA) for the API:

  ```bash
  kubectl autoscale deployment jobmatch-api \
    --cpu-percent=80 --min=1 --max=5 -n jobmatch
  ```

- Generate load (even simple curl loops) and observe:
  - HPA metrics.
  - Changes in replica count.

---

### Completion Checklist

- [ ] Your k3s cluster runs across multiple VMs.
- [ ] Network policies restrict communication to what `jobmatch_ai` actually needs.
- [ ] You have experimented with HPA and resource tuning for performance and resilience.

