#!/usr/bin/env python3
"""Только чтение: состояние VPN и firewall без вывода секретов конфигурации."""
import ctypes
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import subprocess


def command(*args):
    return subprocess.check_output(args, text=True).strip()


def process(pid):
    directory = Path('/proc') / str(pid)
    fields = directory.joinpath('stat').read_text().rsplit(')', 1)[1].split()
    return {
        'pid': pid,
        'ppid': int(fields[1]),
        'start_ticks': int(fields[19]),
        'exe': str(directory.joinpath('exe').resolve(strict=True)),
    }


def firewall():
    # CLI nft не обязателен: используем существующую библиотеку и ровно одну
    # фиксированную команду list ruleset. Нет интерфейса для изменения правил.
    nft = ctypes.CDLL('libnftables.so.1')
    nft.nft_ctx_new.argtypes = [ctypes.c_uint32]
    nft.nft_ctx_new.restype = ctypes.c_void_p
    for name in ('nft_ctx_buffer_output', 'nft_ctx_buffer_error'):
        fn = getattr(nft, name)
        fn.argtypes = [ctypes.c_void_p]
        fn.restype = ctypes.c_int
    for name in ('nft_ctx_get_output_buffer', 'nft_ctx_get_error_buffer'):
        fn = getattr(nft, name)
        fn.argtypes = [ctypes.c_void_p]
        fn.restype = ctypes.c_char_p
    nft.nft_ctx_output_set_flags.argtypes = [ctypes.c_void_p, ctypes.c_uint32]
    nft.nft_run_cmd_from_buffer.argtypes = [ctypes.c_void_p, ctypes.c_char_p]
    nft.nft_run_cmd_from_buffer.restype = ctypes.c_int
    nft.nft_ctx_free.argtypes = [ctypes.c_void_p]
    ctx = nft.nft_ctx_new(0)
    if not ctx:
        raise RuntimeError('Не удалось прочитать firewall')
    try:
        if nft.nft_ctx_buffer_output(ctx) or nft.nft_ctx_buffer_error(ctx):
            raise RuntimeError('Не удалось включить буфер чтения firewall')
        nft.nft_ctx_output_set_flags(ctx, (1 << 2) | (1 << 7) | (1 << 8) | (1 << 9) | (1 << 10))
        if nft.nft_run_cmd_from_buffer(ctx, b'list ruleset'):
            raise RuntimeError('Ошибка чтения firewall; изменение сервера запрещено')
        rules = nft.nft_ctx_get_output_buffer(ctx) or b''
        legacy = {}
        for name in ('ip_tables_names', 'ip6_tables_names'):
            path = Path('/proc/net') / name
            legacy[name] = sorted(path.read_text().split()) if path.exists() else []
        if any(legacy.values()):
            raise RuntimeError('Обнаружены legacy iptables; нужен отдельный аудит до развёртывания')
        return {'nft_ruleset_sha256': hashlib.sha256(rules).hexdigest(), 'nft_ruleset_empty': not rules.strip(), 'legacy_tables': legacy}
    finally:
        nft.nft_ctx_free(ctx)


def snapshot():
    properties = dict(line.split('=', 1) for line in command(
        'systemctl', 'show', 'x-ui.service', '-p', 'MainPID', '-p', 'ActiveState',
        '-p', 'SubState', '-p', 'NRestarts', '-p', 'ExecMainStartTimestampMonotonic',
    ).splitlines())
    if properties['ActiveState'] != 'active' or properties['SubState'] != 'running':
        raise RuntimeError('x-ui не работает; до изменений требуется участие пользователя')
    xui = process(int(properties['MainPID']))
    children = []
    for path in Path('/proc').iterdir():
        if not path.name.isdigit():
            continue
        try:
            if path.joinpath('comm').read_text().strip().startswith('xray'):
                candidate = process(int(path.name))
                if candidate['ppid'] == xui['pid']:
                    children.append(candidate)
        except (FileNotFoundError, ProcessLookupError):
            continue
    if len(children) != 1:
        raise RuntimeError('Не удалось однозначно определить работающий Xray')
    listener = command('ss', '-H', '-ltnp', '( sport = :443 )')
    if not listener or f'pid={children[0]["pid"]},' not in listener:
        raise RuntimeError('Владелец TCP 443 не совпадает с Xray')
    paths = [
        '/usr/local/x-ui/bin/config.json', '/usr/local/x-ui/x-ui',
        '/usr/local/x-ui/bin/xray-linux-amd64', '/etc/systemd/system/x-ui.service',
    ]
    hashes = {name: hashlib.sha256(Path(name).read_bytes()).hexdigest() for name in paths}
    return {
        'captured_at_utc': datetime.now(timezone.utc).isoformat(),
        'invariants': {
            'boot_id': Path('/proc/sys/kernel/random/boot_id').read_text().strip(),
            'x_ui_unit': properties, 'x_ui_process': xui, 'xray_process': children[0],
            'vpn_files_sha256': hashes, 'tcp_443_listener': listener,
            'firewall': firewall(),
        },
    }


if __name__ == '__main__':
    print(json.dumps(snapshot(), ensure_ascii=False, indent=2))
