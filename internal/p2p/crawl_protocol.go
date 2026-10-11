package p2p

import (
	"bufio"
	"encoding/json"
	"io"
	"log"

	"github.com/libp2p/go-libp2p/core/host"
	"github.com/libp2p/go-libp2p/core/network"

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
