# 🚀 Инструкция по запуску CO_LAB CRM

## 📋 Предварительные требования

1. **Node.js** (версия 18 или выше)
2. **PostgreSQL** (версия 12 или выше)
3. **npm** или **yarn**

## ⚡ Быстрый старт

### 1. Установка PostgreSQL

#### macOS (с Homebrew):
```bash
brew install postgresql
brew services start postgresql
```

#### Ubuntu/Debian:
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

#### Windows:
Скачайте и установите с официального сайта: https://www.postgresql.org/download/windows/

### 2. Создание базы данных

```bash
# Подключитесь к PostgreSQL
psql postgres

# Создайте базу данных
CREATE DATABASE colab_crm;

# Создайте пользователя (опционально)
CREATE USER colab_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE colab_crm TO colab_user;

# Выйдите из psql
\q
```

### 3. Настройка backend

```bash
# Перейдите в папку backend
cd colab-crm/backend

# Установите зависимости
npm install

# Скопируйте файл окружения
cp .env.example .env
```

### 4. Настройка переменных окружения

Отредактируйте файл `.env`:

```env
# Замените на ваши настройки PostgreSQL
DATABASE_URL="postgresql://postgres:password@localhost:5432/colab_crm?schema=public"

# Или если создали отдельного пользователя
# DATABASE_URL="postgresql://colab_user:your_password@localhost:5432/colab_crm?schema=public"

# JWT секретный ключ (замените на случайную строку)
JWT_SECRET="your-super-secret-jwt-key-change-this-in-production"
JWT_EXPIRES_IN="7d"

# Настройки сервера
PORT=5000
NODE_ENV=development

# Загрузка файлов
MAX_FILE_SIZE=10485760
UPLOAD_PATH="./uploads"

# CORS (добавьте адрес вашего фронтенда)
ALLOWED_ORIGINS="http://localhost:3000,http://localhost:8080,http://127.0.0.1:5500"
```

### 5. Инициализация базы данных

```bash
# Создание и применение миграций
npm run db:migrate

# Заполнение тестовыми данными
npm run db:seed
```

### 6. Запуск backend сервера

```bash
# Development режим (с автоперезагрузкой)
npm run dev

# Или production режим
npm start
```

Сервер запустится на http://localhost:5000

### 7. Настройка frontend

```bash
# Перейдите в папку frontend
cd ../frontend

# Запустите простой HTTP сервер
# Вариант 1: Python (если установлен)
python -m http.server 8080

# Вариант 2: Node.js (если установлен глобально http-server)
npx http-server -p 8080

# Вариант 3: Live Server в VS Code
# Установите расширение Live Server и откройте login.html
```

### 8. Открытие приложения

Откройте браузер и перейдите на:
- Frontend: http://localhost:8080/login.html
- API: http://localhost:5000/health

## 🎯 Демо аккаунты

После выполнения `npm run db:seed` доступны следующие аккаунты:

- **Администратор:** `admin@colab-crm.com` / `admin123`
- **Пользователь:** `demo@colab-crm.com` / `demo123`

## 🛠 Полезные команды

### Backend команды:
```bash
# Просмотр БД через Prisma Studio
npm run db:studio

# Создание новой миграции
npx prisma migrate dev --name your_migration_name

# Сброс БД и повторное заполнение
npx prisma migrate reset

# Генерация Prisma клиента
npm run db:generate

# Проверка статуса миграций
npx prisma migrate status
```

### Отладка:
```bash
# Проверка подключения к БД
npx prisma db pull

# Просмотр схемы БД
npx prisma db push --preview-feature

# Логи сервера
npm run dev -- --verbose
```

## 🔧 Устранение проблем

### Проблема: "Database connection failed"
```bash
# Проверьте, что PostgreSQL запущен
brew services list | grep postgresql  # macOS
sudo systemctl status postgresql       # Linux

# Проверьте строку подключения в .env
# Убедитесь, что база данных создана
psql -l | grep colab_crm
```

### Проблема: "Port 5000 already in use"
```bash
# Найдите процесс, использующий порт
lsof -i :5000

# Убейте процесс или измените PORT в .env
```

### Проблема: "CORS error in browser"
```bash
# Убедитесь, что URL frontend добавлен в ALLOWED_ORIGINS в .env
# Например: ALLOWED_ORIGINS="http://localhost:8080"
```

### Проблема: "Migration failed"
```bash
# Сбросьте миграции и начните заново
npx prisma migrate reset
npm run db:migrate
npm run db:seed
```

## 📱 Использование приложения

1. **Авторизация:** Войдите через login.html
2. **Клиенты:** Управление клиентской базой
3. **Склад:** Учет товаров и операции
4. **Калькулятор:** Расчет наценки и создание предложений

## 🚀 Деплой в производство

### 1. Подготовка:
```bash
# Установите переменные окружения для production
NODE_ENV=production
DATABASE_URL="postgresql://user:pass@your-db-host:5432/colab_crm"
JWT_SECRET="very-secure-random-string"
```

### 2. Сборка:
```bash
npm ci --only=production
npm run db:migrate
```

### 3. Запуск:
```bash
npm start
```

### Рекомендации для production:
- Используйте PM2 для управления процессами
- Настройте nginx как reverse proxy
- Включите HTTPS
- Настройте регулярные бэкапы БД
- Мониторинг логов и производительности

## 📞 Поддержка

При возникновении проблем:

1. Проверьте логи сервера
2. Убедитесь, что все зависимости установлены
3. Проверьте переменные окружения
4. Проверьте подключение к БД

---

**Готово!** Ваша CRM система должна работать! 🎉