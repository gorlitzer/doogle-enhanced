package p2p

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"time"

	"github.com/libp2p/go-libp2p/core/host"
	"github.com/libp2p/go-libp2p/core/network"
	"github.com/libp2p/go-libp2p/core/peer"

	"github.com/doogle/doogle-v2/internal/fleet"
)

// ProxyResponseHeader is the JSON header line sent before the raw response body.
type ProxyResponseHeader struct {
	StatusCode    int               `json:"status_code"`
	Headers       map[string]string `json:"headers,omitempty"`
	ContentLength int64             `json:"content_length"`
}

// FleetProxyHandler processes incoming proxy requests on a worker.
// The handler must write the response header line and body to the writer.
type FleetProxyHandler func(senderID peer.ID, req *fleet.ProxyRequest, w io.Writer)

// RegisterFleetProxyProtocol sets up the proxy stream handler on the worker.
func RegisterFleetProxyProtocol(h host.Host, handler FleetProxyHandler) {
	h.SetStreamHandler(FleetProxyProtocol, func(s network.Stream) {
		defer s.Close()
		s.SetDeadline(time.Now().Add(60 * time.Second))

		// Phase 1: read the proxy request (up to 5 MB)
		reader := bufio.NewReader(io.LimitReader(s, 5<<20))
		data, err := reader.ReadBytes('\n')
		if err != nil && err != io.EOF {
			log.Printf("fleet proxy: read error: %v", err)
			return
		}

		var req fleet.ProxyRequest
		if err := json.Unmarshal(data, &req); err != nil {
			log.Printf("fleet proxy: unmarshal error: %v", err)
			return
		}

		senderID := s.Conn().RemotePeer()

		// Phase 2: handler writes response header + body
		handler(senderID, &req, s)
	})
}

// SendFleetProxy sends a proxy request to a worker and returns the response header and body.
func SendFleetProxy(ctx context.Context, h host.Host, workerID peer.ID, req *fleet.ProxyRequest, timeout time.Duration) (*ProxyResponseHeader, []byte, error) {
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	s, err := h.NewStream(ctx, workerID, FleetProxyProtocol)
	if err != nil {
		return nil, nil, fmt.Errorf("open proxy stream to %s: %w", workerID.String()[:12], err)
	}
	defer s.Close()

	// Phase 1: send request
	reqData, err := json.Marshal(req)
	if err != nil {
		return nil, nil, fmt.Errorf("marshal proxy request: %w", err)
	}
	reqData = append(reqData, '\n')
	if _, err := s.Write(reqData); err != nil {
		return nil, nil, fmt.Errorf("write proxy request: %w", err)
	}
	s.CloseWrite()

	// Phase 2: read response header line
	reader := bufio.NewReader(io.LimitReader(s, 10<<20)) // 10 MB max
	headerLine, err := reader.ReadBytes('\n')
	if err != nil && err != io.EOF {
		return nil, nil, fmt.Errorf("read proxy response header: %w", err)
	}

	var header ProxyResponseHeader
	if err := json.Unmarshal(headerLine, &header); err != nil {
		return nil, nil, fmt.Errorf("unmarshal proxy response header: %w", err)
	}

	// Read raw body
	body, err := io.ReadAll(reader)
	if err != nil {
		return nil, nil, fmt.Errorf("read proxy response body: %w", err)
	}

	return &header, body, nil
}
