clean: 
	rm -rf build

init: 
	mkdir -p ./build

build: init
	go build -o build/softrains

docker-build:
	docker build -t softrains -f docker/Dockerfile .

docker-restart-softrains:
	docker compose -f docker-compose/docker-compose.yml rm -sf softrains
	docker compose -f docker-compose/docker-compose.yml up -d softrains

softrains-all: build docker-build docker-restart-softrains

dev-ui:
	docker cp uiservice/static $$(docker compose -f docker-compose/docker-compose.yml ps -q softrains):/app/
	docker cp uiservice/templates $$(docker compose -f docker-compose/docker-compose.yml ps -q softrains):/app/
