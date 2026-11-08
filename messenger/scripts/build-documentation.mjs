import ts from 'typescript';
import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const printer = ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed });
const purposes = {
  'backend/core/transcription.ts':'Явная встроенная расшифровка голосовых, приватный кеш, дедупликация и проверка обновлений источника.',
  'frontend/src/VoiceTranscription.tsx':'Кнопка расшифровки голосового, частичный текст, ручной повтор и отменяемый опрос.',
  'test/browser/updates.spec.ts':'Проверка обновления установленного приложения, предупреждения о черновиках, входа и отказа сети.',
  'frontend/src/AppUpdates.tsx':'Проверка версии сборки и обновление приложения по нажатию без смены manifest и подписок.',
  'backend/accounts.ts': 'Закрытый реестр личных пользователей, персональные ссылки, блокировки и независимые серверные экземпляры.',
  'backend/runtime.ts': 'Отдельные БД, Telegram, пароли, медиакеш, push и жизненный цикл личного аккаунта.',
  'frontend/src/admin/UsersPanel.tsx': 'Добавление личных пользователей владельцем, персональные ссылки и блокировка доступа.',
  'frontend/src/useConversationArrival.ts': 'Отменяемое открытие свежего непрочитанного при запуске и возврате, точного диалога по уведомлению.',
  'frontend/src/useVisibleReads.ts': 'Подтверждение просмотра реально видимых сообщений после остановки прокрутки в активной ленте.',
  'frontend/src/useAppBadge.ts': 'Согласование значка приложения и уведомлений при чтении, возврате фокуса и позднем push.',
  'scripts/app-icon.svg': 'Квадратная иконка установки с непрозрачным фоном до краёв; маску применяет ОС.',
  'scripts/build-icons.mjs': 'Локальная растеризация квадратной SVG-иконки в три размера PNG через Chromium.',
  'backend/core/media-preload.ts': 'Автоматическая подготовка вложений и миниатюр выбранных чатов за последние пять дней с продолжением после рестарта.',
  'frontend/src/Avatar.tsx':'Круглые фотографии разрешённых диалогов с загрузкой возле видимой области и инициалами.',
  'frontend/src/AttachmentPreview.tsx': 'Ленивая миниатюра в ленте, фиксированные размеры и открытие оригинала.',
  'frontend/src/previews.ts': 'Последовательная очередь и ограниченный оперативный кеш миниатюр без хранилища браузера.',
  'backend/core/push.ts': 'Приватные подписки Web Push, VAPID и доставка нейтральных уведомлений новых входящих.',
  'frontend/src/Notifications.tsx': 'Явное включение, отключение и проверка уведомлений; инструкция установки на iPhone.',
  'frontend/public/sw.js': 'Service Worker для видимых push-уведомлений и открытия чата без кеширования переписки.',
  'frontend/public/manifest.webmanifest': 'Идентичность и режим standalone для установки Messenger на экран «Домой».',
  'backend/core/attachments.ts': 'Защищённая потоковая загрузка вложений и ограниченный приватный кеш байтов.',
  'backend/connectors/telegram/media.ts': 'Безопасные общие метаданные фото и документов Telegram без native references.',
  'frontend/src/AttachmentViewer.tsx': 'Модальный просмотр медиа по явному запросу, скачивание и отзыв Blob URL.',
  'backend/core/sync.ts': 'Автоматическое заполнение полного SQLite-кеша выбранных диалогов, события и возобновляемая история.',
  'backend/connectors/telegram/folders.ts': 'Преобразование папок и правил Telegram в общий административный каталог.',
  'frontend/src/admin/ConversationPicker.tsx': 'Закладки папок, поиск и независимый от текущей папки выбор диалогов.',
  'backend/auth/telegram-issue.ts': 'Allowlist-классификация отказов Telegram без раскрытия исходных исключений.',
  'backend/admin/service.ts': 'Настройки, метаданные Telegram и права выбора диалогов.',
  'backend/auth/telegram-login.ts': 'Пошаговый Telegram-вход с временными callbacks кода и 2FA.',
  'backend/core/errors.ts': 'Безопасная прикладная ошибка HTTP API.',
  'backend/core/registry.ts': 'Реестр подключённых SourceAdapter.',
  'backend/core/selection.ts': 'Постоянный выбор разрешённых диалогов и ревизия доступа.',
  'backend/core/inbox.ts': 'Формирование ленты только выбранных диалогов.',
  'frontend/src/admin/AdminApp.tsx': 'Отдельная административная страница с собственным входом и формами.',
  'backend/auth/auth.ts': 'Argon2id-пароли ролей admin/chat, веб-сессии в памяти и ограничение попыток входа.',
  'backend/auth/prompt.ts': 'Скрытый интерактивный ввод в TTY без отражения символов.',
  'backend/cli.ts': 'Команды setup, bootstrap и clear без вывода секретов; Telegram подключается через админку.',
  'backend/config.ts': 'Фиксированные loopback-порт, Origin и пути модуля для source/build.',
  'backend/connectors/telegram/adapter.ts': 'Каталог диалогов/папок Telegram, преобразование сообщений в общие DTO и проверка назначения.',
  'backend/connectors/telegram/client.ts': 'Создание teleproto-клиента с приватной сессией, дедлайном RPC и выключенными логами.',
  'backend/core/service.ts': 'Единая лента, маршруты, лимиты, кеш и дедупликация отправок.',
  'backend/core/source-adapter.ts': 'Общий контракт операций с сообщениями и необязательного каталога папок источника.',
  'backend/http.ts': 'Фиксированный HTTP API, веб-вход, защита запросов и статические файлы.',
  'backend/index.ts': 'Сборка production-сервера, регистрация TelegramAdapter и остановка.',
  'backend/storage/private-files.ts': 'Права приватных файлов и AES-256-GCM хранилище Telegram-сессии.',
  'backend/storage/store.ts': 'SQLite: настройки ролей, выбранные диалоги и полный кеш выбранной истории с сохранением исключённого архива.',
  'frontend/index.html': 'HTML-точка входа, viewport и подключение React-сборки.',
  'frontend/public/favicon.svg': 'Локальная иконка приложения без внешних ресурсов.',
  'frontend/src/App.tsx': 'Единый React-интерфейс, веб-вход, адресат, черновики и состояние операций.',
  'frontend/src/api.ts': 'Same-origin fetch, CSRF в памяти и безопасная ошибка API.',
  'frontend/src/main.tsx': 'Создание React root и подключение локальной таблицы стилей.',
  'frontend/src/styles.css': 'Компактная светлая палитра Telegram, общая лента и отдельная админка; safe-area и короткий viewport.',
  'frontend/vite.config.ts': 'React/Vite-сборка в dist/client без отдельного production-порта.',
  'playwright.config.ts': 'Три браузерные конфигурации и изолированный сервер синтетических данных.',
  'scripts/build-documentation.mjs': 'AST-справочник, маршруты, DDL, тестовый индекс и проверка ссылок без запуска приложения.',
  'scripts/npm.sh': 'Выбор локального Node.js и запуск npm из каталога Messenger.',
  'scripts/start.sh': 'Запуск собранного сервера по абсолютному пути для безопасной проверки PID.',
  'scripts/stop.mjs': 'Проверка PID и команды процесса перед SIGTERM только Messenger.',
  'scripts/stop.sh': 'Выбор Node.js и запуск штатного stop.mjs.',
  'shared/types.ts': 'Общие DTO ленты и каталога, статусы веб-авторизации, лимиты, ID и Destination.',
};

//: Находит исходники только в разрешённых каталогах модуля.
//: Не обходит .local, node_modules, dist, симлинки и другие проекты.
export function sourcePaths(root) {
  const paths = [];
  //: Обходит явно выбранный каталог исходников.
  //: Симлинки пропускаются, результаты ограничены расширениями исходных файлов.
  function walk(directory) {
    for (const entry of readdirSync(resolve(root, directory), { withFileTypes: true })) {
      if (entry.isSymbolicLink() || ['.local', '.git', '.tools', 'node_modules', 'dist', 'test-results', 'coverage'].includes(entry.name)) continue;
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else if (/\.(?:ts|tsx|mjs|js|sh|css|html|svg|webmanifest)$/.test(path)) paths.push(path);
    }
  }
  for (const dir of ['backend', 'frontend', 'shared', 'scripts']) walk(dir);
  paths.push('playwright.config.ts');
  return paths.sort();
}

//: Печатает AST-фрагмент без комментариев и физических координат.
//: Сохраняет смысл строковых литералов, типов и значений по умолчанию.
function print(node, file) {
  return printer.printNode(ts.EmitHint.Unspecified, node, file).trim();
}

//: Строит сигнатуру объявления без тела функции или класса.
//: Интерфейсы, type aliases и экспортированные константы сохраняют свои контракты.
function signature(node, file) {
  if (ts.isClassDeclaration(node)) return `class ${node.name.text}${node.typeParameters ? '<' + node.typeParameters.map(n => print(n, file)).join(', ') + '>' : ''}${node.heritageClauses?.length ? ' ' + node.heritageClauses.map(n => print(n, file)).join(' ') : ''}`;
  if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) return print(node, file);
  if (ts.isVariableDeclaration(node) && !ts.isArrowFunction(node.initializer) && !ts.isFunctionExpression(node.initializer)) return `const ${print(node, file)}`;
  const fn = ts.isVariableDeclaration(node) ? node.initializer : node;
  const name = ts.isConstructorDeclaration(fn) ? 'constructor' : ts.isGetAccessorDeclaration(fn) ? `get ${print(fn.name, file)}` : ts.isSetAccessorDeclaration(fn) ? `set ${print(fn.name, file)}` : print(node.name, file);
  const modifiers = fn.modifiers?.map(n => print(n, file)).filter(m => !['export', 'default'].includes(m)).join(' ');
  const generics = fn.typeParameters?.length ? '<' + fn.typeParameters.map(n => print(n, file)).join(', ') + '>' : '';
  return `${modifiers ? modifiers + ' ' : ''}${name}${generics}(${fn.parameters.map(n => print(n, file)).join(', ')})${fn.type ? ': ' + print(fn.type, file) : ''}`;
}

//: Извлекает именованные объявления с полным лексическим именем.
//: Требует две строки //:; callbacks описываются у именованного владельца.
export function declarations(text, path, validateComments = true) {
  const file = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  if (file.parseDiagnostics.length) throw new Error(`Ошибка AST: ${path}`);
  const result = [];
  const repeated = new Map();
  //: Обходит AST с сохранением лексической области определений.
  //: Различает полные имена, повторные объявления и область именованных владельцев.
  function visit(node, scope = []) {
    const variable = ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer;
    const callable = variable && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer));
    const constant = variable && ts.isVariableStatement(node.parent.parent) && node.parent.parent.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
    const named = (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isMethodDeclaration(node) || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) && node.name;
    const constructor = ts.isConstructorDeclaration(node);
    const included = !!(named || constructor || callable || constant);
    let nextScope = scope;
    if (included) {
      const shortName = constructor ? 'constructor' : node.name.getText(file);
      const name = [...scope, shortName].join('.');
      const count = (repeated.get(name) ?? 0) + 1;
      repeated.set(name, count);
      const anchor = `symbol-${name}${count > 1 ? '--declaration-' + count : ''}`;
      const owner = variable ? node.parent.parent : node;
      const commentText = text.slice(owner.getFullStart(), owner.getStart(file));
      const description = [...commentText.matchAll(/^\s*\/\/:\s*(.+)$/gm)].map(m => m[1].trim());
      if (validateComments && (description.length !== 2 || description.some(s => !s))) throw new Error(`${path}: ${name}: нужны две непустые строки //:`);
      result.push({ name, anchor, signature: signature(node, file), description });
      if (ts.isClassDeclaration(node) || ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || callable || constructor) nextScope = [...scope, shortName];
    }
    ts.forEachChild(node, child => visit(child, nextScope));
  }
  visit(file);
  return result.sort((a, b) => a.anchor.localeCompare(b.anchor, 'en'));
}

//: Переводит путь исходника в стабильное имя страницы справочника.
//: Различает shell и MJS с одним basename; имя не зависит от координат или даты.
function pageName(path) { return path.replace(/\.sh$/, '-sh').replace(/\.(?:ts|tsx|mjs|css|html|svg)$/, '').replaceAll('/', '--') + '.md'; }

//: Строит все генерируемые страницы из исходников и тестовых объявлений.
//: Ничего не импортирует из приложения и не открывает рабочие данные.
export function buildReference(root) {
  const output = new Map();
  const paths = sourcePaths(root);
  const index = ['# Справочник исходников', '', 'Генерируется `scripts/build-documentation.mjs`. Ручное редактирование заменяется генерацией.', '', '| Исходник | Назначение | Объявлений |', '| --- | --- | --- |'];
  const inventory = [];
  for (const path of paths) {
    if (!purposes[path]) throw new Error(`Нет назначения модуля: ${path}`);
    const text = readFileSync(resolve(root, path), 'utf8');
    const symbols = /\.(?:ts|tsx|mjs)$/.test(path) ? declarations(text, path) : [];
    const name = pageName(path);
    index.push(`| [${path}](${name}) | ${purposes[path]} | ${symbols.length} |`);
    const page = [`# ${path}`, '', purposes[path], '', `[Исходный модуль](../../${path}) · [Индекс](README.md)`, ''];
    if (!symbols.length) page.push('Именованных объявлений нет. Конфигурация, стили и код точки входа описаны на уровне модуля.', '');
    for (const symbol of symbols) {
      page.push(`<a id="${symbol.anchor}"></a>`, '', `## ${symbol.name}`, '', ...symbol.description.map(line => line + '\n'), '```typescript', symbol.signature, '```', '');
      inventory.push({ path, name: symbol.name, anchor: symbol.anchor });
    }
    if (output.has(`docs/reference/${name}`)) throw new Error(`Конфликт страниц справочника: ${path}`);
    output.set(`docs/reference/${name}`, page.join('\n'));
  }
  output.set('docs/reference/README.md', index.join('\n') + '\n');
  output.set('docs/reference/inventory.json', '[\n' + inventory.map(item => '  ' + JSON.stringify(item)).join(',\n') + '\n]\n');
  const http = ts.createSourceFile('http.ts', readFileSync(resolve(root, 'backend/http.ts'), 'utf8'), ts.ScriptTarget.Latest, true);
  const routes = [];
  //: Извлекает статические ветки HTTP-путей и методов.
  //: Не выдаёт условия маршрутизации за полную JSON-схему запросов.
  function routesVisit(node, roles = ['admin', 'chat']) {
    if (ts.isIfStatement(node) && /^role === [\"\']chat[\"\']$/.test(print(node.expression, http))) {
      routesVisit(node.thenStatement, ['chat']);
      if (node.elseStatement) routesVisit(node.elseStatement, ['admin']);
      return;
    }
    if (ts.isIfStatement(node)) {
      const condition = print(node.expression, http);
      const path = /path === ["'](\/api\/[^"']+)["']/.exec(condition)?.[1];
      const method = /req.method === ["'](GET|POST)["']/.exec(condition)?.[1];
      if (path && method) routes.push({ path, method });
      if (method) for (const action of condition.matchAll(/action === [\"\']([^\"\']+)[\"\']/g)) for (const role of roles) routes.push({ path: `/api/${role}/${action[1]}`, method });
    }
    ts.forEachChild(node, child => routesVisit(child, roles));
  }
  routesVisit(http);
  output.set('docs/reference/http-api.md', '# Ветки HTTP API\n\nИзвлечено из AST [createApp](backend--http.md#symbol-createApp). Это список веток, не JSON Schema.\n\n| Метод | Путь |\n| --- | --- |\n' + routes.sort((a,b) => a.path.localeCompare(b.path)).map(r => `| ${r.method} | \`${r.path}\` |`).join('\n') + '\n');
  const storage = ts.createSourceFile('store.ts', readFileSync(resolve(root, 'backend/storage/store.ts'), 'utf8'), ts.ScriptTarget.Latest, true);
  const sql = [];
  //: Извлекает строковые DDL-вызовы из Store.
  //: SQL не выполняется, рабочая БД не открывается.
  function sqlVisit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(storage) === 'this.db.exec' && ts.isStringLiteral(node.arguments[0]) && /CREATE TABLE/i.test(node.arguments[0].text)) sql.push(node.arguments[0].text.split(';').map(s => s.trim()).filter(Boolean).join(';\n') + ';');
    ts.forEachChild(node, sqlVisit);
  }
  sqlVisit(storage);
  output.set('docs/reference/sqlite-schema.md', '# SQLite DDL из исходников\n\nСтроковые аргументы инициализации [Store.constructor](backend--storage--store.md#symbol-Store.constructor). Рабочая БД не открывается, SQL не исполняется.\n\n```sql\n' + sql.join('\n') + '\n```\n');
  const tests = [];
  //: Ищет собственные test/spec файлы в каталоге test.
  //: Не запускает тестовые серверы и не читает runtime-артефакты.
  function testsWalk(directory) {
    for (const entry of readdirSync(resolve(root, directory), { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) testsWalk(path);
      else if (/\.(?:test|spec)\.(?:ts|mjs)$/.test(path)) {
        const file = ts.createSourceFile(path, readFileSync(resolve(root, path), 'utf8'), ts.ScriptTarget.Latest, true);
        //: Извлекает строковые имена test-вызовов из AST.
        //: Список описывает наличие сценария, а не результат прогона.
        function testsVisit(node) {
          if (ts.isCallExpression(node) && node.expression.getText(file) === 'test' && ts.isStringLiteral(node.arguments[0])) tests.push(`- [${path}](../../${path}): ${node.arguments[0].text}`);
          ts.forEachChild(node, testsVisit);
        }
        testsVisit(file);
      }
    }
  }
  testsWalk('test');
  output.set('docs/reference/tests.md', '# Именованные сценарии тестов\n\nИзвлечены имена test(...) без запуска. Наличие сценария не означает успешный прогон.\n\n' + tests.sort().join('\n') + '\n');
  return output;
}

//: Проверяет относительные Markdown-ссылки и явные якоря справочника.
//: Не запрашивает внешние URL; номера строк и выход за репозиторий запрещены.
export function checkLinks(root, output) {
  const files = ['README.md', 'AGENTS.md', 'VERIFICATION.md'];
  //: Находит Markdown-страницы тематической документации.
  //: Симлинки не обходятся; генерируемые страницы проверяются тем же проходом.
  function walk(directory) {
    for (const entry of readdirSync(resolve(root, directory), { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else if (path.endsWith('.md')) files.push(path);
    }
  }
  walk('docs');
  for (const file of new Set([...files, ...output.keys()].filter(p => p.endsWith('.md')))) {
    const text = output.get(file) ?? readFileSync(resolve(root, file), 'utf8');
    for (const match of text.matchAll(/\[[^\]]*\]\(([^\s)]+)\)/g)) {
      const target = match[1];
      if (/^(?:https?:|mailto:)/.test(target)) continue;
      const [path, fragment] = target.split('#');
      if (fragment && /^L\d/.test(fragment)) throw new Error(`${file}: построчная ссылка ${target}`);
      const absolute = resolve(root, dirname(file), decodeURIComponent(path || '.'));
      const key = path ? relative(root, absolute) : file;
      if ((key.startsWith('..') && key !== '../deploy/messenger/README.md') || (!output.has(key) && !existsSync(resolve(root, key)))) throw new Error(`${file}: отсутствует файл ${target}`);
      if (fragment && key.startsWith('docs/reference/')) {
        const content = output.get(key) ?? readFileSync(resolve(root, key), 'utf8');
        if (!content.includes(`id="${fragment}"`)) throw new Error(`${file}: отсутствует якорь ${target}`);
      }
    }
  }
}

//: Записывает только изменённые страницы или проверяет весь ожидаемый набор.
//: Режим check не меняет файлы и обнаруживает лишние страницы справочника.
export function synchronize(root, output, check = false) {
  const differences = [];
  const directory = resolve(root, 'docs/reference');
  if (existsSync(directory)) for (const name of readdirSync(directory)) if (!output.has(`docs/reference/${name}`)) differences.push(`Лишний файл: docs/reference/${name}`);
  for (const [path, expected] of output) {
    const absolute = resolve(root, path);
    if (existsSync(absolute) && readFileSync(absolute, 'utf8') === expected) continue;
    differences.push(`Обновить: ${path}`);
    if (!check) { mkdirSync(dirname(absolute), { recursive: true }); writeFileSync(absolute, expected); }
  }
  if (differences.some(s => s.startsWith('Лишний')) || (check && differences.length)) throw new Error(differences.join('\n'));
  return differences.length;
}

//: Обрабатывает CLI генерации и проверки справочника.
//: --root нужен для изолированных тестов; рабочие серверы не затрагиваются.
function main() {
  const args = process.argv.slice(2);
  const rootIndex = args.indexOf('--root');
  const root = rootIndex >= 0 ? resolve(args[rootIndex + 1]) : fileURLToPath(new URL('../', import.meta.url));
  const output = buildReference(root);
  checkLinks(root, output);
  const changed = synchronize(root, output, args.includes('--check'));
  console.log(`Документация: ${output.size} файлов; ${args.includes('--check') ? 'актуальна' : 'обновлено ' + changed}.`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
