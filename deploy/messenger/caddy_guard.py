#!/usr/bin/env python3
"""Allow exactly the Messenger proxy; retain original port, ACME and privilege guards."""
import copy
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys


def require(condition, message):
    if not condition:
        raise ValueError(message)


def validate(config, original_validate):
    clean = copy.deepcopy(config)
    proxies = []

    def visit(value, hosts=()):
        if isinstance(value, dict):
            own = [h for match in value.get('match', []) for h in match.get('host', [])]
            inherited = tuple(own) if own else hosts
            if value.get('handler') == 'reverse_proxy':
                require(inherited == ('msg.zai.su',), 'Proxy outside msg.zai.su')
                require(value.get('upstreams') == [{'dial': '127.0.0.1:4318'}], 'Unexpected upstream')
                require(set(value) <= {'handler', 'upstreams'}, 'Unexpected proxy options')
                proxies.append(1)
                value.clear()
                value.update(handler='static_response', status_code=404)
            for child in value.values():
                visit(child, inherited)
        elif isinstance(value, list):
            for child in value:
                visit(child, hosts)

    visit(clean)
    require(len(proxies) == 1, 'Exactly one Messenger proxy is required')
    policies = clean.get('apps', {}).get('tls', {}).get('automation', {}).get('policies', [])
    require(bool(policies), 'Explicit TLS policies required')
    for policy in policies:
        subjects = policy.get('subjects', [])
        require(not subjects or set(subjects) <= {'codex.zai.su', 'msg.zai.su'}, 'Unknown TLS subject')
        candidate = copy.deepcopy(clean)
        candidate['apps']['tls']['automation']['policies'] = [policy]
        original_validate(candidate)
    return [8080, 8443]


def main():
    require(os.geteuid() != 0, 'Unprivileged Caddy required')
    state = dict(line.split(':', 1) for line in Path('/proc/self/status').read_text().splitlines() if ':' in line)
    require(all(int(state[k].strip(), 16) == 0 for k in ('CapEff','CapPrm','CapBnd','CapAmb')), 'Capabilities must be empty')
    require(state['NoNewPrivs'].strip() == '1', 'NoNewPrivileges required')
    require(int(Path('/proc/sys/net/ipv4/ip_unprivileged_port_start').read_text()) > 443, 'Privileged port isolation required')
    spec = importlib.util.spec_from_file_location('original_guard', '/opt/codex-zai-https/validate_config.py')
    original = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(original)
    result = subprocess.run(['/opt/codex-zai-https/bin/caddy','adapt','--config',sys.argv[1],'--adapter','caddyfile'],check=True,capture_output=True,text=True)
    validate(json.loads(result.stdout), original.validate)
    print('Caddy Messenger guard: OK (8080/8443 only)')


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('Caddy Messenger guard: REJECTED', file=sys.stderr)
        sys.exit(1)
