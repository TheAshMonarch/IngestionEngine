# Multi-stage ultra-lightweight Go binary build
FROM golang:1.22-alpine AS builder

WORKDIR /app
COPY go.mod go.sum* ./
RUN go mod download || true

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o ingestion-engine ./cmd/server/main.go

FROM scratch
COPY --from=builder /app/ingestion-engine /ingestion-engine
EXPOSE 8080
ENTRYPOINT ["/ingestion-engine"]
