## EP-04 – Full Practice Exam Scenario

**Goal:** Simulate a short, end-to-end Kubernetes exam using your homelab environment.

> Recommended: Attempt this only after you are comfortable with the labs in `EP_03_Practice_Labs_In_Cluster.md`.

---

### Setup Idea – Dedicated Exam Pod/Namespace

Later, you can:

- Create an `exam` namespace.
- Run a simple “exam controller” Pod (even just a small script or web app) that:
  - Lists tasks.
  - Provides starting manifests.
  - Validates certain answers (optional).

For now, you can run tasks directly with `kubectl` and a text file of questions.

---

### Practice Exam (Example – ~60–90 minutes)

Attempt these tasks **in order, without looking up solutions**, and time yourself.

1. **Cluster & Namespace Setup**
   - Verify cluster health.
   - Create namespaces: `exam-apps`, `exam-ops`.

2. **Deploy a Multi-Tier App**
   - In `exam-apps`, deploy:
     - A backend API Deployment with 2 replicas.
     - A frontend Deployment with 2 replicas.
   - Expose the backend via a ClusterIP Service.
   - Expose the frontend via an Ingress at `exam.local`.

3. **Configuration & Secrets**
   - Add a ConfigMap for the backend with at least two config values.
   - Add a Secret for a database password.
   - Wire both into the backend Deployment (env vars or volume).

4. **Probes & Rollouts**
   - Add readiness and liveness probes to the backend Deployment.
   - Trigger a rolling update of the backend (e.g. image tag change).
   - Ensure zero downtime (no failed Pods in final state).

5. **Job & CronJob**
   - In `exam-ops`, create:
     - A one-off Job that prints a message and exits successfully.
     - A CronJob that runs every 5 minutes and logs a timestamp.

6. **Storage**
   - Create a PVC and a Pod that:
     - Mounts the PVC.
     - Writes a file to the mounted path.
   - Confirm data persistence by recreating the Pod.

7. **RBAC & NetworkPolicy**
   - Create a ServiceAccount for an “app maintainer” in `exam-apps`.
   - Bind permissions so it can manage Deployments but not Nodes.
   - Create a NetworkPolicy that:
     - Allows inbound traffic to the backend only from the frontend Pods.

8. **Troubleshooting**
   - Intentionally break one resource (e.g. wrong image, wrong label).
   - Use `kubectl describe` and `kubectl logs` to find and fix the problem.

After you’re done, review which tasks took the longest and where you had to look things up. Use that feedback to refine your study plan and add more focused labs.

