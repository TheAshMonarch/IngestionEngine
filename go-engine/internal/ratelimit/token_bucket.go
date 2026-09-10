package ratelimit

import (
	"sync"
	"time"
)

// TokenBucket implements a thread-safe token bucket rate limiter.
type TokenBucket struct {
	mu           sync.Mutex
	capacity     float64       // Max token burst capacity
	refillRate   float64       // Tokens replenished per second
	tokens       float64       // Current available tokens
	lastRefill   time.Time     // Timestamp of previous token replenishment
}

// NewTokenBucket creates a new TokenBucket limiter with specified rate and capacity.
func NewTokenBucket(ratePerSec float64, capacity float64) *TokenBucket {
	return &TokenBucket{
		capacity:   capacity,
		refillRate: ratePerSec,
		tokens:     capacity,
		lastRefill: time.Now(),
	}
}

// Allow checks if 1 token can be consumed. Returns true if permitted, false if rate limited.
func (tb *TokenBucket) Allow() bool {
	return tb.AllowN(1)
}

// AllowN checks if n tokens can be consumed atomically.
func (tb *TokenBucket) AllowN(n float64) bool {
	tb.mu.Lock()
	defer tb.mu.Unlock()

	now := time.Now()
	elapsed := now.Sub(tb.lastRefill).Seconds()
	tb.lastRefill = now

	// Replenish tokens based on elapsed duration
	tb.tokens += elapsed * tb.refillRate
	if tb.tokens > tb.capacity {
		tb.tokens = tb.capacity
	}

	if tb.tokens >= n {
		tb.tokens -= n
		return true
	}

	return false
}

// Available returns the current token count and capacity.
func (tb *TokenBucket) Available() (float64, float64) {
	tb.mu.Lock()
	defer tb.mu.Unlock()
	return tb.tokens, tb.capacity
}

// KeyedRateLimiter maintains separate token buckets per client key (e.g., API key or IP).
type KeyedRateLimiter struct {
	mu          sync.RWMutex
	buckets     map[string]*TokenBucket
	ratePerSec  float64
	capacity    float64
	globalLimit *TokenBucket
}

// NewKeyedRateLimiter instantiates a keyed rate limiter with an overarching global limit.
func NewKeyedRateLimiter(ratePerSec, capacity, globalRate, globalCap float64) *KeyedRateLimiter {
	return &KeyedRateLimiter{
		buckets:     make(map[string]*TokenBucket),
		ratePerSec:  ratePerSec,
		capacity:    capacity,
		globalLimit: NewTokenBucket(globalRate, globalCap),
	}
}

// Allow checks both the global ceiling and the client-specific token bucket.
func (k *KeyedRateLimiter) Allow(key string) bool {
	// 1. Check global rate limit
	if !k.globalLimit.Allow() {
		return false
	}

	// 2. Check key-specific rate limit
	k.mu.Lock()
	bucket, exists := k.buckets[key]
	if !exists {
		bucket = NewTokenBucket(k.ratePerSec, k.capacity)
		k.buckets[key] = bucket
	}
	k.mu.Unlock()

	return bucket.Allow()
}
