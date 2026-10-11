package urlutil

import (
	"net"
	"testing"
)

func TestIsSafeResolvedIP(t *testing.T) {
	cases := []struct {
		ip   string
		safe bool
	}{
		{"93.184.216.34", true},  // public (example.com)
		{"8.8.8.8", true},        // public
		{"127.0.0.1", false},     // loopback
		{"10.0.0.5", false},      // private
		{"192.168.1.1", false},   // private
		{"172.16.0.1", false},    // private
		{"169.254.169.254", false}, // cloud metadata
		{"169.254.1.1", false},   // link-local
		{"0.0.0.0", false},       // unspecified
		{"::1", false},           // IPv6 loopback
		{"fe80::1", false},       // IPv6 link-local
		{"fc00::1", false},       // IPv6 unique-local (private)
		{"fd00:ec2::254", false}, // IPv6 metadata alias
		{"2606:2800:220:1:248:1893:25c8:1946", true}, // public IPv6
	}
	for _, c := range cases {
		ip := net.ParseIP(c.ip)
		if got := IsSafeResolvedIP(ip); got != c.safe {
			t.Errorf("IsSafeResolvedIP(%s) = %v, want %v", c.ip, got, c.safe)
		}
	}
	if IsSafeResolvedIP(nil) {
		t.Error("IsSafeResolvedIP(nil) should be false")
	}
}

// TestSafeDialControl is the SSRF regression test: the dial-time guard must
// refuse internal targets (this is what defeats DNS rebinding, since it runs on
// the resolved address).
func TestSafeDialControl(t *testing.T) {
	reject := []string{
		"127.0.0.1:80",
		"169.254.169.254:80",
		"10.0.0.5:443",
		"192.168.0.1:8080",
		"[::1]:80",
		"[fd00:ec2::254]:80",
		"example.com:80", // unresolved hostname must not slip through
	}
	for _, addr := range reject {
		if err := SafeDialControl("tcp", addr, nil); err == nil {
			t.Errorf("SafeDialControl(%q) = nil, want rejection", addr)
		}
	}

	allow := []string{"93.184.216.34:80", "8.8.8.8:443"}
	for _, addr := range allow {
		if err := SafeDialControl("tcp", addr, nil); err != nil {
			t.Errorf("SafeDialControl(%q) = %v, want allow", addr, err)
		}
	}
}
