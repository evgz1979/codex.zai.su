#!/usr/bin/env python3
"""Приватный отчёт vnStat. Не изменяет счётчики и не открывает сетевой сервер."""
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import subprocess
import sys
import time
from zoneinfo import ZoneInfo

STATE = Path('/var/lib/codex-zai-traffic')
INTERFACE = 'eth1'
MOSCOW = ZoneInfo('Europe/Moscow')


def bytes_value(value):
    if type(value) is not int or value < 0:
        raise ValueError('Ожидается неотрицательное число байт, а не оценка')
    return value


def amount(value):
    value = bytes_value(value)
    return f'{value / 1_000_000:.3f} MB ({value / 1_000_000_000:.6f} GB)'


def read_interface(document):
    if str(document.get('jsonversion')) != '2':
        raise ValueError('Неподдерживаемый JSON vnStat')
    interfaces = [entry for entry in document.get('interfaces', []) if entry['name'] == INTERFACE]
    if len(interfaces) != 1:
        raise ValueError('Нет однозначных измерений eth1; проверьте сервис счётчика')
    entry = interfaces[0]
    for direction in ('rx', 'tx'):
        bytes_value(entry['traffic']['total'][direction])
    return entry


def row_key(row):
    date, clock = row['date'], row.get('time', {})
    return date['year'], date['month'], date.get('day', 1), clock.get('hour', 0), clock.get('minute', 0)


def validate_initial_history(document, metadata, current_kernel):
    """Новая история не должна включать прежний накопительный итог интерфейса."""
    total = read_interface(document)['traffic']['total']
    for direction in ('tx', 'rx'):
        key = f'{direction}_bytes'
        delta = bytes_value(current_kernel[key]) - bytes_value(metadata['kernel_at_start'][key])
        if delta < 0 or total[direction] > delta + 65_536:
            raise ValueError('Новая история содержит старый трафик или интерфейс сброшен')


def row_label(row, period):
    year, month, day, hour, _ = row_key(row)
    if period == 'month':
        return f'{year:04d}-{month:02d}'
    label = f'{year:04d}-{month:02d}-{day:02d}'
    return f'{label} {hour:02d}:00' if period == 'hour' else label


def render(document, metadata):
    entry = read_interface(document)
    total = entry['traffic']['total']
    started = datetime.fromisoformat(metadata['meter_started_at_utc']).astimezone(MOSCOW)
    updated = datetime.fromtimestamp(entry['updated']['timestamp'], timezone.utc).astimezone(MOSCOW)
    lines = [
        f'Независимый счётчик VPS — {INTERFACE}; время МСК',
        f'История начата: {started:%Y-%m-%d %H:%M:%S %Z}',
        f'Последнее сохранение: {updated:%Y-%m-%d %H:%M:%S %Z}',
        f'TX исходящий с начала истории: {amount(total["tx"])}',
        f'RX входящий с начала истории: {amount(total["rx"])}',
        'Для сверки с хостером используйте TX. RX + TX не складываем.',
        'Данные до установки не импортированы; первый день/месяц неполные.',
    ]
    for period, title, limit in (('hour', 'Последние часы', 6), ('day', 'Последние дни', 7), ('month', 'Последние месяцы', 3)):
        rows = sorted(entry['traffic'].get(period, []), key=row_key)[-limit:]
        lines.append(f'\n{title} — исходящий TX:')
        if not rows:
            lines.append('  пока нет сохранённых интервалов')
        for row in rows:
            lines.append(f'  {row_label(row, period)}  {amount(row["tx"])}')
    provider = metadata.get('provider_observation')
    if provider:
        lines.extend([
            f'\nПанель хостера, со слов пользователя: {provider["display_gb"]} GB',
            f'Записано: {provider["recorded_at_utc"]}; время обновления панели неизвестно.',
            'Эта точка не импортируется в наш счётчик и не считается точным биллингом.',
        ])
    lines.append('\nGB = 1 000 000 000 байт. Учёт общий для интерфейса, без разбивки по приложениям.')
    return '\n'.join(lines)


def main():
    os.environ['TZ'] = 'Europe/Moscow'
    time.tzset()
    args = ['/usr/bin/env', 'TZ=Europe/Moscow', '/opt/codex-zai-traffic/bin/vnstat', '--config', '/etc/codex-zai-traffic/vnstat.conf', '--json']
    if os.geteuid() == 0:
        args = ['/usr/sbin/runuser', '-u', 'codex-zai-traffic', '--'] + args
    result = subprocess.run(args, check=True, capture_output=True, text=True)
    document = json.loads(result.stdout)
    metadata = json.loads((STATE / 'baseline.json').read_text())
    print(render(document, metadata))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, KeyError, OSError, subprocess.CalledProcessError) as error:
        print(f'Не удалось получить измерения: {error}', file=sys.stderr)
        sys.exit(1)
