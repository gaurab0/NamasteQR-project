#!/bin/sh
/opt/ts/tailscaled --tun=userspace-networking --socks5-server=localhost:1055 &
if [ -n "${TAILSCALE_AUTHKEY:-}" ]; then
  i=0
  while [ "$i" -lt 3 ]; do
    if timeout 8 /opt/ts/tailscale up --auth-key="${TAILSCALE_AUTHKEY}" --hostname="render-app"; then
      break
    fi
    i=$((i + 1))
    if [ "$i" -lt 3 ]; then sleep 1; fi
  done
fi
timeout 2 /opt/ts/tailscale status >/dev/null 2>&1 || echo "WARNING: Tailscale did not come up; printing will be unavailable."
exec npm start
