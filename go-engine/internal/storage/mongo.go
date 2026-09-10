package storage

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/telemetry/ingestion-engine/internal/event"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// MongoConfig holds connection parameters for MongoDB
type MongoConfig struct {
	URI            string
	Database       string
	Collection     string
	MaxPoolSize    uint64
	MinPoolSize    uint64
	ConnectTimeout time.Duration
	SocketTimeout  time.Duration
}

// MongoStorage implements the batch.Flusher interface via native MongoDB driver
type MongoStorage struct {
	client     *mongo.Client
	collection *mongo.Collection
	dbName     string
	collName   string
}

// NewMongoStorage initializes client with optimized connection pooling and compound indices.
func NewMongoStorage(ctx context.Context, cfg MongoConfig) (*MongoStorage, error) {
	if cfg.MaxPoolSize == 0 {
		cfg.MaxPoolSize = 100 // High-velocity concurrency pool
	}
	if cfg.MinPoolSize == 0 {
		cfg.MinPoolSize = 20
	}
	if cfg.ConnectTimeout == 0 {
		cfg.ConnectTimeout = 10 * time.Second
	}

	opts := options.Client().
		ApplyURI(cfg.URI).
		SetMaxPoolSize(cfg.MaxPoolSize).
		SetMinPoolSize(cfg.MinPoolSize).
		SetConnectTimeout(cfg.ConnectTimeout).
		SetSocketTimeout(cfg.SocketTimeout)

	client, err := mongo.Connect(ctx, opts)
	if err != nil {
		return nil, fmt.Errorf("mongo connect failed: %w", err)
	}

	// Ping database to verify connection
	pingCtx, pingCancel := context.WithTimeout(ctx, 3*time.Second)
	defer pingCancel()
	if err := client.Ping(pingCtx, nil); err != nil {
		return nil, fmt.Errorf("mongo ping verification failed: %w", err)
	}

	coll := client.Database(cfg.Database).Collection(cfg.Collection)
	ms := &MongoStorage{
		client:     client,
		collection: coll,
		dbName:     cfg.Database,
		collName:   cfg.Collection,
	}

	// Ensure optimized compound indexes for time-series lookups
	if err := ms.ensureIndexes(ctx); err != nil {
		slog.Warn("Failed to establish compound indexes", slog.String("error", err.Error()))
	}

	slog.Info("MongoDB storage initialized successfully",
		slog.String("db", cfg.Database),
		slog.String("collection", cfg.Collection),
		slog.Uint64("max_pool_size", cfg.MaxPoolSize),
	)

	return ms, nil
}

// ensureIndexes configures compound indexes for fast time-series queries and trace lookups.
func (ms *MongoStorage) ensureIndexes(ctx context.Context) error {
	indexModels := []mongo.IndexModel{
		// 1. Service + Timestamp compound index for service log inspection
		{
			Keys: bson.D{
				{Key: "service", Value: 1},
				{Key: "timestamp", Value: -1},
				{Key: "level", Value: 1},
			},
			Options: options.Index().SetName("idx_service_timestamp_level"),
		},
		// 2. TraceID index for distributed tracing queries
		{
			Keys: bson.D{
				{Key: "trace_id", Value: 1},
				{Key: "timestamp", Value: -1},
			},
			Options: options.Index().SetName("idx_trace_timestamp"),
		},
	}

	opts := options.CreateIndexes().SetMaxTime(5 * time.Second)
	_, err := ms.collection.Indexes().CreateMany(ctx, indexModels, opts)
	return err
}

// FlushBatch writes a batch of events using MongoDB's high-speed BulkWrite API (unordered for speed).
func (ms *MongoStorage) FlushBatch(ctx context.Context, events []event.TelemetryEvent) error {
	if len(events) == 0 {
		return nil
	}

	models := make([]mongo.WriteModel, len(events))
	for i, ev := range events {
		models[i] = mongo.NewInsertOneModel().SetDocument(ev)
	}

	// Set Ordered to false: allows inserts to proceed in parallel across shards/partitions
	bulkOpts := options.BulkWrite().SetOrdered(false)
	result, err := ms.collection.BulkWrite(ctx, models, bulkOpts)
	if err != nil {
		return fmt.Errorf("bulk write error: %w", err)
	}

	slog.Debug("Mongo BulkWrite completed",
		slog.Int64("inserted_count", result.InsertedCount),
	)
	return nil
}

// Close gracefully closes the MongoDB connection pool
func (ms *MongoStorage) Close(ctx context.Context) error {
	return ms.client.Disconnect(ctx)
}
