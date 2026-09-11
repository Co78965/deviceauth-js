# deviceauth-js

Браузерная библиотека аутентификации по устройству. Считает стабильный отпечаток браузера и вызывает бэкенд на том же origin. Криптография и ключи на фронте **не** выполняются.

Репозиторий: `github.com/Co78965/deviceauth-js`  
Файл: `fingerprint.js` (ESM)  
Парный бэкенд: [`deviceauth-go`](https://github.com/Co78965/deviceauth-go)

## Как это работает

1. `device_register` / `device_auth` собирают сигналы браузера и считают SHA-256 **отпечаток**.
2. Отпечаток (и при необходимости `user_id`) уходит `POST` на ваш сервер.
3. Сервер (обычно deviceauth-go) хранит ключи, ходит в сервис DeviceAuth и отвечает JSON.
4. Библиотека возвращает объект успеха или бросает ошибку с полем `code`.

```
Браузер (этот модуль)
        │  POST /auth/register | /auth/authenticate
        │  { fingerprint, user_id? }
        ▼
Ваш бэкенд (deviceauth-go)
        ▼
Сервис DeviceAuth
```

Пути запросов **зашиты** в модуле. Менять их с фронта нельзя: бэкенд должен слушать именно `/auth/register` и `/auth/authenticate`.

## Установка

Отдельного npm-пакета нет. Подключайте `fingerprint.js` как ES-модуль.

**С GitHub через jsDelivr** (лучше закрепить коммит, а не `main`):

```html
<script type="module">
  import {
    device_auth,
    device_register
  } from 'https://cdn.jsdelivr.net/gh/Co78965/deviceauth-js@main/fingerprint.js';
</script>
```

**Локально** — скопируйте `fingerprint.js` в статику приложения:

```js
import { device_auth, device_register } from './fingerprint.js';
```

Страница должна открываться **с того же origin**, что и маршруты `/auth/*`. Запросы идут относительными URL (`fetch('/auth/...')`), без базового хоста. CORS для этого сценария не нужен.

## Публичный API

```js
export { device_auth, device_register };
```

### `device_register(user_id)`

Регистрация текущего браузера для пользователя.

- `user_id` — обязательная непустая строка. Иначе сразу `Error('user_id_required')` без запроса.
- Запрос: `POST /auth/register` с телом `{ fingerprint, user_id }`.

Успех:

```json
{
  "status": "registered",
  "user_id": "user-123"
}
```

```js
const result = await device_register('user-123');
// result.status === 'registered'
```

### `device_auth(user_id = null)`

Вход по устройству.

- Без аргумента: только `{ fingerprint }`.
- С `user_id`: тот же JSON плюс поле `user_id` — нужно, если бэкенд вернул `multiple_devices`.
- Запрос: `POST /auth/authenticate`.

Успех:

```json
{
  "status": "authenticated",
  "user_id": "<id с сервера>"
}
```

```js
try {
  const result = await device_auth();
  // result.user_id
} catch (err) {
  if (err.code === 'multiple_devices') {
    const result = await device_auth('user-123');
  }
}
```

## Ошибки

Исключения — обычный `Error`. У HTTP-ошибок дополнительно `err.code`.

| Когда | `message` | `code` |
|---|---|---|
| Пустой `user_id` у `device_register` | `user_id_required` | нет |
| Ответ не JSON | `invalid_response` | нет |
| HTTP-ошибка, `error === "multiple_devices"` | `multiple_devices` | `multiple_devices` |
| Любой другой не-OK HTTP | `auth_failed` | `auth_failed` |

Успешный ответ возвращается как объект, не оборачивается.

## Отпечаток устройства

`collectFingerprint` склеивает сигналы через `|` и хеширует SHA-256 (hex, Web Crypto).

Состав:

| Сигнал | Что берётся |
|---|---|
| User-Agent | Client Hints (`userAgentData.getHighEntropyValues`), иначе стабилизированная строка UA (срезаются мелкие версии) |
| Язык | `navigator.language` |
| Платформа | `navigator.platform` |
| Экран | ширина, высота, color/pixel depth, DPR (шаг 0.5) |
| Железо | `hardwareConcurrency`, `deviceMemory`, `maxTouchPoints`, `pdfViewerEnabled` |
| Таймзона | `Intl.DateTimeFormat().resolvedOptions().timeZone` |
| Canvas | отрисовка текста/фигур → SHA-256 пикселей |
| WebGL | vendor и нормализованный renderer |
| Audio | OfflineAudioContext, сумма амплитуд на участке буфера |
| Шрифты | наличие шрифтов из фиксированного списка (`document.fonts.check` или измерение canvas) |

Недоступный сигнал заменяется заглушкой (`no_canvas`, `no_webgl`, `no_audio`, `no_fonts`).

Один браузер на одной машине должен давать один хеш — бэкенд индексирует по нему ключи. Другой браузер, GPU, набор шрифтов или смена масштаба экрана могут дать новый отпечаток;