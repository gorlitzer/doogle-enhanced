package crawler

import (
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/go-rod/rod"
	"github.com/go-rod/rod/lib/launcher"
	"github.com/go-rod/rod/lib/proto"
)

// BrowserPool manages a shared headless Chromium browser for rendering JS-heavy pages.
type BrowserPool struct {
	browser *rod.Browser
	mu      sync.Mutex
	timeout time.Duration
}

// NewBrowserPool launches a headless Chromium browser.
func NewBrowserPool(timeout time.Duration) (*BrowserPool, error) {
	u, err := launcher.New().
		Headless(true).
		Set("no-sandbox").
		Set("disable-gpu").
		Set("disable-dev-shm-usage").
		Launch()
	if err != nil {
		return nil, fmt.Errorf("launch browser: %w", err)
	}

	browser := rod.New().ControlURL(u)
	if err := browser.Connect(); err != nil {
		return nil, fmt.Errorf("connect browser: %w", err)
	}

	log.Println("crawler: headless browser pool started")
	return &BrowserPool{
		browser: browser,
		timeout: timeout,
	}, nil
}

// RenderPage navigates to a URL and returns the fully rendered HTML after JS execution.
func (bp *BrowserPool) RenderPage(pageURL, userAgent string) (string, error) {
	bp.mu.Lock()
	defer bp.mu.Unlock()

	page, err := bp.browser.Page(proto.TargetCreateTarget{URL: "about:blank"})
	if err != nil {
		return "", fmt.Errorf("create page: %w", err)
	}
	defer page.Close()

	page = page.Timeout(bp.timeout)

	// Set user agent
	if err := page.SetUserAgent(&proto.NetworkSetUserAgentOverride{
		UserAgent: userAgent,
	}); err != nil {
		return "", fmt.Errorf("set user agent: %w", err)
	}

	// Navigate and wait for network idle
	if err := page.Navigate(pageURL); err != nil {
		return "", fmt.Errorf("navigate: %w", err)
	}

	// Wait for the page to finish loading — network idle for 2 seconds
	if err := page.WaitStable(2 * time.Second); err != nil {
		// Not fatal — page may still have useful content
		log.Printf("crawler: headless wait warning for %s: %v", pageURL, err)
	}

	html, err := page.HTML()
	if err != nil {
		return "", fmt.Errorf("get HTML: %w", err)
	}

	return html, nil
}

// Close shuts down the browser.
func (bp *BrowserPool) Close() {
	if bp.browser != nil {
		bp.browser.Close()
		log.Println("crawler: headless browser pool closed")
	}
}
