# scripts/build-documentation.mjs

AST-справочник, маршруты, DDL, тестовый индекс и проверка ссылок без запуска приложения.

[Исходный модуль](../../scripts/build-documentation.mjs) · [Индекс](README.md)

<a id="symbol-buildReference"></a>

## buildReference

Строит все генерируемые страницы из исходников и тестовых объявлений.

Ничего не импортирует из приложения и не открывает рабочие данные.

```typescript
buildReference(root)
```

<a id="symbol-buildReference.routesVisit"></a>

## buildReference.routesVisit

Извлекает статические ветки HTTP-путей и методов.

Не выдаёт условия маршрутизации за полную JSON-схему запросов.

```typescript
routesVisit(node)
```

<a id="symbol-buildReference.sqlVisit"></a>

## buildReference.sqlVisit

Извлекает строковые DDL-вызовы из Store.

SQL не выполняется, рабочая БД не открывается.

```typescript
sqlVisit(node)
```

<a id="symbol-buildReference.testsWalk"></a>

## buildReference.testsWalk

Ищет собственные test/spec файлы в каталоге test.

Не запускает тестовые серверы и не читает runtime-артефакты.

```typescript
testsWalk(directory)
```

<a id="symbol-buildReference.testsWalk.testsVisit"></a>

## buildReference.testsWalk.testsVisit

Извлекает строковые имена test-вызовов из AST.

Список описывает наличие сценария, а не результат прогона.

```typescript
testsVisit(node)
```

<a id="symbol-checkLinks"></a>

## checkLinks

Проверяет относительные Markdown-ссылки и явные якоря справочника.

Не запрашивает внешние URL; номера строк и выход за репозиторий запрещены.

```typescript
checkLinks(root, output)
```

<a id="symbol-checkLinks.walk"></a>

## checkLinks.walk

Находит Markdown-страницы тематической документации.

Симлинки не обходятся; генерируемые страницы проверяются тем же проходом.

```typescript
walk(directory)
```

<a id="symbol-declarations"></a>

## declarations

Извлекает именованные объявления с полным лексическим именем.

Требует две строки //:; callbacks описываются у именованного владельца.

```typescript
declarations(text, path, validateComments = true)
```

<a id="symbol-declarations.visit"></a>

## declarations.visit

Обходит AST с сохранением лексической области определений.

Различает полные имена, повторные объявления и область именованных владельцев.

```typescript
visit(node, scope = [])
```

<a id="symbol-main"></a>

## main

Обрабатывает CLI генерации и проверки справочника.

--root нужен для изолированных тестов; рабочие серверы не затрагиваются.

```typescript
main()
```

<a id="symbol-pageName"></a>

## pageName

Переводит путь исходника в стабильное имя страницы справочника.

Различает shell и MJS с одним basename; имя не зависит от координат или даты.

```typescript
pageName(path)
```

<a id="symbol-print"></a>

## print

Печатает AST-фрагмент без комментариев и физических координат.

Сохраняет смысл строковых литералов, типов и значений по умолчанию.

```typescript
print(node, file)
```

<a id="symbol-signature"></a>

## signature

Строит сигнатуру объявления без тела функции или класса.

Интерфейсы, type aliases и экспортированные константы сохраняют свои контракты.

```typescript
signature(node, file)
```

<a id="symbol-sourcePaths"></a>

## sourcePaths

Находит исходники только в разрешённых каталогах модуля.

Не обходит .local, node_modules, dist, симлинки и другие проекты.

```typescript
sourcePaths(root)
```

<a id="symbol-sourcePaths.walk"></a>

## sourcePaths.walk

Обходит явно выбранный каталог исходников.

Симлинки пропускаются, результаты ограничены расширениями исходных файлов.

```typescript
walk(directory)
```

<a id="symbol-synchronize"></a>

## synchronize

Записывает только изменённые страницы или проверяет весь ожидаемый набор.

Режим check не меняет файлы и обнаруживает лишние страницы справочника.

```typescript
synchronize(root, output, check = false)
```
