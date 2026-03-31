## Module 9 – Backups, Upgrades, and Disaster Recovery

**Goal:** Be able to rebuild the cluster and restore `jobmatch_ai` if something goes wrong.

---

### Concepts

- **Backups**
  - Data: Postgres (and Redis if you need persistence).
  - Configuration: Git is your source of truth for manifests.
- **Upgrades**
  - k3s version upgrades.
  - Application upgrades via GitOps (image tags, manifests).
- **Disaster recovery**
  - Rebuilding the cluster.
  - Restoring data from backups.

---

### Hands-on Labs

#### 9.1 – Database backups

- Identify where Postgres runs (inside the cluster or external).
- Choose a backup strategy, for example:
  - A `CronJob` that runs `pg_dump` to an external volume or object storage.
  - A backup tool like Velero (for volume snapshots) if available.

- Test a manual backup:

  ```bash
  pg_dump <db-connection> > jobmatch_backup.sql
  ```

- Store backups on separate storage from the main cluster disks.

#### 9.2 – Rebuild exercise

- Choose a time when you can safely test.
- Provision a new k3s VM (or wipe and reinstall on the existing one).
- Steps:
  - Reinstall k3s.
  - Re-bootstrap Flux pointing to your GitOps repo.
  - Ensure all Flux `Kustomization` resources reconcile successfully.
  - Restore Postgres from your backup.

- Verify:
  - `jobmatch_ai` comes back online.
  - Data (resumes, jobs, matches, tracker entries) appears as expected.

#### 9.3 – k3s version upgrades

- Consult the k3s documentation for the recommended upgrade path.
- Perform an upgrade:
  - Update the k3s install script or package as required.
  - Restart the k3s service.

- Validate from your workstation shell:

  ```bash
  kubectl get nodes
  kubectl -n jobmatch get pods
  ```

- Confirm `jobmatch_ai` continues to function correctly after the upgrade.

---

### Completion Checklist

- [ ] You have a repeatable Postgres backup and restore process.
- [ ] You successfully rebuilt the cluster and re-deployed `jobmatch_ai` from Git.
- [ ] You performed at least one k3s upgrade and validated the app afterward.

