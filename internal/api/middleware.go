package api

import (
	"crypto/subtle"
	"log"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

// LoopbackOnly is middleware that restricts access to loopback addresses.
func LoopbackOnly(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !isLoopback(r) {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusForbidden)
			w.Write([]byte(`{"error":"admin endpoints are only available from localhost"}`))
			return
		}
		next.ServeHTTP(w, r)
	})
}

// SecurityHeaders adds common security headers to all responses.
func SecurityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("X-XSS-Protection", "1; mode=block")
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
		next.ServeHTTP(w, r)
	})
}

// Logger is HTTP request logging middleware.
func Logger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		log.Printf("api: %s %s %v", r.Method, r.URL.Path, time.Since(start))
	})
}

// RateLimiter returns middleware that limits requests per IP.
// rps is max requests per second; burst is the token bucket size.
func RateLimiter(rps float64, burst int) func(http.Handler) http.Handler {
	type visitor struct {
		tokens   float64
		lastSeen time.Time
	}

	var (
		mu       sync.Mutex
		visitors = make(map[string]*visitor)
	)

	// Cleanup stale entries every 3 minutes.
	go func() {
		for {
			time.Sleep(3 * time.Minute)
			mu.Lock()
			for ip, v := range visitors {
				if time.Since(v.lastSeen) > 3*time.Minute {
					delete(visitors, ip)
				}
			}
			mu.Unlock()
		}
	}()

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ip, _, _ := net.SplitHostPort(r.RemoteAddr)
			if ip == "" {
				ip = r.RemoteAddr
			}

			mu.Lock()
			v, ok := visitors[ip]
			if !ok {
				v = &visitor{tokens: float64(burst)}
				visitors[ip] = v
			}

			// Refill tokens based on elapsed time.
			elapsed := time.Since(v.lastSeen).Seconds()
			v.tokens += elapsed * rps
			if v.tokens > float64(burst) {
				v.tokens = float64(burst)
			}
			v.lastSeen = time.Now()

			if v.tokens < 1 {
				mu.Unlock()
				http.Error(w, `{"error":"rate limit exceeded"}`, http.StatusTooManyRequests)
				return
			}
			v.tokens--
			mu.Unlock()

			next.ServeHTTP(w, r)
		})
	}
}

// isLoopback returns true if the request originates from a loopback address.
func isLoopback(r *http.Request) bool {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

// isLoopbackHost reports whether a bind address string refers to loopback.
func isLoopbackHost(host string) bool {
	if host == "localhost" {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

// HostAllowlist rejects requests whose Host header is not an accepted value.
// This defeats DNS-rebinding: a malicious page cannot reach a loopback-bound
// server via its own (rebound) hostname because the Host header won't match.
//
// When the server is bound to loopback, only loopback Host values are allowed.
// When bound to a wildcard or public address, the operator has explicitly opted
// into network exposure and the set of valid external hostnames is unknown, so
// Host validation is skipped (defense shifts to the reverse proxy / firewall).
func HostAllowlist(bind string) func(http.Handler) http.Handler {
	enforce := isLoopbackHost(bind)
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if enforce {
				host := r.Host
				if h, _, err := net.SplitHostPort(host); err == nil {
					host = h
				}
				if !isLoopbackHost(host) {
					w.Header().Set("Content-Type", "application/json")
					w.WriteHeader(http.StatusForbidden)
					w.Write([]byte(`{"error":"invalid host header"}`))
					return
				}
			}
			next.ServeHTTP(w, r)
		})
	}
}

// BearerAuth returns middleware that checks for a valid Bearer token.
// Also accepts ?_token=... query param for iframe embedding.
func BearerAuth(token string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			provided := ""

			// Check Authorization header.
			auth := r.Header.Get("Authorization")
			if strings.HasPrefix(auth, "Bearer ") {
				provided = auth[7:]
			}

			// Fallback: check query param.
			if provided == "" {
				provided = r.URL.Query().Get("_token")
			}

			if provided == "" || subtle.ConstantTimeCompare([]byte(provided), []byte(token)) != 1 {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusUnauthorized)
				w.Write([]byte(`{"error":"unauthorized: invalid or missing fleet token"}`))
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}
