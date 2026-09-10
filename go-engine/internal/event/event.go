package event

import (
	"encoding/json"
	"errors"
	"time"
)

// SeverityLevel represents the log/telemetry severity
type SeverityLevel string

const (
	LevelDebug SeverityLevel = "DEBUG"
	LevelInfo  SeverityLevel = "INFO"
	LevelWarn  SeverityLevel = "WARN"
	LevelError SeverityLevel = "ERROR"
	LevelFatal SeverityLevel = "FATAL"
)

// TelemetryEvent represents a single ingested log or metric data point.
// Uses strict JSON tagging and validation to ensure high-velocity processing.
type TelemetryEvent struct {
	ID        string                 `json:"id" bson:"_id,omitempty"`
	TraceID   string                 `json:"trace_id" bson:"trace_id"`
	SpanID    string                 `json:"span_id,omitempty" bson:"span_id,omitempty"`
	Service   string                 `json:"service" bson:"service"`
	Host      string                 `json:"host" bson:"host"`
	Level     SeverityLevel          `json:"level" bson:"level"`
	Message   string                 `json:"message" bson:"message"`
	Payload   map[string]interface{} `json:"payload,omitempty" bson:"payload,omitempty"`
	Timestamp time.Time              `json:"timestamp" bson:"timestamp"`
	LatencyNs int64                  `json:"latency_ns,omitempty" bson:"latency_ns,omitempty"`
}

// Validate ensures required fields are populated before queuing.
func (e *TelemetryEvent) Validate() error {
	if e.Service == "" {
		return errors.New("missing required field: service")
	}
	if e.Message == "" {
		return errors.New("missing required field: message")
	}
	if e.Timestamp.IsZero() {
		e.Timestamp = time.Now().UTC()
	}
	if e.Level == "" {
		e.Level = LevelInfo
	}
	return nil
}

// BatchRequest represents a batch payload submitted by clients
type BatchRequest struct {
	Events []TelemetryEvent `json:"events"`
}

// ParseEvent decodes and validates incoming raw JSON
func ParseEvent(data []byte) (*TelemetryEvent, error) {
	var ev TelemetryEvent
	if err := json.Unmarshal(data, &ev); err != nil {
		return nil, err
	}
	if err := ev.Validate(); err != nil {
		return nil, err
	}
	return &ev, nil
}
