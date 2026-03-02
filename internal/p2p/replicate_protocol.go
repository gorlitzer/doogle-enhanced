package p2p

import (
	"bufio"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"sort"
	"time"

	"github.com/libp2p/go-libp2p/core/host"
	"github.com/libp2p/go-libp2p/core/network"
	"github.com/libp2p/go-libp2p/core/peer"

	"github.com/doogle/doogle-v2/internal/models"
)

// ReplicateRequest is sent to replica peers to replicate documents.
type ReplicateRequest struct {
	Documents  []*models.Document `json:"documents"`
	Generation uint64             `json:"generation"`
}

// ReplicateResponse is the acknowledgment from a replica peer.
type ReplicateResponse struct {
	Status   string `json:"status"`
	Accepted int    `json:"accepted"`
}

// AntiEntropyRequest is used for Merkle-based consistency checks.
type AntiEntropyRequest struct {
	Domain     string `json:"domain"`
	MerkleRoot string `json:"merkle_root"`
	DocIDs     []string `json:"doc_ids,omitempty"`
}

// AntiEntropyResponse contains the differing document IDs.
type AntiEntropyResponse struct {
	Status     string   `json:"status"`
	MerkleRoot string   `json:"merkle_root"`
	MissingIDs []string `json:"missing_ids,omitempty"`
}

// ReplicateHandler processes incoming replication requests.
// senderPeerID is the remote peer that opened the stream.
type ReplicateHandler func(senderPeerID string, req *ReplicateRequest) (*ReplicateResponse, error)

// RegisterReplicateProtocol sets up the /doogle/replicate/1.0.0 stream handler.
func RegisterReplicateProtocol(h host.Host, handler ReplicateHandler) {
	h.SetStreamHandler(ReplicateProtocol, func(s network.Stream) {
		defer s.Close()

		senderPeerID := s.Conn().RemotePeer().String()

		reader := bufio.NewReader(io.LimitReader(s, 50<<20)) // 50 MB max
		data, err := reader.ReadBytes('\n')
		if err != nil && err != io.EOF {
			log.Printf("replicate protocol: read error: %v", err)
			return
		}

		var req ReplicateRequest
		if err := json.Unmarshal(data, &req); err != nil {
			log.Printf("replicate protocol: unmarshal error: %v", err)
			return
		}

		resp, err := handler(senderPeerID, &req)
		if err != nil {
			log.Printf("replicate protocol: handler error: %v", err)
			resp = &ReplicateResponse{Status: "error"}
		}

		respData, err := json.Marshal(resp)
		if err != nil {
			log.Printf("replicate protocol: marshal error: %v", err)
			return
		}
		respData = append(respData, '\n')
		s.Write(respData)
	})
}

// ReplicateDocuments sends documents to a replica peer.
func ReplicateDocuments(ctx context.Context, h host.Host, peerID peer.ID, req *ReplicateRequest, timeout time.Duration) (*ReplicateResponse, error) {
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	s, err := h.NewStream(ctx, peerID, ReplicateProtocol)
	if err != nil {
		return nil, fmt.Errorf("open replicate stream to %s: %w", peerID.String()[:12], err)
	}
	defer s.Close()

	data, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("marshal replicate request: %w", err)
	}
	data = append(data, '\n')
	if _, err := s.Write(data); err != nil {
		return nil, fmt.Errorf("write replicate request: %w", err)
	}
	s.CloseWrite()

	reader := bufio.NewReader(io.LimitReader(s, 1<<20)) // 1 MB max
	respData, err := reader.ReadBytes('\n')
	if err != nil && err != io.EOF {
		return nil, fmt.Errorf("read replicate response: %w", err)
	}

	var resp ReplicateResponse
	if err := json.Unmarshal(respData, &resp); err != nil {
		return nil, fmt.Errorf("unmarshal replicate response: %w", err)
	}
	return &resp, nil
}

// ComputeMerkleRoot computes a simple Merkle root hash from a sorted list of document IDs.
func ComputeMerkleRoot(docIDs []string) string {
	if len(docIDs) == 0 {
		return ""
	}
	sorted := make([]string, len(docIDs))
	copy(sorted, docIDs)
	sort.Strings(sorted)

	h := sha256.New()
	for _, id := range sorted {
		h.Write([]byte(id))
	}
	return hex.EncodeToString(h.Sum(nil))
}
