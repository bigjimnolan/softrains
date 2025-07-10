clean: 
	rm -rf build

init: 
	mkdir -p ./build

build: init
	go build -o build/softrains

docker-build:
	docker build -t softrains -f docker/Dockerfile .
