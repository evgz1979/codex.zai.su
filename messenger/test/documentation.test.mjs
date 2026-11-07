import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildReference, checkLinks, declarations, sourcePaths, synchronize } from '../scripts/build-documentation.mjs';
const moduleRoot = fileURLToPath(new URL('../', import.meta.url));

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'zai-messenger-docs-'));
  for (const path of sourcePaths(moduleRoot)) {
    mkdirSync(dirname(join(root,path)), { recursive:true });
    writeFileSync(join(root,path), readFileSync(join(moduleRoot,path)));
  }
  // Копируются только руководства и исходники тестов, без .local и runtime-данных.
  cpSync(join(moduleRoot,'docs'),join(root,'docs'),{recursive:true});
  cpSync(join(moduleRoot,'test'),join(root,'test'),{recursive:true});
  for (const name of ['README.md','AGENTS.md','VERIFICATION.md','package.json']) writeFileSync(join(root,name),readFileSync(join(moduleRoot,name)));
  t.after(() => rmSync(root,{recursive:true,force:true}));
  return root;
}

test('документация: AST не зависит от сдвига строк и обычных комментариев', () => {
  const code = '//: Масштабирует значение.\n//: Коэффициент передаётся явно.\nexport function scale(value: number, factor = 1): number { return value * factor; }';
  assert.deepEqual(declarations(code,'sample.ts'),declarations('\n// Обычный комментарий\n\n'+code,'sample.ts'));
  assert.throws(() => declarations(code.replace('//: Коэффициент передаётся явно.','// обычный комментарий'),'sample.ts'),/две непустые строки/);
});

test('документация: полные имена и повтор getter/setter получают разные якоря', () => {
  const code = '//: Контейнер.\n//: Имеет свойство.\nclass Box {\n//: Читает.\n//: Без записи.\nget value() { return 1; }\n//: Пишет.\n//: Без чтения.\nset value(next: number) {}\n}';
  const symbols = declarations(code,'sample.ts');
  assert.ok(symbols.some(s => s.anchor === 'symbol-Box.value'));
  assert.ok(symbols.some(s => s.anchor === 'symbol-Box.value--declaration-2'));
  assert.ok(symbols.find(s => s.anchor.endsWith('--declaration-2')).signature.startsWith('set value('));
});

test('документация: у каждого исходника отдельная страница, включая stop.mjs и stop.sh', () => {
  const output = buildReference(moduleRoot);
  assert.equal(output.size,sourcePaths(moduleRoot).length + 5);
  assert.ok(output.get('docs/reference/scripts--stop.md').includes('[Исходный модуль](../../scripts/stop.mjs)'));
  assert.ok(output.get('docs/reference/scripts--stop-sh.md').includes('[Исходный модуль](../../scripts/stop.sh)'));
});

test('документация: весь справочник побайтно стабилен после сдвигов исходников', t => {
  const root = fixture(t);
  const before = buildReference(root);
  for (const path of sourcePaths(root).filter(p => /\.(ts|tsx|mjs)$/.test(p))) writeFileSync(join(root,path),'\n// Обычный комментарий перед модулем\n\n'+readFileSync(join(root,path),'utf8'));
  assert.deepEqual(buildReference(root),before);
});

test('документация: приватные и сторонние вложенные каталоги не обходятся', t => {
  const root = fixture(t); const before = sourcePaths(root);
  for (const directory of ['backend/.local','frontend/node_modules','shared/dist']) {
    mkdirSync(join(root,directory),{recursive:true});
    writeFileSync(join(root,directory,'private.ts'),'invalid synthetic source that must not be read');
  }
  assert.deepEqual(sourcePaths(root),before);
  assert.doesNotThrow(() => buildReference(root));
});

test('документация: изменение сигнатуры меняет только страницу определения', t => {
  const root = fixture(t); const before = buildReference(root);
  const path = join(root,'shared/types.ts');
  writeFileSync(path,readFileSync(path,'utf8').replace('nativeId: string): EntityId','nativeId: string = \'\'): EntityId'));
  const after = buildReference(root);
  assert.deepEqual([...after.keys()].filter(k => before.get(k) !== after.get(k)),['docs/reference/shared--types.md']);
});

test('документация: новый модуль требует назначения, удалённый оставляет обнаруживаемую страницу', t => {
  const root = fixture(t);
  const fresh = join(root,'backend/new.ts'); writeFileSync(fresh,'export const value = 1;');
  assert.throws(() => buildReference(root),/Нет назначения модуля/); rmSync(fresh);
  rmSync(join(root,'backend/config.ts'));
  const output = buildReference(root);
  assert.throws(() => synchronize(root,output,true),/Лишний файл: docs\/reference\/backend--config.md/);
});

test('документация: битые файлы, якоря и построчные ссылки отклоняются', t => {
  const root = fixture(t); const output = buildReference(root);
  checkLinks(root,output);
  const key = 'docs/reference/README.md'; const original = output.get(key);
  for (const target of ['missing.md','shared--types.md#symbol-Missing','shared--types.md#L123','../../../outside.md']) {
    output.set(key,original+`\n[Проверка](${target})\n`);
    assert.throws(() => checkLinks(root,output),/отсутствует|построчная/);
  }
});

test('документация: check не переписывает устаревший файл и находит лишний', t => {
  const root = fixture(t); const output = buildReference(root);
  synchronize(root,output);
  const file = join(root,'docs/reference/shared--types.md'); writeFileSync(file,'Устаревшая страница\n');
  assert.throws(() => synchronize(root,output,true),/Обновить/);
  assert.equal(readFileSync(file,'utf8'),'Устаревшая страница\n');
  synchronize(root,output); writeFileSync(join(root,'docs/reference/orphan.md'),'Лишняя страница\n');
  assert.throws(() => synchronize(root,output,true),/Лишний файл/);
});
