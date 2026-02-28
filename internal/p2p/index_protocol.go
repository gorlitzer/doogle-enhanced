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

// IndexDocHandler processes incoming documents forwarded for indexing.
type IndexDocHandler func(doc *models.Document) error

// RegisterIndexProtocol sets up the /doogle/index/1.0.0 stream handler.
func RegisterIndexProtocol(h host.Host, handler IndexDocHandler) {
	h.SetStreamHandler(IndexProtocol, func(s network.Stream) {
		defer s.Close()

		reader := bufio.NewReader(s)
		data, err := reader.ReadBytes('\n')
		if err != nil && err != io.EOF {
			log.Printf("index protocol: read error: %v", err)
			return
		}

		var doc models.Document
		if err := json.Unmarshal(data, &doc); err != nil {
			log.Printf("index protocol: unmarshal error: %v", err)
			return
		}

		if err := handler(&doc); err != nil {
			log.Printf("index protocol: handler error: %v", err)
			s.Write([]byte(`{"status":"error"}` + "\n"))
			return
		}

		s.Write([]byte(`{"status":"ok"}` + "\n"))
	})
}
