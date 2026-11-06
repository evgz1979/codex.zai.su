#!/usr/bin/env python3
"""Проверка адаптированной конфигурации Caddy без запуска HTTP-сервера."""
import json
import os
from pathlib import Path
import subprocess
import sys


def require(condition, message):
    if not condition:
        raise ValueError(message)


def validate(config):
    require(config.get('admin', {}).get('disabled') is True, 'Caddy admin API должен быть выключен')
    http = config.get('apps', {}).get('http', {})
    require(http.get('https_port') == 8443, 'HTTPS-порт должен быть 8443')
    ports = set()
    for server in http.get('servers', {}).values():
        for address in server.get('listen', []):
            port = int(address.rsplit(':', 1)[-1])
            require(port in (8080, 8443), f'Запрещён слушающий порт {port}')
            if port == 8080:
                require(address == '127.0.0.1:8080', 'HTTP-01 backend должен быть только loopback')
            ports.add(port)
        require(server.get('protocols') == ['h1', 'h2'], 'Разрешены только TCP HTTP/1.1 и HTTP/2')

    require(ports in ({8080}, {8080, 8443}), 'Ожидается loopback HTTP probe или HTTPS на 8443')
    for node in walk(config):
        require(node.get('handler') not in ('reverse_proxy', 'php_fastcgi', 'cgi'), 'Прокси и динамические обработчики запрещены')

    if 8443 in ports:
        for server in http['servers'].values():
            require(server.get('automatic_https', {}).get('disable_redirects') is True, 'Автоматические редиректы должны быть выключены')
        policies = config.get('apps', {}).get('tls', {}).get('automation', {}).get('policies', [])
        require(len(policies) == 1, 'Нужна одна явная политика ACME')
        issuers = policies[0].get('issuers', [])
        require(len(issuers) == 1, 'Нужен один явный ACME issuer')
        issuer = issuers[0]
        require(issuer.get('module') == 'acme', 'Разрешён только ACME')
        require(issuer.get('ca') == 'https://acme-v02.api.letsencrypt.org/directory', 'Ожидается Let’s Encrypt production')
        challenges = issuer.get('challenges', {})
        require(challenges.get('tls-alpn', {}).get('disabled') is True, 'TLS-ALPN-01 должен быть выключен')
        require(challenges.get('http', {}).get('alternate_port') == 8080, 'HTTP-01 backend должен использовать 8080 (внешний 80)')
        require(not challenges.get('http', {}).get('disabled'), 'HTTP-01 должен быть включён')
        require('dns' not in challenges, 'DNS-01 требует отдельного согласования')
    return sorted(ports)


def walk(value):
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from walk(child)
    elif isinstance(value, list):
        for child in value:
            yield from walk(child)


def main():
    require(len(sys.argv) == 2, 'Использование: validate_config.py Caddyfile')
    path = Path(sys.argv[1]).resolve(strict=True)
    require(os.geteuid() != 0, 'Caddy должен запускаться непривилегированным пользователем')
    status = dict(line.split(':', 1) for line in Path('/proc/self/status').read_text().splitlines() if ':' in line)
    require(all(int(status[key].strip(), 16) == 0 for key in ('CapEff', 'CapPrm', 'CapBnd', 'CapAmb')), 'Caddy не должен иметь capabilities')
    require(status['NoNewPrivs'].strip() == '1', 'Требуется NoNewPrivileges')
    require(int(Path('/proc/sys/net/ipv4/ip_unprivileged_port_start').read_text()) > 443, 'Ядро должно запрещать непривилегированный bind к 443')
    result = subprocess.run(
        ['/opt/codex-zai-https/bin/caddy', 'adapt', '--config', str(path), '--adapter', 'caddyfile'],
        check=True, capture_output=True, text=True,
    )
    ports = validate(json.loads(result.stdout))
    print(f'Caddy config guard: OK; разрешённые TCP-порты: {ports}')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, subprocess.CalledProcessError) as error:
        print(f'Caddy config guard: ОТКАЗ: {error}', file=sys.stderr)
        sys.exit(1)
