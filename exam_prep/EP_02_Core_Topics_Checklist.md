## EP-02 – Core Topics Checklist

**Goal:** Turn the exam blueprint into a concrete checklist you can tick off using your homelab.

> Tip: Tailor this to your chosen exam (CKA or CKAD) by adding/removing items.

---

### Workloads & Pod Design

- [ ] Create and modify Deployments, DaemonSets, and StatefulSets.
- [ ] Use Probes (liveness/readiness/startup) correctly.
- [ ] Configure environment variables from ConfigMaps and Secrets.
- [ ] Implement multi-container Pods (sidecar, ambassador, adapter).
- [ ] Use Jobs and CronJobs for batch workloads.

### Configuration & Security

- [ ] Create and mount ConfigMaps and Secrets as env vars and volumes.
- [ ] Understand RBAC basics: Roles, ClusterRoles, RoleBindings, ClusterRoleBindings.
- [ ] Use Service Accounts for pods.
- [ ] Apply PodSecurity (or Pod Security Standards) basics where relevant.

### Services & Networking

- [ ] Create and troubleshoot ClusterIP and NodePort Services.
- [ ] Use Ingress and understand how the IngressController routes traffic.
- [ ] Implement basic NetworkPolicies to allow/deny Pod traffic.

### Storage

- [ ] Inspect StorageClasses and PersistentVolumes.
- [ ] Create and use PersistentVolumeClaims.
- [ ] Understand how stateful apps like Postgres use PVCs.

### Cluster Architecture & Operations

- [ ] Understand the role of control plane components and nodes.
- [ ] Join and remove worker nodes (k3s agents).
- [ ] Upgrade the cluster (k3s) safely.

### Troubleshooting

- [ ] Use `kubectl describe` and `kubectl logs` to debug Pods.
- [ ] Diagnose scheduling issues (insufficient resources, taints, etc.).
- [ ] Identify and fix Service/Ingress misconfigurations.

Add or modify items as you compare this checklist with the official exam objectives.

