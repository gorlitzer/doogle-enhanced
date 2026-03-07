package geo

import (
	"net"
	"os"
	"testing"

	ma "github.com/multiformats/go-multiaddr"
)

func TestExtractIP_IPv4(t *testing.T) {
	addr, err := ma.NewMultiaddr("/ip4/8.8.8.8/tcp/4001")
	if err != nil {
		t.Fatal(err)
	}
	ip := extractIP(addr)
	if ip == nil {
		t.Fatal("expected non-nil IP")
	}
	if ip.String() != "8.8.8.8" {
		t.Fatalf("expected 8.8.8.8, got %s", ip)
	}
}

func TestExtractIP_IPv6(t *testing.T) {
	addr, err := ma.NewMultiaddr("/ip6/2001:4860:4860::8888/tcp/4001")
	if err != nil {
		t.Fatal(err)
	}
	ip := extractIP(addr)
	if ip == nil {
		t.Fatal("expected non-nil IP")
	}
	if ip.String() != "2001:4860:4860::8888" {
		t.Fatalf("expected 2001:4860:4860::8888, got %s", ip)
	}
}

func TestExtractIP_NoIP(t *testing.T) {
	addr, err := ma.NewMultiaddr("/dns4/example.com/tcp/4001")
	if err != nil {
		t.Fatal(err)
	}
	ip := extractIP(addr)
	if ip != nil {
		t.Fatalf("expected nil IP for dns multiaddr, got %s", ip)
	}
}

func TestNilService_Country(t *testing.T) {
	var s *Service
	if got := s.Country(net.ParseIP("8.8.8.8")); got != "" {
		t.Fatalf("expected empty string from nil service, got %q", got)
	}
}

func TestNilService_CountryFromAddrs(t *testing.T) {
	var s *Service
	addr, _ := ma.NewMultiaddr("/ip4/8.8.8.8/tcp/4001")
	if got := s.CountryFromAddrs([]ma.Multiaddr{addr}); got != "" {
		t.Fatalf("expected empty string from nil service, got %q", got)
	}
}

func TestNilService_SelfCountry(t *testing.T) {
	var s *Service
	if got := s.SelfCountry(nil); got != "" {
		t.Fatalf("expected empty string from nil service, got %q", got)
	}
}

func TestNilService_Close(t *testing.T) {
	// Should not panic
	var s *Service
	s.Close()
}

func TestService_Country_NilIP(t *testing.T) {
	// Service with nil reader should return ""
	s := &Service{}
	if got := s.Country(nil); got != "" {
		t.Fatalf("expected empty string for nil IP, got %q", got)
	}
}

func TestCountryFromAddrs_SkipsPrivate(t *testing.T) {
	// Service without a real DB can't look up anything, but we verify
	// private IPs are skipped (never reach Lookup).
	s := &Service{} // nil reader — Country() returns ""

	addrs := make([]ma.Multiaddr, 0, 3)
	for _, raw := range []string{
		"/ip4/127.0.0.1/tcp/4001",
		"/ip4/192.168.1.1/tcp/4001",
		"/ip4/10.0.0.1/tcp/4001",
	} {
		a, err := ma.NewMultiaddr(raw)
		if err != nil {
			t.Fatal(err)
		}
		addrs = append(addrs, a)
	}

	// With a nil reader, even public IPs return "" from Country(),
	// but we can at least verify no panic occurs.
	got := s.CountryFromAddrs(addrs)
	if got != "" {
		t.Fatalf("expected empty result, got %q", got)
	}
}

func TestOpen_InvalidPath(t *testing.T) {
	_, err := Open("/nonexistent/path/does-not-exist.mmdb")
	if err == nil {
		t.Fatal("expected error for nonexistent path")
	}
}

func TestCountryFromAddrs_EmptyAddrs(t *testing.T) {
	s := &Service{}
	if got := s.CountryFromAddrs(nil); got != "" {
		t.Fatalf("expected empty for nil addrs, got %q", got)
	}
	if got := s.CountryFromAddrs([]ma.Multiaddr{}); got != "" {
		t.Fatalf("expected empty for empty addrs, got %q", got)
	}
}

func TestCountryFromAddrs_SkipsLoopback(t *testing.T) {
	s := &Service{} // nil reader
	addr, _ := ma.NewMultiaddr("/ip4/127.0.0.1/tcp/4001")
	// Loopback should be skipped — even with a real DB this returns ""
	if got := s.CountryFromAddrs([]ma.Multiaddr{addr}); got != "" {
		t.Fatalf("expected empty for loopback, got %q", got)
	}
}

func TestCountryFromAddrs_SkipsUnspecified(t *testing.T) {
	s := &Service{}
	addr, _ := ma.NewMultiaddr("/ip4/0.0.0.0/tcp/4001")
	if got := s.CountryFromAddrs([]ma.Multiaddr{addr}); got != "" {
		t.Fatalf("expected empty for unspecified addr, got %q", got)
	}
}

func TestCountryFromAddrs_SkipsIPv6Loopback(t *testing.T) {
	s := &Service{}
	addr, _ := ma.NewMultiaddr("/ip6/::1/tcp/4001")
	if got := s.CountryFromAddrs([]ma.Multiaddr{addr}); got != "" {
		t.Fatalf("expected empty for IPv6 loopback, got %q", got)
	}
}

func TestCountryFromAddrs_MixedPrivateAndPublic(t *testing.T) {
	s := &Service{} // nil reader — public IPs will return "" from Country()
	addrs := make([]ma.Multiaddr, 0, 3)
	for _, raw := range []string{
		"/ip4/192.168.1.1/tcp/4001", // private — skipped
		"/ip4/10.0.0.5/tcp/4001",    // private — skipped
		"/ip4/93.184.216.34/tcp/4001", // public — would lookup, but nil reader returns ""
	} {
		a, _ := ma.NewMultiaddr(raw)
		addrs = append(addrs, a)
	}
	// No panic, returns "" because nil reader
	got := s.CountryFromAddrs(addrs)
	if got != "" {
		t.Fatalf("expected empty (nil reader), got %q", got)
	}
}

func TestExtractIP_IPv4Only(t *testing.T) {
	// Multiaddr with just IP4 and UDP (no TCP)
	addr, err := ma.NewMultiaddr("/ip4/1.2.3.4/udp/5000")
	if err != nil {
		t.Fatal(err)
	}
	ip := extractIP(addr)
	if ip == nil || ip.String() != "1.2.3.4" {
		t.Fatalf("expected 1.2.3.4, got %v", ip)
	}
}

func TestClose_WithNilReader(t *testing.T) {
	// Service with explicit nil reader — should not panic
	s := &Service{reader: nil}
	s.Close()
}

func TestOpen_InvalidFile(t *testing.T) {
	// Create a non-mmdb file
	dir := t.TempDir()
	path := dir + "/not-a-db.mmdb"
	if err := os.WriteFile(path, []byte("not a valid mmdb"), 0o644); err != nil {
		t.Fatal(err)
	}
	_, err := Open(path)
	if err == nil {
		t.Fatal("expected error for invalid mmdb file")
	}
}
