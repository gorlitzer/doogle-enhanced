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

// CrawlTaskHandler processes incoming crawl task offers from peers.
type CrawlTaskHandler func(task *models.CrawlTask) error

// RegisterCrawlProtocol sets up the /doogle/crawl/1.0.0 stream handler.
func RegisterCrawlProtocol(h host.Host, handler CrawlTaskHandler) {
	h.SetStreamHandler(CrawlProtocol, func(s network.Stream) {
		defer s.Close()

		reader := bufio.NewReader(io.LimitReader(s, 1<<20)) // 1 MB max
		data, err := reader.ReadBytes('\n')
		if err != nil && err != io.EOF {
			log.Printf("crawl protocol: read error: %v", err)
			return
		}

		var task models.CrawlTask
		if err := json.Unmarshal(data, &task); err != nil {
			log.Printf("crawl protocol: unmarshal error: %v", err)
			return
		}

		if err := handler(&task); err != nil {
			log.Printf("crawl protocol: handler error: %v", err)
			s.Write([]byte(`{"status":"error"}` + "\n"))
			return
		}

		s.Write([]byte(`{"status":"ok"}` + "\n"))
	})
}

// SendCrawlTask forwards a CrawlTask to a peer via /doogle/crawl/1.0.0.
func SendCrawlTask(ctx context.Context, h host.Host, peerID peer.ID, task *models.CrawlTask, timeout time.Duration) error {
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	s, err := h.NewStream(ctx, peerID, CrawlProtocol)
	if err != nil {
		return fmt.Errorf("open crawl stream to %s: %w", peerID.String()[:12], err)
	}
	defer s.Close()

	data, err := json.Marshal(task)
	if err != nil {
		return fmt.Errorf("marshal crawl task: %w", err)
	}
	data = append(data, '\n')
	if _, err := s.Write(data); err != nil {
		return fmt.Errorf("write crawl task: %w", err)
	}
	s.CloseWrite()

	// Read response (fire-and-forget semantics — we don't use the response)
	reader := bufio.NewReader(io.LimitReader(s, 1<<20))
	reader.ReadBytes('\n') // drain response
	return nil
}
