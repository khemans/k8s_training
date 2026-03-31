## Module 8 – Observability & Operations

**Goal:** Gain visibility into cluster and app health (logs, metrics, dashboards) so you can operate `jobmatch_ai` confidently.

---

### Concepts

- **Logs**
  - `kubectl logs` for quick inspection.
  - Centralized logging stacks (e.g. Loki, ELK) for long-term storage/search.
- **Metrics**
  - Resource metrics (CPU, memory) and Kubernetes object metrics.
  - Application-level metrics if exposed (e.g. Prometheus format).
- **Dashboards and alerting**
  - Grafana for visualizing metrics.
  - Alerts based on thresholds (e.g. error rate, pod restarts).

---

### Hands-on Labs

#### 8.1 – Troubleshooting with `kubectl`

- Practice basic troubleshooting commands on your `jobmatch` namespace:

  ```bash
  kubectl -n jobmatch get pods
  kubectl -n jobmatch describe pod <pod-name>
  kubectl -n jobmatch logs <pod-name>
  ```

- Try:
  - Viewing logs for the API and worker.
  - Checking events and reasons for pod restarts.

#### 8.2 – Install a monitoring stack

- Use Helm or Flux to deploy a monitoring stack such as `kube-prometheus-stack`:
  - Includes Prometheus, Alertmanager, and Grafana.
  - Typically installed into a `monitoring` namespace.

- After installation:
  - Confirm pods:

    ```bash
    kubectl -n monitoring get pods
    ```

  - Expose Grafana with an Ingress and log in via a browser.

#### 8.3 – Create basic dashboards

- In Grafana:
  - Import pre-built Kubernetes cluster dashboards.
  - Verify you can see:
    - Node and pod CPU/memory usage.
    - Pod restarts and status.

- If `jobmatch_ai` exposes custom metrics:
  - Add dashboards to show:
    - API request rate.
    - Error rate (4xx/5xx).
    - Worker queue depth (if available).

---

### Completion Checklist

- [ ] You can use `kubectl describe` and `kubectl logs` to investigate issues.
- [ ] A monitoring stack (Prometheus + Grafana or similar) is deployed and reachable.
- [ ] You have at least one Grafana dashboard showing cluster health and `jobmatch_ai` status.

