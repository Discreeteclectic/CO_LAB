# CO-LAB CRM - Техническая документация

## Обзор архитектуры

CO-LAB CRM - система управления взаимоотношениями с клиентами, построенная на архитектуре с разделением фронтенда и бэкенда.

### Текущая архитектура (Phase 4)
- **Фронтенд**: Vanilla JavaScript, HTML5, CSS3
- **Бэкенд**: Node.js с HTTP сервером 
- **Развертывание**: Unified server (single-origin) для обхода CORS
- **База данных**: Mock API с JSON responses (готово для интеграции с реальной БД)

## Структура проекта

```
colab-crm/
├── frontend/                 # Клиентская часть
│   ├── js/                  # JavaScript модули
│   │   ├── api.js          # API клиент
│   │   ├── auth.js         # Аутентификация
│   │   └── utils.js        # Утилиты
│   ├── css/                # Стили
│   ├── simple-login.html   # Точка входа
│   ├── markup_calculator.html # Главная страница
│   ├── clients.html        # Управление клиентами
│   ├── warehouse.html      # Управление складом
│   ├── orders.html         # Управление заказами
│   └── contracts.html      # Управление договорами
├── backend/                 # Серверная часть
│   ├── simple-all-in-one.js # Unified server
│   ├── server.log          # Логи сервера
│   └── warehouse-debug.html # Диагностика
└── docs/                   # Документация
```

## API Endpoints

### Аутентификация
```
POST /api/auth/login        # Вход в систему
GET  /api/auth/verify       # Проверка токена
```

### Клиенты
```
GET  /api/clients           # Получить список клиентов
POST /api/clients           # Создать нового клиента
PUT  /api/clients/:id       # Обновить клиента
DELETE /api/clients/:id     # Удалить клиента
```

### Склад
```
GET  /api/warehouse         # Получить товары (для создания заказов)
GET  /api/products          # Получить все товары с фильтрами
GET  /api/warehouse/stats   # Статистика склада
POST /api/products          # Добавить товар
PUT  /api/products/:id      # Обновить товар
DELETE /api/products/:id    # Удалить товар
```

### Заказы
```
GET  /api/orders            # Получить список заказов
POST /api/orders            # Создать новый заказ
PUT  /api/orders/:id        # Обновить заказ
DELETE /api/orders/:id      # Удалить заказ
GET  /api/orders/stats/overview # Статистика заказов
```

### Договоры
```
GET  /api/contracts         # Получить список договоров
POST /api/contracts         # Создать договор
PUT  /api/contracts/:id     # Обновить договор
DELETE /api/contracts/:id   # Удалить договор
GET  /api/contracts/stats/overview # Статистика договоров
```

### Менеджеры
```
GET  /api/managers          # Получить список менеджеров
```

## Решенные технические проблемы

### 1. CORS в Safari
**Проблема**: Safari блокировал cross-origin запросы между localhost:8080 (frontend) и localhost:5001 (backend).

**Решение**: Создан unified server (`simple-all-in-one.js`) который обслуживает и фронтенд, и API с одного порта (8081), что устраняет cross-origin запросы.

### 2. Структуры данных API
**Проблема**: Несоответствие между ожидаемыми фронтендом и возвращаемыми бэкендом структурами данных.

**Решения**:
- Договоры: Добавлен вложенный объект `client` с полем `name`
- Заказы: Добавлены поля `number`, `client.name`, `totalAmount`, `itemsCount`
- Склад: Исправлена обработка плоской структуры данных
- Создание заказов: API `/api/warehouse` возвращает массив `items` вместо `products`

### 3. Аутентификация
**Проблема**: Петли редиректов после входа в систему.

**Решение**: 
- Отключены проверки `requireAuth()` для демо-режима
- Изменены редиректы на `simple-login.html`
- Упрощена логика аутентификации

## Конфигурация сервера

### Запуск production сервера
```bash
cd /Users/ivanpozdnyakov/colab-crm/backend
node simple-all-in-one.js
```

### Доступ к системе
- URL: http://localhost:8081/simple-login.html
- Логин: test@test.com  
- Пароль: password123

### Логирование
Логи сервера записываются в `server.log` с информацией о запросах API.

## Модули фронтенда

### API Client (`js/api.js`)
- Базовый URL: `/api` (relative для same-origin)
- Методы для всех CRUD операций
- Обработка ошибок и таймаутов
- Автоматические редиректы при ошибках аутентификации

### Auth Module (`js/auth.js`)
- JWT токен аутентификация
- LocalStorage для сохранения токенов
- Автоматическая проверка токенов
- Логаут с очисткой сессии

### Utils (`js/utils.js`)
- Форматирование дат и чисел
- Валидация форм
- Общие UI утилиты
- Обработка статусов

## Структуры данных

### Client
```javascript
{
  id: string,
  name: string,
  phone: string,
  email: string,
  status: 'active' | 'inactive',
  manager: string,
  createdAt: string,
  updatedAt: string
}
```

### Product
```javascript
{
  id: string,
  name: string,
  sku: string,
  price: number,
  purchasePrice: number,
  quantity: number,
  minQuantity: number,
  supplier: string,
  category: string,
  description: string,
  location: string,
  status: 'active' | 'inactive',
  unit: string,
  createdAt: string,
  updatedAt: string
}
```

### Order
```javascript
{
  id: string,
  number: string,
  clientId: string,
  client: {
    id: string,
    name: string,
    phone: string,
    email: string
  },
  status: 'CREATED' | 'CALCULATION' | 'APPROVED' | 'COMPLETED',
  totalAmount: number,
  items: Array<OrderItem>,
  itemsCount: number,
  createdAt: string,
  updatedAt: string
}
```

### Contract
```javascript
{
  id: string,
  contractNumber: string,
  clientId: string,
  client: {
    id: string,
    name: string,
    inn: string,
    phone: string,
    email: string
  },
  contractType: 'service' | 'product' | 'mixed',
  contractDate: string,
  signedDate: string,
  status: 'active' | 'completed' | 'cancelled',
  totalAmount: number,
  startDate: string,
  endDate: string,
  description: string,
  createdAt: string,
  updatedAt: string
}
```

## Диагностика и отладка

### Диагностическая страница
URL: http://localhost:8081/warehouse-debug.html

Позволяет тестировать все API endpoints и анализировать структуры данных.

### Health Check
```bash
curl http://localhost:8081/health
```

### Тестирование API
```bash
# Тест warehouse endpoint
curl "http://localhost:8081/api/warehouse" | jq .

# Тест клиентов
curl "http://localhost:8081/api/clients" | jq .

# Тест заказов  
curl "http://localhost:8081/api/orders" | jq .
```

## Безопасность

### Текущий уровень (Demo)
- Базовая аутентификация с mock токенами
- Отключенные проверки авторизации для демо
- Все запросы проходят без валидации

### Рекомендации для Production
- Включить полную JWT аутентификацию
- Добавить RBAC (Role-Based Access Control)
- Валидация всех входящих данных
- Rate limiting
- HTTPS обязательно
- Логирование безопасности

## Performance

### Текущая оптимизация
- Single-origin serving для минимизации задержек
- Минимальная пагинация (limit=20)
- Кеширование статических файлов браузером
- Сжатие JSON responses

### Масштабирование
- База данных: готово к интеграции с PostgreSQL/MySQL
- Кеширование: архитектура готова для Redis
- Load balancing: можно развернуть multiple instances
- CDN: статические файлы готовы для CDN

## Следующие шаги

1. **Интеграция реальной БД** - заменить mock API на PostgreSQL/MySQL
2. **Полная аутентификация** - JWT с refresh tokens
3. **Production готовность** - HTTPS, environment variables, Docker
4. **Monitoring** - логирование, метрики, alerting
5. **Testing** - unit, integration, e2e тесты

## Контакты и поддержка

Для вопросов по технической реализации обращаться к команде разработки CO-LAB CRM.

---
*Документация обновлена: 2025-08-28*