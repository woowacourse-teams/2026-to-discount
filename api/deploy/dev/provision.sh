#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
for user in todiscount-dev todiscount-runner; do
  id "$user" >/dev/null 2>&1 || useradd --system --create-home --home-dir "/var/lib/$user" --shell /bin/bash "$user"
done
install -d -m 755 /opt/todiscount-be-dev/releases
install -d -o todiscount-dev -g todiscount-dev -m 750 /var/lib/todiscount-be-dev
install -d -o todiscount-runner -g todiscount-runner -m 750 /var/lib/todiscount-runner
install -m 644 todiscount-be-dev.service /etc/systemd/system/todiscount-be-dev.service
install -o root -g todiscount-dev -m 640 development.env /etc/todiscount-be-dev.env
install -o root -g root -m 755 deploy.py /usr/local/sbin/todiscount-deploy-dev
printf 'todiscount-runner ALL=(root) NOPASSWD: /usr/local/sbin/todiscount-deploy-dev\n' > /etc/sudoers.d/todiscount-runner
chmod 440 /etc/sudoers.d/todiscount-runner
visudo -cf /etc/sudoers.d/todiscount-runner
# Existing test data is preserved on repeated provisioning.
if [ ! -f /var/lib/todiscount-be-dev/export.json ]; then
  install -o todiscount-dev -g todiscount-dev -m 640 export.json /var/lib/todiscount-be-dev/export.json
fi
if [ ! -f /var/lib/todiscount-be-dev/banners.yml ]; then
  printf 'banners: []\n' > /var/lib/todiscount-be-dev/banners.yml
  chown todiscount-dev:todiscount-dev /var/lib/todiscount-be-dev/banners.yml
  chmod 640 /var/lib/todiscount-be-dev/banners.yml
fi
systemctl daemon-reload
systemctl enable todiscount-be-dev
