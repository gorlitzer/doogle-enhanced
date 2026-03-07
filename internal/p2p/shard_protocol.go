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

// ShardCatalog describes what a peer is responsible for.
type ShardCatalog struct {
	PeerID        string   `json:"peer_id"`
	NodeName      string   `json:"node_name,omitempty"`
	NodeType      string   `json:"node_type,omitempty"`
	Domains       []string `json:"domains"`
	DocCount      uint64   `json:"doc_count"`
	Generation    uint64   `json:"generation"`
	QueriesServed int64    `json:"queries_served,omitempty"`
}

// ShardCatalogHandler processes incoming shard catalog exchanges.
type ShardCatalogHandler func(catalog *ShardCatalog) error

// RegisterShardProtocol sets up the /doogle/shard/1.0.0 stream handler.
func RegisterShardProtocol(h host.Host, handler ShardCatalogHandler) {
	h.SetStreamHandler(ShardProtocol, func(s network.Stream) {
		defer s.Close()

		reader := bufio.NewReader(io.LimitReader(s, 1<<20)) // 1 MB max
		data, err := reader.ReadBytes('\n')
		if err != nil && err != io.EOF {
			log.Printf("shard protocol: read error: %v", err)
			return
		}

		var catalog ShardCatalog
		if err := json.Unmarshal(data, &catalog); err != nil {
			log.Printf("shard protocol: unmarshal error: %v", err)
			return
		}

		if err := handler(&catalog); err != nil {
			log.Printf("shard protocol: handler error: %v", err)
			s.Write([]byte(`{"status":"error"}` + "\n"))
			return
		}

		s.Write([]byte(`{"status":"ok"}` + "\n"))
	})
}

// SendShardCatalog sends our shard catalog to a specific peer.
func SendShardCatalog(ctx context.Context, h host.Host, peerID peer.ID, catalog *ShardCatalog, timeout time.Duration) error {
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	s, err := h.NewStream(ctx, peerID, ShardProtocol)
	if err != nil {
		return fmt.Errorf("open shard stream to %s: %w", peerID.String()[:12], err)
	}
	defer s.Close()

	data, err := json.Marshal(catalog)
	if err != nil {
		return fmt.Errorf("marshal catalog: %w", err)
	}
	data = append(data, '\n')
	if _, err := s.Write(data); err != nil {
		return fmt.Errorf("write catalog: %w", err)
	}
	s.CloseWrite()

	return nil
}
