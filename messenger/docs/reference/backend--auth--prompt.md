# backend/auth/prompt.ts

Скрытый интерактивный ввод в TTY без отражения символов.

[Исходный модуль](../../backend/auth/prompt.ts) · [Индекс](README.md)

<a id="symbol-secretPrompt"></a>

## secretPrompt

Читает секрет из интерактивного терминала без эха.

Требует TTY; Ctrl+C и Ctrl+D отменяют ввод и восстанавливают режим терминала.

```typescript
secretPrompt(label: string): Promise<string>
```

<a id="symbol-secretPrompt.finish"></a>

## secretPrompt.finish

Завершает захват клавиатурного ввода.

Снимает listener, raw mode и приостанавливает stdin.

```typescript
finish()
```

<a id="symbol-secretPrompt.onData"></a>

## secretPrompt.onData

Обрабатывает скрытые символы, удаление и завершение строки.

Декодирует UTF-8 без вывода содержимого в терминал.

```typescript
onData(bytes: Buffer)
```
