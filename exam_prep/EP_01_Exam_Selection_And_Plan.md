## EP-01 – Exam Selection & Study Plan

**Goal:** Decide which Kubernetes exam to target first and create a concrete study plan that builds on your homelab work.

---

### 1. Choose Your First Exam

Most people start with one of:

- **CKA – Certified Kubernetes Administrator**
  - Focus: cluster admin, upgrades, RBAC, networking, storage, troubleshooting.
  - Best fit if you enjoy platform/ops and your homelab work (k3s, Flux, monitoring) is central.

- **CKAD – Certified Kubernetes Application Developer**
  - Focus: Pod design, deployments, probes, config, multi-container patterns, jobs/cronjobs.
  - Best fit if you’re more focused on building and shipping apps on Kubernetes.

**Suggestion:** Given your goal of running and operating a homelab cluster and `jobmatch_ai`, starting with **CKA** is a strong choice, but you can adapt this plan to CKAD by emphasizing app-centric topics.

Use this file to record your choice:

- Target exam: `CKA` or `CKAD`
- Target date window: `YYYY-MM` (or approximate quarter)

---

### 2. Map Exam Domains to Your Modules

For each exam domain, note which homelab modules already help and where you need extra focus.

Example (for CKA-style domains):

- **Cluster Architecture, Installation & Configuration**
  - Covered by: Modules 0–2 (homelab, k3s install).
- **Workloads & Scheduling**
  - Covered by: Modules 2–3, 6.
- **Services & Networking**
  - Covered by: Modules 2, 7.
- **Storage**
  - Covered by: Modules 2, 9.
- **Troubleshooting**
  - Covered by: Modules 1–2, 8, 9.

You can expand/adjust once you have the official exam blueprint in front of you.

---

### 3. Create a Weekly Study Plan

Sketch a simple plan, for example:

- Week 1–2: Review Pods, Deployments, Services, Ingress; repeat labs from Modules 1–2.
- Week 3–4: Practice Kustomize and GitOps; review Modules 3–4 & 6.
- Week 5–6: Focus on networking, storage, and RBAC; add extra labs.
- Week 7–8: Full practice labs + one full-length practice exam.

Write your actual plan here in bullet form so you can update it as you go.

---

### 4. Tracking Progress

Use a simple checklist (example):

- [ ] Finished re-running all homelab modules with minimal notes.
- [ ] Completed all exam prep labs in `EP_03_Practice_Labs_In_Cluster.md`.
- [ ] Completed at least one full practice exam dry run in `EP_04_Practice_Exam_Scenario.md`.
- [ ] Comfortable with kubectl shortcuts, aliases, and YAML editing at speed.

