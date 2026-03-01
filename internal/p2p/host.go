package p2p

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/libp2p/go-libp2p"
	"github.com/libp2p/go-libp2p/core/crypto"
	"github.com/libp2p/go-libp2p/core/host"
	connmgr "github.com/libp2p/go-libp2p/p2p/net/connmgr"
	"github.com/libp2p/go-libp2p/p2p/security/noise"
	libp2ptls "github.com/libp2p/go-libp2p/p2p/security/tls"
	"github.com/libp2p/go-libp2p/p2p/transport/tcp"
)

// NewHost creates a libp2p host with TCP transport and Noise encryption.
// QUIC is disabled to avoid a quic-go v0.48.2 panic under IPFS DHT connection bursts.
func NewHost(ctx context.Context, privKey crypto.PrivKey, port int) (host.Host, error) {
	listenTCP := fmt.Sprintf("/ip4/0.0.0.0/tcp/%d", port)

	cm, err := connmgr.NewConnManager(20, 40, connmgr.WithGracePeriod(20*time.Second))
	if err != nil {
		return nil, fmt.Errorf("connection manager: %w", err)
	}

	h, err := libp2p.New(
		libp2p.Identity(privKey),
		libp2p.ListenAddrStrings(listenTCP),
		libp2p.Transport(tcp.NewTCPTransport),
		libp2p.Security(noise.ID, noise.New),
		libp2p.Security(libp2ptls.ID, libp2ptls.New),
		libp2p.NATPortMap(),
		libp2p.ConnectionManager(cm),
	)
	if err != nil {
		return nil, fmt.Errorf("create libp2p host: %w", err)
	}

	log.Printf("libp2p host started: %s", h.ID())
	for _, addr := range h.Addrs() {
		log.Printf("  listening on: %s/p2p/%s", addr, h.ID())
	}

	return h, nil
}
