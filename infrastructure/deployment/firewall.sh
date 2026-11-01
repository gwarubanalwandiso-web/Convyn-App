#!/usr/bin/env bash
# UFW host firewall management. Preview by default; never resets existing rules.
set -euo pipefail
usage() {
  cat <<'HELP'
Usage: sudo bash infrastructure/deployment/firewall.sh COMMAND [PORT ...] [OPTIONS]
Commands: setup (install UFW, allow SSH/web, deny other incoming, enable),
          web (allow TCP 80/443), allow, deny, enable, status
Options: --apply, --protocol tcp|udp, --ssh-port PORT
Examples:
  bash infrastructure/deployment/firewall.sh setup --ssh-port 22
  sudo bash infrastructure/deployment/firewall.sh setup --ssh-port 22 --apply
  bash infrastructure/deployment/firewall.sh web
  sudo bash infrastructure/deployment/firewall.sh web --apply
  sudo bash infrastructure/deployment/firewall.sh allow 8080 8443 --apply
  sudo bash infrastructure/deployment/firewall.sh deny 8080 --apply
  sudo bash infrastructure/deployment/firewall.sh enable --ssh-port 22 --apply
Preview is the default. setup installs ufw through apt-get if needed.
Other commands require ufw to be installed. SSH defaults to the current SSH
connection's server port, otherwise 22; specify custom ports explicitly.
Deny adds a priority rule (including ahead of existing allows); allow does the
same ahead of existing denies. Existing rules are retained. Enable preserves
existing defaults/rules. setup sets deny-incoming and allow-outgoing defaults,
preserving explicit rules (including existing allows). This manages host INPUT traffic only: Docker published
ports can bypass UFW. Also manage Docker exposure and your provider firewall.
HELP
}
fail() { printf '%s\n' "$*" >&2; exit 1; }
port() { [[ $1 =~ ^[0-9]{1,5}$ ]] && (( 10#$1 >= 1 && 10#$1 <= 65535 )); }
command_name=${1:-help}
if [[ $command_name == help || $command_name == --help ]]; then usage; exit 0; fi
shift
apply=false
protocol=tcp
ssh_port=22
if [[ -n ${SSH_CONNECTION:-} ]]; then
  read -r _ _ _ ssh_port <<< "$SSH_CONNECTION"
fi
ports=()
while (( $# )); do
  case $1 in
    --apply) apply=true; shift ;;
    --protocol|--ssh-port)
      (( $# >= 2 )) || fail "Missing value for $1"
      if [[ $1 == --protocol ]]; then protocol=$2; else ssh_port=$2; fi
      shift 2 ;;
    *) port "$1" || fail "Invalid port or option: $1"; ports+=("$((10#$1))"); shift ;;
  esac
done
[[ $protocol == tcp || $protocol == udp ]] || fail 'Protocol must be tcp or udp.'
port "$ssh_port" || fail 'Invalid SSH port; specify --ssh-port.'
ssh_port=$((10#$ssh_port))
case $command_name in
  setup|web) (( ${#ports[@]} == 0 )) || fail "$command_name takes no ports."
       [[ $protocol == tcp ]] || fail "$command_name requires TCP."; ports=(80 443) ;;
  allow|deny) (( ${#ports[@]} > 0 )) || fail 'Specify at least one port.' ;;
  enable|status) (( ${#ports[@]} == 0 )) || fail "$command_name takes no ports." ;;
  *) fail "Unknown command: $command_name" ;;
esac
# Validate the entire request before making any changes.
if [[ $command_name == deny && $protocol == tcp ]]; then
  for p in "${ports[@]}"; do
    (( p != ssh_port )) || fail 'Refusing to deny the protected SSH port.'
  done
fi
run() {
  if $apply; then "$@"; else printf 'Preview:'; printf ' %q' "$@"; printf '\n'; fi
}
if $apply; then
  (( EUID == 0 )) || fail 'Run with sudo to apply firewall changes.'
  if ! command -v ufw >/dev/null; then
    if [[ $command_name == setup ]]; then
      command -v apt-get >/dev/null || fail 'Automatic installation needs Ubuntu/Debian apt-get.'
      run apt-get update
      run apt-get install -y ufw
    else
      fail 'Install ufw first: sudo apt-get install ufw'
    fi
  fi
fi
if [[ $command_name == status ]]; then run ufw status verbose; exit 0; fi
# Insert first so an existing broad deny cannot block this recovery path.
run ufw insert 1 allow "$ssh_port/tcp" comment 'CONVYN SSH access'
case $command_name in
  setup|web|allow|deny)
    action=allow
    [[ $command_name != deny ]] || action=deny
    for p in "${ports[@]}"; do
      run ufw insert 1 "$action" "$p/$protocol" comment 'CONVYN managed port'
    done ;;
  enable) run ufw --force enable ;;
esac
if [[ $command_name == setup ]]; then
  # Allow required ports before changing policy or activating the firewall.
  run ufw default deny incoming
  run ufw default allow outgoing
  run ufw --force enable
fi
run ufw status verbose
printf '%s\n' 'UFW does not control all Docker-published traffic or the provider firewall.'
