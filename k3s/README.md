# SoftRains on k3s

This folder translates the `docker-compose` startup to Kubernetes manifests for a single-node k3s deployment.

## Why k3s

k3s is already a modern lightweight Kubernetes distribution and a strong replacement for Docker Compose on small hosts.

## What is included

- `namespace.yaml`: namespace
- `secret.example.yaml`: secret template for tokens and API keys
- `softrains-deployment.yaml`: `softrains` deployment + service
- `frigate-deployment.yaml`: `frigate` deployment + service
- `avahi-daemonset.yaml`: Avahi mDNS reflector (DaemonSet)

Notes:
- Host ports are used to keep Compose-like access: `8443`, `8971`, `8554`, `8555`.
- This setup assumes a single node (hostPort usage).
- `mdns-repeater` from Compose is replaced by an Avahi reflector DaemonSet.

## Prerequisites

- Linux host
- Root or sudo access
- Required host directories:
  - `/opt/softrains/config`
  - `/opt/frigate/config`
  - `/opt/frigate/media`

## 1) Install k3s

```bash
curl -sfL https://get.k3s.io | sh -
sudo kubectl get nodes
```

If your shell cannot find `kubectl`, use:

```bash
sudo k3s kubectl get nodes
alias kubectl='sudo k3s kubectl'
```

## 2) Prepare config data

Copy your existing config into host paths used by manifests:

```bash
sudo mkdir -p /opt/softrains/config /opt/frigate/config /opt/frigate/media
sudo cp -r /app/config/* /opt/softrains/config/ 2>/dev/null || true
```

If your config is not under `/app/config`, copy from your local project path instead.

## 3) Build and import SoftRains image

Build from repo root:

```bash
docker build -t softrains:latest -f docker/Dockerfile .
```

Import that local image into k3s containerd:

```bash
docker save softrains:latest | sudo k3s ctr images import -
```

If you use a remote registry instead, push your image and update `image:` in `softrains-deployment.yaml`.

## 4) Create secret

```bash
cp k3s/secret.example.yaml k3s/secret.yaml
```

Edit `k3s/secret.yaml` and set real values.

Apply manifests:

```bash
kubectl apply -f k3s/namespace.yaml
kubectl apply -f k3s/secret.yaml
kubectl apply -f k3s/avahi-daemonset.yaml
kubectl apply -f k3s/softrains-deployment.yaml
kubectl apply -f k3s/frigate-deployment.yaml
```

## 5) Verify

```bash
kubectl -n softrains get pods
kubectl -n softrains get svc
kubectl -n softrains get daemonset avahi-reflector
kubectl -n softrains logs deploy/softrains --tail=100
kubectl -n softrains logs deploy/frigate --tail=100
kubectl -n softrains logs ds/avahi-reflector --tail=100
```

Expected external access on the node IP:

- SoftRains UI: `https://<node-ip>:8443`
- Frigate API/UI: `http://<node-ip>:8971`

## Common issues

- Pod stuck Pending due to hostPort conflict:
  - Ensure nothing else is already bound to `8443`, `8971`, `8554`, `8555`.
- `softrains` fails to start due to missing config:
  - Check `/opt/softrains/config/softrains.json` exists and is readable.
- Frigate camera or media path problems:
  - Verify `/opt/frigate/config` and `/opt/frigate/media` contain expected data.
- USB device access issues in Frigate:
  - Confirm `/dev/bus/usb` exists and permissions are correct on host.
- Avahi image pull issue:
  - If `flungo/avahi:latest` is unavailable in your environment, replace the image in `avahi-daemonset.yaml` with an approved Avahi container image for your registry policy.

## Optional alternatives

If you want a different lightweight distro, `k0s` and `microk8s` are viable. The manifests in this folder are standard Kubernetes YAML and should work there with minor adjustments.
