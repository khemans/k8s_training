## Module 7 – Ingress, TLS, and DNS

**Goal:** Expose `jobmatch_ai` via a friendly hostname and HTTPS on your homelab.

---

### Concepts

- **Ingress and hostnames**
  - Ingress maps hostnames and paths to Services inside the cluster.
  - Multiple apps can share one IngressController (e.g. Traefik).
- **TLS with `cert-manager`**
  - Automates certificate issuance and renewal (e.g. Let’s Encrypt).
  - Uses `ClusterIssuer`/`Issuer` resources and Ingress annotations.
- **DNS/Name resolution**
  - Local-only: use hosts file or internal DNS (Pi-hole, Unbound, etc.).
  - Public: use a real DNS provider pointing at your external IP.

---

### Hands-on Labs

#### 7.1 – Choose a hostname

- Decide on one or more hostnames, for example:
  - Local-only: `jobmatch.lab`, `jobmatch.local`.
  - If you own a domain: `jobmatch.<your-domain>`.

- For local-only setup:
  - On Windows, map hostname(s) to the k3s master IP in the hosts file.

#### 7.2 – Install cert-manager

- Use Helm or GitOps (Flux) to deploy `cert-manager`:
  - Create a `cert-manager` namespace.
  - Install the official `cert-manager` Helm chart.

- Apply a `ClusterIssuer`:
  - For local-only with a self-signed CA, or
  - For Let’s Encrypt (staging first, then production) if you expose your cluster externally.

#### 7.3 – TLS-enabled Ingress for `jobmatch_ai`

- Update your `jobmatch` Ingress manifest to:
  - Add `cert-manager` annotations.
  - Specify:
    - `spec.tls.secretName` (e.g. `jobmatch-tls`).
    - `spec.tls.hosts` including your chosen hostname(s).

- Apply the changes (via GitOps).
- Verify:

  ```bash
  kubectl get certificate -A
  kubectl get ingress -A
  ```

- Test in your browser:
  - `https://jobmatch.lab` (or your chosen host).
  - Confirm certificate is valid or trusted (for local CA).

---

### Completion Checklist

- [ ] `jobmatch_ai` is reachable via a stable hostname (e.g. `jobmatch.lab`).
- [ ] `cert-manager` is installed and managing certificates.
- [ ] Your Ingress is serving HTTPS with a valid (or trusted) certificate.

