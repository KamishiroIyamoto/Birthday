##
# Перезапуск
##
re:
	docker-compose down
	docker-compose build
	docker-compose up --remove-orphans

##
# Доступ в контейнер ноды
##
sh:
	docker-compose exec application sh

##
# Доступ в контейнер редиса
##
sh-redis:
	docker-compose exec redis sh

##
# Активные контейнеры
##
ps:
	docker-compose ps

##
# Остановить контейнеры
##
down:
	docker-compose down