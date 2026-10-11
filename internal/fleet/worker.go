package fleet

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"math"
	"net/http"
	"time"

	"github.com/libp2p/go-libp2p/core/peer"
)

// Worker represents a fleet worker node.
type Worker struct {
	hostID            peer.ID
	secret            []byte
	coordinatorID     peer.ID
	localAPIAddr      string // "127.0.0.1:7002"
	heartbeatInterval time.Duration
	statusFn          func() WorkerStats
	nodeName          string
}

// NewWorker creates a new fleet worker.
func NewWorker(hostID, coordinatorID peer.ID, secret []byte, localAPIAddr, nodeName string, heartbeatInterval time.Duration, statusFn func() WorkerStats) *Worker {
	return &Worker{
		hostID:            hostID,
		secret:            secret,
		coordinatorID:     coordinatorID,
		localAPIAddr:      localAPIAddr,
		heartbeatInterval: heartbeatInterval,
		statusFn:          statusFn,
		nodeName:          nodeName,
	}
}

// CoordinatorID returns the peer ID of the coordinator.
func (wk *Worker) CoordinatorID() peer.ID {
	return wk.coordinatorID
}

// HandleProxy processes an incoming proxy request from the coordinator.
// It verifies the sender, HMAC, and timestamp, then executes the HTTP request
// against the local API and writes the response to w.
func (wk *Worker) HandleProxy(senderID peer.ID, req *ProxyRequest, w io.Writer) {
	// Verify sender is the coordinator.
	if senderID != wk.coordinatorID {
		writeProxyError(w, http.StatusForbidden, "unauthorized peer")
		return
	}

	// Verify timestamp (±60s).
	now := time.Now().Unix()
	if math.Abs(float64(now-req.Timestamp)) > 60 {
		writeProxyError(w, http.StatusForbidden, "timestamp expired")
		return
	}

	// Verify HMAC signature.
	msg := proxySignPayload(req)
	if !HMACVerify(wk.secret, msg, req.Signature) {
		writeProxyError(w, http.StatusForbidden, "invalid signature")
		return
	}

	// Build HTTP request to local API.
	targetURL := fmt.Sprintf("http://%s%s", wk.localAPIAddr, req.Path)
	if req.Query != "" {
		targetURL += "?" + req.Query
	}

	var bodyReader io.Reader
	if len(req.Body) > 0 {
		bodyReader = bytes.NewReader(req.Body)
	}

	httpReq, err := http.NewRequest(req.Method, targetURL, bodyReader)
	if err != nil {
		writeProxyError(w, http.StatusBadGateway, fmt.Sprintf("build request: %v", err))
		return
	}
	for k, v := range req.Headers {
		httpReq.Header.Set(k, v)
	}

	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		writeProxyError(w, http.StatusBadGateway, fmt.Sprintf("local API error: %v", err))
		return
	}
	defer resp.Body.Close()

	// Build response headers.
	respHeaders := make(map[string]string)
	for k := range resp.Header {
		respHeaders[k] = resp.Header.Get(k)
	}

	// Write JSON header line.
	header := ProxyResponse{
		StatusCode:    resp.StatusCode,
		Headers:       respHeaders,
		ContentLength: resp.ContentLength,
	}
	headerData, _ := json.Marshal(header)
	headerData = append(headerData, '\n')
	w.Write(headerData)

	// Stream response body (limited to 100 MB).
	io.Copy(w, io.LimitReader(resp.Body, 100<<20))
}

// proxySignPayload builds the message bytes to sign for a proxy request.
func proxySignPayload(req *ProxyRequest) []byte {
	msg := fmt.Sprintf("proxy:%s:%s:%s:%d", req.Method, req.Path, req.Query, req.Timestamp)
	return []byte(msg)
}

// SignProxyRequest fills in the Timestamp and Signature fields of a ProxyRequest.
func SignProxyRequest(secret []byte, req *ProxyRequest) {
	req.Timestamp = time.Now().Unix()
	msg := proxySignPayload(req)
	req.Signature = HMACSign(secret, msg)
}

func writeProxyError(w io.Writer, statusCode int, message string) {
	header := ProxyResponse{
		StatusCode:    statusCode,
		Headers:       map[string]string{"Content-Type": "application/json"},
		ContentLength: -1,
	}
	headerData, _ := json.Marshal(header)
	headerData = append(headerData, '\n')
	w.Write(headerData)

	body, _ := json.Marshal(map[string]string{"error": message})
	w.Write(body)
}

// BuildHeartbeat creates a signed HeartbeatRequest from the current worker state.
func (wk *Worker) BuildHeartbeat() *HeartbeatRequest {
	req := &HeartbeatRequest{
		PeerID:   wk.hostID.String(),
		NodeName: wk.nodeName,
		Stats:    wk.statusFn(),
	}
	SignHeartbeat(wk.secret, req)
	return req
}

// StartHeartbeat begins the heartbeat loop. sendFn is called with each heartbeat.
func (wk *Worker) StartHeartbeat(ctx context.Context, sendFn func(ctx context.Context, req *HeartbeatRequest) error) {
	go func() {
		// Send initial heartbeat immediately.
		req := wk.BuildHeartbeat()
		if err := sendFn(ctx, req); err != nil {
			slog.Error("fleet: initial heartbeat failed", "err", err)
		}

		ticker := time.NewTicker(wk.heartbeatInterval)
		defer ticker.Stop()

		for {
			select {
			case <-ticker.C:
				req := wk.BuildHeartbeat()
				if err := sendFn(ctx, req); err != nil {
					slog.Error("fleet: heartbeat failed", "err", err)
				}
			case <-ctx.Done():
				return
			}
		}
	}()
}
