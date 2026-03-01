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
	libp2pquic "github.com/libp2p/go-libp2p/p2p/transport/quic"
	"github.com/libp2p/go-libp2p/p2p/transport/tcp"
)

// NewHost creates a libp2p host with TCP+QUIC transports and Noise encryption.
// Listens on TCP only (no QUIC listener) to avoid a quic-go v0.48.2 panic from
// inbound connection floods, while still allowing outbound QUIC dials to IPFS
// bootstrap peers that only expose QUIC addresses.
func NewHost(ctx context.Context, privKey crypto.PrivKey, port int) (host.Host, error) {
	listenTCP := fmt.Sprintf("/ip4/0.0.0.0/tcp/%d", port)

	cm, err := connmgr.NewConnManager(40, 80, connmgr.WithGracePeriod(30*time.Second))
	if err != nil {
		return nil, fmt.Errorf("connection manager: %w", err)
	}

	h, err := libp2p.New(
		libp2p.Identity(privKey),
		libp2p.ListenAddrStrings(listenTCP),
		libp2p.Transport(tcp.NewTCPTransport),
		libp2p.Transport(libp2pquic.NewTransport),
		libp2p.Security(noise.ID, noise.New),
		libp2p.Security(libp2ptls.ID, libp2ptls.New),
		libp2p.NATPortMap(),
		libp2p.EnableHolePunching(),
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
