package urlutil

import (
	"fmt"
	"net"
	"net/http"
	"syscall"
	"time"
)

// SafeDialControl is a net.Dialer Control function that refuses connections to
// non-public addresses. It runs after DNS resolution with the concrete address
// the socket is about to connect to, so it is the authoritative SSRF defense:
// it defeats DNS rebinding (a hostname that resolves to 127.0.0.1 / 169.254.x)
// and redirect-based bypasses (every redirect hop dials through it too).
func SafeDialControl(_, address string, _ syscall.RawConn) error {
	host, _, err := net.SplitHostPort(address)
	if err != nil {
		host = address
	}
	ip := net.ParseIP(host)
	if ip == nil {
		return fmt.Errorf("refusing to dial unresolved address %q", address)
	}
	if !IsSafeResolvedIP(ip) {
		return fmt.Errorf("refusing to dial non-public address %s", ip)
	}
	return nil
}

// SafeTransport returns an *http.Transport whose dialer rejects private,
// loopback, link-local, and cloud-metadata addresses at connect time.
func SafeTransport() *http.Transport {
	dialer := &net.Dialer{
		Timeout:   30 * time.Second,
		KeepAlive: 30 * time.Second,
		Control:   SafeDialControl,
	}
	return &http.Transport{
		DialContext:           dialer.DialContext,
		ForceAttemptHTTP2:     true,
		MaxIdleConns:          100,
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   10 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
	}
}

// SafeHTTPClient returns an *http.Client that will not connect to internal
// addresses. Use this for every server-side fetch of an externally-influenced
// URL (crawler, robots, sitemaps, document fetch, metasearch, embeddings).
// checkRedirect, if non-nil, is used as the client's CheckRedirect policy;
// redirects are still IP-guarded regardless because every hop re-dials.
func SafeHTTPClient(timeout time.Duration, checkRedirect func(*http.Request, []*http.Request) error) *http.Client {
	return &http.Client{
		Timeout:       timeout,
		Transport:     SafeTransport(),
		CheckRedirect: checkRedirect,
	}
}
