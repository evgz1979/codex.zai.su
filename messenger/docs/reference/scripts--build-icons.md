# scripts/build-icons.mjs

Локальная растеризация квадратной SVG-иконки в три размера PNG через Chromium.

[Исходный модуль](../../scripts/build-icons.mjs) · [Индекс](README.md)

<a id="symbol-buildIcons"></a>

## buildIcons

Растеризует квадратную исходную иконку в PNG для установки приложения.

Фон доходит до всех краёв; скругление выполняет ОС, внешние ресурсы не используются.

```typescript
async buildIcons()
```
