## Module 2 – Kubernetes Core for Homelab

**Goal:** Be comfortable working with key Kubernetes resource types you’ll use for `jobmatch_ai`.

---

### Concepts

- **Namespaces**
  - Logical isolation within a cluster.
  - Let you group related workloads (e.g. `jobmatch`, `monitoring`, `sandbox`).
- **Deployments and ReplicaSets**
  - Deployment: declarative desired state for Pods (image, env, replicas).
  - ReplicaSet: maintains the correct number of Pods.
- **Services**
  - **ClusterIP** (default): stable virtual IP inside the cluster.
  - **NodePort**: opens a port on each node (less needed in k3s with Ingress).
  - **LoadBalancer**: integrates with cloud load balancers (not relevant for pure homelab without L4 LB).
- **Ingress + IngressController**
  - Ingress: HTTP(S) routing rules based on host/path.
  - IngressController: component that implements the routing (k3s ships with Traefik by default).
- **ConfigMaps and Secrets**
  - ConfigMaps: non-sensitive configuration (e.g. feature flags).
  - Secrets: sensitive data (passwords, API keys) stored base64-encoded.
- **PersistentVolumeClaims (PVCs)**
  - Request storage from a StorageClass for stateful workloads (Postgres, etc.).

---

### Hands-on Labs

#### 2.1 – Create a `jobmatch` namespace

- From your workstation:

  ```bash
  kubectl create namespace jobmatch
  kubectl get namespaces
  ```

- Confirm `jobmatch` appears in the list.

#### 2.2 – Manifest-driven nginx deployment

- On your Windows machine, create a directory for this module, for example:

  ```text
  e:\working\k8s_training\labs\module02
  ```

- In that folder, create a `deployment.yaml` for nginx in the `jobmatch` namespace, and a `service.yaml` for a ClusterIP Service.
- Apply them:

  ```bash
  kubectl apply -f deployment.yaml
  kubectl apply -f service.yaml
  kubectl -n jobmatch get pods,svc
  ```

- Use:

  ```bash
  kubectl -n jobmatch describe deployment <deployment-name>
  ```

to inspect details.

#### 2.3 – Ingress via Traefik

- Check for the IngressController:

  ```bash
  kubectl get pods -n kube-system
  kubectl get ingressclass
  ```

- In your labs folder, create an `ingress.yaml` that:
  - Uses the default IngressClass.
  - Routes `http://jobmatch.local/` to the nginx Service in `jobmatch`.

- Apply it:

  ```bash
  kubectl apply -f ingress.yaml
  kubectl get ingress -A
  ```

- On Windows, edit your hosts file to map `jobmatch.local` to your k3s master IP, then browse to:

```text
http://jobmatch.local
```

#### 2.4 – Basic persistence test

- List StorageClasses:

  ```bash
  kubectl get storageclass
  ```

- In your labs folder, create:
  - A `pvc.yaml` requesting a small amount of storage.
  - A `pod-with-pvc.yaml` that mounts this claim and writes a file to the mounted path.

- Apply and verify:

  ```bash
  kubectl apply -f pvc.yaml
  kubectl apply -f pod-with-pvc.yaml
  kubectl get pvc -n jobmatch
  ```

- Exec into the Pod to confirm file creation:

  ```bash
  kubectl -n jobmatch exec -it <pod-name> -- sh
  ```

---

### Completion Checklist

- [ ] You can create and list namespaces, including `jobmatch`.
- [ ] You deployed nginx via YAML manifests, not `kubectl create deployment`.
- [ ] You accessed nginx via Ingress at `http://jobmatch.local`.
- [ ] You created and used a PVC in a Pod.

