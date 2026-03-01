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
)

// AntiEntropyHandler processes incoming anti-entropy requests.
type AntiEntropyHandler func(req *AntiEntropyRequest) (*AntiEntropyResponse, error)

// RegisterAntiEntropyProtocol sets up the /doogle/antientropy/1.0.0 stream handler.
func RegisterAntiEntropyProtocol(h host.Host, handler AntiEntropyHandler) {
	h.SetStreamHandler(AntiEntropyProtocol, func(s network.Stream) {
		defer s.Close()

		reader := bufio.NewReader(s)
		data, err := reader.ReadBytes('\n')
		if err != nil && err != io.EOF {
			log.Printf("antientropy protocol: read error: %v", err)
			return
		}

		var req AntiEntropyRequest
		if err := json.Unmarshal(data, &req); err != nil {
			log.Printf("antientropy protocol: unmarshal error: %v", err)
			return
		}

		resp, err := handler(&req)
		if err != nil {
			log.Printf("antientropy protocol: handler error: %v", err)
			resp = &AntiEntropyResponse{Status: "error"}
		}

		respData, err := json.Marshal(resp)
		if err != nil {
			log.Printf("antientropy protocol: marshal error: %v", err)
			return
		}
		respData = append(respData, '\n')
		s.Write(respData)
	})
}

// SendAntiEntropyRequest sends an anti-entropy request to a peer and returns the response.
func SendAntiEntropyRequest(ctx context.Context, h host.Host, peerID peer.ID, req *AntiEntropyRequest, timeout time.Duration) (*AntiEntropyResponse, error) {
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	s, err := h.NewStream(ctx, peerID, AntiEntropyProtocol)
	if err != nil {
		return nil, fmt.Errorf("open antientropy stream to %s: %w", peerID.String()[:12], err)
	}
	defer s.Close()

	data, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("marshal antientropy request: %w", err)
	}
	data = append(data, '\n')
	if _, err := s.Write(data); err != nil {
		return nil, fmt.Errorf("write antientropy request: %w", err)
	}
	s.CloseWrite()

	reader := bufio.NewReader(s)
	respData, err := reader.ReadBytes('\n')
	if err != nil && err != io.EOF {
		return nil, fmt.Errorf("read antientropy response: %w", err)
	}

	var resp AntiEntropyResponse
	if err := json.Unmarshal(respData, &resp); err != nil {
		return nil, fmt.Errorf("unmarshal antientropy response: %w", err)
	}
	return &resp, nil
}
