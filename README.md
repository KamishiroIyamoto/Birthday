# Дни рождения

Разворачивание:

1. Переименовать `.env.example` в `.env`.
2. Переименовать `example-config.js` в `config.js`.
3. Заменить значения в конфиге `apiId` и `apiHash` на свои (сгенерировать в [telegram](https://my.telegram.org/apps)).
4. Выполнить команды:

```bash
make re
curl 0.0.0.0:3000/setup
```

Локальный сервер:
```
http://localhost:3000/
```

__Перед запуском крона обязательна авторизация!!!__

Запуск крона:
```bash
node app/cron.js
```