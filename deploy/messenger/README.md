# Z AI Messenger: установка и обновление

Запуск из чистой закоммиченной рабочей копии на MacBook:

```bash
bash deploy/messenger/deploy.sh
```

Скрипт выполняет все checks и push, затем автоматически устанавливает код на
root@38.60.254.194 через существующий SSH-доступ. Не использует --force, Docker,
apt или изменения VPN. Подробный [контракт развёртывания](../../messenger/docs/deployment.md).

Первоначальные пароли находятся только на MacBook:
`~/Library/Application Support/Z AI Messenger/deploy/initial-credentials.txt`.
Не печатать их в чат/журналы и не добавлять в Git. Файл bootstrap.json содержит
только Argon2id-хеши и передаётся отдельно от релиза; после успеха удаляется из
закрытого staging на VPS. Повторный bootstrap не перезаписывает пароли.

В `.local/messenger-deploy/<release>` на MacBook сохраняются архив, его контрольная
сумма, HTML/health пробы, приватные VPN-снимки и путь remote-stage. На VPS staging
`/var/tmp/zai-messenger-*` имеет права 0700 и содержит резервные копии Caddyfile,
drop-in и прежнего unit. Runtime расположен отдельно в /var/lib/zai-messenger.

Ручной откат конкретного неудачного выпуска при необходимости:

```bash
ssh -o StrictHostKeyChecking=yes root@38.60.254.194 \
  'bash /var/tmp/zai-messenger-XXXXXX/remote-rollback.sh /var/tmp/zai-messenger-XXXXXX'
```

Подставить точный путь remote-stage из приватного отчёта. Не применять произвольный
старый backup поверх конфигурации, изменённой после этого релиза. Во время обычного
deploy откат вызывается автоматически при ошибке установки или HTTPS-проверки.
Постоянные данные и секреты при откате не заменяются.

Проверки guard:

```bash
python3 -m unittest discover -s deploy/messenger -p 'test_*.py' -v
python3 -m unittest discover -s deploy/https-test -p 'test_*.py' -v
```
