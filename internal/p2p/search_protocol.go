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

	"github.com/doogle/doogle-v2/internal/models"
)

// SearchHandler processes incoming search requests from peers.
type SearchHandler func(req *models.SearchRequest) (*models.SearchResponse, error)

// RegisterSearchProtocol sets up the /doogle/search/1.0.0 stream handler.
func RegisterSearchProtocol(h host.Host, handler SearchHandler) {
	h.SetStreamHandler(SearchProtocol, func(s network.Stream) {
		defer s.Close()

		// Read request
		reader := bufio.NewReader(s)
		data, err := reader.ReadBytes('\n')
		if err != nil && err != io.EOF {
			log.Printf("search protocol: read error: %v", err)
			return
		}

		var req models.SearchRequest
		if err := json.Unmarshal(data, &req); err != nil {
			log.Printf("search protocol: unmarshal error: %v", err)
			return
		}

		// Handle search
		resp, err := handler(&req)
		if err != nil {
			log.Printf("search protocol: handler error: %v", err)
			resp = &models.SearchResponse{Query: req.Query}
		}

		// Write response
		respData, err := json.Marshal(resp)
		if err != nil {
			log.Printf("search protocol: marshal error: %v", err)
			return
		}
		respData = append(respData, '\n')
		s.Write(respData)
	})
}

// QueryPeer sends a search request to a specific peer and returns results.
func QueryPeer(ctx context.Context, h host.Host, peerID peer.ID, req *models.SearchRequest, timeout time.Duration) (*models.SearchResponse, error) {
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	s, err := h.NewStream(ctx, peerID, SearchProtocol)
	if err != nil {
		return nil, fmt.Errorf("open stream to %s: %w", peerID.String()[:12], err)
	}
	defer s.Close()

	// Send request
	reqData, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}
	reqData = append(reqData, '\n')
	if _, err := s.Write(reqData); err != nil {
		return nil, fmt.Errorf("write request: %w", err)
	}
	s.CloseWrite()

	// Read response
	reader := bufio.NewReader(s)
	respData, err := reader.ReadBytes('\n')
	if err != nil && err != io.EOF {
		return nil, fmt.Errorf("read response: %w", err)
	}

	var resp models.SearchResponse
	if err := json.Unmarshal(respData, &resp); err != nil {
		return nil, fmt.Errorf("unmarshal response: %w", err)
	}

	return &resp, nil
}
