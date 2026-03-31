## EP-03 – Practice Labs in Your Cluster

**Goal:** Use your existing k3s homelab to run short, exam-style tasks that you can time and repeat.

> Idea: Later, you can package these labs into a dedicated `exam-labs` namespace or Pod that serves tasks via a simple web UI or CLI script.

---

### Lab Structure

Each lab is meant to be:

- **Time-boxed** (e.g. 10–20 minutes).
- **Self-contained** (can be done in `sandbox` or `exam-labs` namespace).
- **Repeatable** (you can reset the namespace and run again).

---

### Sample Labs (you can expand this list)

#### Lab 1 – Pod & Deployment Basics (10–15 min)

- Create a namespace `exam-labs`.
- Create a Deployment `web-deploy` with 3 replicas of an nginx container.
- Expose it with a ClusterIP Service `web-svc` on port 80.
- Verify all Pods are ready and reachable via the Service.

#### Lab 2 – Config & Secrets (15–20 min)

- In `exam-labs`:
  - Create a ConfigMap with a couple of configuration values.
  - Create a Secret with a fake database password.
- Update a Deployment to:
  - Read config values via env vars from the ConfigMap.
  - Read the password from the Secret and print it to logs on startup.
- Verify configuration is present inside the container.

#### Lab 3 – Probes & Rollouts (15–20 min)

- Create a Deployment with:
  - A readiness probe and a liveness probe.
  - A deliberate misconfiguration in one of them.
- Observe failures, then fix the probe configuration.
- Trigger a rolling update (e.g. change image tag) and watch it progress.

#### Lab 4 – Ingress & TLS (20–25 min)

- Create an Ingress for a simple web app in `exam-labs`.
- Point a new host (e.g. `labs.local`) to the k3s master IP.
- If `cert-manager` is installed:
  - Add annotations and TLS settings.
  - Confirm HTTPS works.

#### Lab 5 – Storage (20–25 min)

- Create a PVC requesting storage from the default StorageClass.
- Run a Pod that mounts the PVC and writes data to a file.
- Delete the Pod and create a new Pod reusing the same PVC.
- Confirm the data persists.

You can extend this file over time with more labs (RBAC, NetworkPolicies, Jobs/CronJobs, node maintenance).

