##
# Перезапуск
##
re:
	docker-compose down
	docker-compose build
	docker-compose up --remove-orphans

sh:
	docker-compose exec application sh

sh-redis:
	docker-compose exec redis sh

ps:
	docker-compose ps