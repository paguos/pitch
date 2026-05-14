.PHONY: up down logs seed test backend-test backend-build frontend-build clean

up:
	docker compose up -d --build

down:
	docker compose down

logs:
	docker compose logs -f --tail=200

seed:
	docker compose exec -T db psql -U fifa -d fifa < db/seed/teams.sql

migrate:
	docker compose exec backend /app/migrate up

test: backend-test

backend-test:
	cd backend && go test ./...

backend-build:
	cd backend && go build -o bin/server ./cmd/server

clean:
	docker compose down -v
