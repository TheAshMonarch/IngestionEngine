.PHONY: run test bench build up down k6

# Run server locally
run:
	go run cmd/server/main.go

# Run unit tests
test:
	go test -v -race ./...

# Run parallel throughput benchmarks
bench:
	go test -bench=BenchmarkIngestionThroughput -benchmem -benchtime=5s ./benchmarks/...

# Compile optimized binary
build:
	CGO_ENABLED=0 go build -ldflags="-s -w" -o bin/ingestion-engine cmd/server/main.go

# Start Docker environment with MongoDB & Redis
up:
	docker-compose up -d

down:
	docker-compose down

# Run k6 load test against running engine
k6:
	k6 run benchmarks/k6_script.js
