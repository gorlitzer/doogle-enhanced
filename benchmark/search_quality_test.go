package benchmark

import (
	"fmt"
	"math"
	"strings"
	"testing"
	"time"

	"github.com/doogle/doogle-v2/internal/index"
	"github.com/doogle/doogle-v2/internal/models"
	"github.com/doogle/doogle-v2/internal/search"
)

// --- Corpus ---

func doc(id, domain, title, desc, content string, quality, eeat, spam float64) *index.IndexDocument {
	return &index.IndexDocument{
		ID:            id,
		URL:           "https://" + domain + "/" + strings.ReplaceAll(strings.ToLower(title), " ", "-"),
		Domain:        domain,
		Title:         title,
		Description:   desc,
		Content:       content,
		ContentHash:   "h_" + id,
		ContentSize:   len(content),
		WordCount:     len(strings.Fields(content)),
		CrawledAt:     time.Now(),
		Language:      "en",
		IsHTTPS:       true,
		QualityScore:  quality,
		EEATScore:     eeat,
		SpamScore:     spam,
		StaticScore:   (quality*0.3 + eeat*0.3 + 0.2) * (1 - spam*0.5),
		URLQualityScore: 0.7,
		ReadabilityScore: 0.6,
		IsEvergreen:   true,
	}
}

func buildCorpus() []*index.IndexDocument {
	return []*index.IndexDocument{
		// --- Golang ---
		doc("go_tutorial", "gobyexample.com", "Go Programming Tutorial",
			"Learn Go from scratch with hands-on examples covering all fundamentals",
			"Go is an open source programming language designed at Google. It is statically typed and compiled. Go provides excellent concurrency support through goroutines and channels. The standard library is comprehensive with packages for HTTP servers, JSON encoding, file handling, and testing. Go modules manage dependencies. Error handling uses explicit return values rather than exceptions. Interfaces are satisfied implicitly. The go toolchain includes formatting, vetting, and testing built in.",
			0.85, 0.80, 0.05),
		doc("go_concurrency", "golang.org", "Concurrency in Go",
			"Goroutines and channels for concurrent programming in Go",
			"Concurrency is a core feature of Go. Goroutines are lightweight threads managed by the Go runtime. Channels provide typed communication between goroutines. Select statements multiplex channel operations. The sync package provides mutexes and wait groups for synchronization. Context carries deadlines and cancellation signals across API boundaries.",
			0.80, 0.85, 0.03),
		doc("go_web", "gowebdev.com", "Building Web Applications with Go",
			"HTTP servers routers middleware and templates in Go",
			"Go's net/http package provides a production-ready HTTP server. Popular routers include chi and gorilla mux. Middleware chains handle logging authentication and rate limiting. The html/template package provides safe server-side rendering. Go is widely used for REST APIs and microservices due to its performance and simple deployment as a single binary.",
			0.75, 0.70, 0.08),

		// --- Python ---
		doc("py_intro", "python.org", "Python Programming Language",
			"Python is a versatile high-level programming language used worldwide",
			"Python is an interpreted high-level general-purpose programming language. Its design philosophy emphasizes code readability with significant indentation. Python supports multiple programming paradigms including structured object-oriented and functional programming. It has a comprehensive standard library and a vast ecosystem of third-party packages available through pip. Python is widely used in data science machine learning web development scripting and automation.",
			0.90, 0.90, 0.02),
		doc("py_django", "djangoproject.com", "Django Web Framework",
			"The web framework for perfectionists with deadlines",
			"Django is a high-level Python web framework that encourages rapid development and clean pragmatic design. It follows the model-template-view architectural pattern. Django includes an ORM, URL routing, template engine, form handling, authentication system, and admin interface out of the box. It emphasizes reusability, less code, and the dont-repeat-yourself principle. Django powers Instagram Pinterest and Mozilla.",
			0.85, 0.82, 0.04),
		doc("py_flask", "flask.palletsprojects.com", "Flask Microframework",
			"A lightweight WSGI web application framework for Python",
			"Flask is a micro web framework written in Python. It is classified as a microframework because it does not require particular tools or libraries. It has no database abstraction layer form validation or other components where pre-existing third-party libraries provide common functions. Flask supports extensions that can add application features as if they were implemented in Flask itself.",
			0.78, 0.75, 0.05),

		// --- Machine Learning ---
		doc("ml_intro", "deeplearning.ai", "Introduction to Machine Learning",
			"Fundamentals of machine learning algorithms and applications",
			"Machine learning is a subset of artificial intelligence that provides systems the ability to automatically learn and improve from experience without being explicitly programmed. Supervised learning uses labeled training data to learn a mapping function. Unsupervised learning discovers hidden patterns in unlabeled data. Reinforcement learning trains agents through reward signals. Common algorithms include linear regression decision trees random forests support vector machines and neural networks. Deep learning uses multi-layer neural networks for complex pattern recognition.",
			0.88, 0.85, 0.03),
		doc("ml_neural", "neuralnets.org", "Neural Networks Explained",
			"Understanding deep learning architectures and training",
			"Neural networks are computing systems inspired by biological neural networks. A neural network consists of layers of interconnected nodes. Each connection has a weight that adjusts during training. Backpropagation computes gradients for weight updates. Convolutional neural networks excel at image recognition. Recurrent neural networks handle sequential data. Transformers revolutionized natural language processing. Training requires large datasets and significant compute resources.",
			0.82, 0.80, 0.04),
		doc("ml_sklearn", "scikit-learn.org", "Scikit-learn Machine Learning in Python",
			"Simple and efficient tools for predictive data analysis",
			"Scikit-learn is a free software machine learning library for the Python programming language. It features classification regression and clustering algorithms including support vector machines random forests gradient boosting and k-means. It is designed to interoperate with NumPy and SciPy. The library provides tools for model selection cross-validation and preprocessing.",
			0.80, 0.78, 0.05),

		// --- Databases ---
		doc("db_postgres", "postgresql.org", "PostgreSQL Relational Database",
			"The world's most advanced open source relational database",
			"PostgreSQL is a powerful open source object-relational database system with over 35 years of active development. It supports SQL compliance, ACID transactions, foreign keys, joins, views, triggers, and stored procedures. PostgreSQL has native support for JSON, full text search, and geospatial data via PostGIS. It handles concurrent access through MVCC. Extensions like TimescaleDB add time-series capabilities. PostgreSQL is trusted by companies including Apple, Spotify, and Instagram.",
			0.90, 0.88, 0.02),
		doc("db_redis", "redis.io", "Redis In-Memory Data Store",
			"Open source in-memory data structure store used as database cache and broker",
			"Redis is an open source in-memory data structure store. It supports strings hashes lists sets sorted sets bitmaps and streams. Redis provides high availability via Redis Sentinel and automatic partitioning with Redis Cluster. It supports transactions, pub/sub messaging, Lua scripting, and key expiration. Redis achieves sub-millisecond response times by keeping the entire dataset in memory.",
			0.82, 0.80, 0.04),
		doc("db_mongo", "mongodb.com", "MongoDB Document Database",
			"A general purpose distributed document database",
			"MongoDB is a source-available cross-platform document-oriented database. Instead of using tables and rows MongoDB stores data in flexible JSON-like documents. The document model maps to objects in application code. MongoDB provides ad hoc queries, indexing, real-time aggregation, and replication. It scales horizontally through sharding. MongoDB Atlas provides a fully managed cloud database service.",
			0.78, 0.75, 0.06),

		// --- Security ---
		doc("sec_owasp", "owasp.org", "OWASP Top 10 Web Application Security Risks",
			"The most critical security risks to web applications",
			"The OWASP Top 10 is a standard awareness document for developers and web application security. It represents a broad consensus about the most critical security risks. The current list includes broken access control, cryptographic failures, injection, insecure design, security misconfiguration, vulnerable components, authentication failures, software integrity failures, logging and monitoring failures, and server-side request forgery. Each risk includes description, examples, and prevention guidance.",
			0.92, 0.90, 0.01),
		doc("sec_crypto", "cryptography.io", "Applied Cryptography",
			"Encryption hashing and digital signatures for developers",
			"Applied cryptography covers symmetric encryption with AES, asymmetric encryption with RSA and elliptic curves, hash functions like SHA-256, digital signatures, key exchange protocols like Diffie-Hellman, and TLS for transport security. Modern applications use authenticated encryption with AES-GCM. Password storage requires bcrypt or Argon2. Random number generation must use cryptographically secure sources.",
			0.85, 0.82, 0.03),

		// --- Climate ---
		doc("climate_change", "climate.nasa.gov", "Climate Change Evidence and Causes",
			"Scientific evidence for global climate change from NASA",
			"Earth's climate is changing. Global surface temperature has risen about 1.1 degrees Celsius since the pre-industrial era. The evidence includes rising sea levels, shrinking ice sheets, declining Arctic sea ice, glacial retreat, ocean acidification, and increased extreme weather events. The primary cause is greenhouse gas emissions from burning fossil fuels. Carbon dioxide levels are at their highest in 800,000 years. Mitigation requires reducing emissions through renewable energy, efficiency improvements, and carbon capture.",
			0.95, 0.95, 0.01),

		// --- Cooking ---
		doc("cook_sourdough", "kingarthurflour.com", "Sourdough Bread Recipe",
			"How to make artisan sourdough bread at home from scratch",
			"Sourdough bread requires only flour water and salt plus a mature sourdough starter. Feed the starter 12 hours before mixing. Combine 500g bread flour, 375g water, 100g starter, and 10g salt. Autolyse for 30 minutes then perform stretch and folds every 30 minutes for 2 hours. Bulk ferment 4-6 hours at room temperature. Shape and cold proof in the refrigerator overnight. Bake in a preheated Dutch oven at 500F for 20 minutes covered, then 25 minutes uncovered at 450F.",
			0.80, 0.75, 0.05),
		doc("cook_pasta", "seriouseats.com", "Perfect Pasta Guide",
			"How to cook pasta al dente every time",
			"Cooking perfect pasta requires salting the water generously, using a large pot, and timing carefully. Bring water to a rolling boil, add salt, then pasta. Stir immediately to prevent sticking. Start testing 2 minutes before the package time. Al dente means firm to the bite with a thin white line in the center. Reserve pasta water before draining. Finish cooking in the sauce for one minute to marry the flavors. Fresh pasta cooks in 2-3 minutes.",
			0.75, 0.70, 0.06),

		// --- Distributed Systems ---
		doc("dist_consensus", "raft.github.io", "Raft Consensus Algorithm",
			"Understandable distributed consensus for replicated state machines",
			"Raft is a consensus algorithm designed to be easy to understand. It separates the key elements of consensus: leader election, log replication, and safety. Raft elects a leader which manages the replicated log. The leader accepts client requests, replicates them to followers, and tells them when it is safe to apply entries. If the leader fails, a new election occurs. Raft guarantees that committed entries are durable and eventually applied to all state machines. It is used by etcd, CockroachDB, and TiKV.",
			0.88, 0.85, 0.02),
		doc("dist_cap", "cs.cornell.edu", "CAP Theorem in Distributed Systems",
			"Understanding consistency availability and partition tolerance trade-offs",
			"The CAP theorem states that a distributed data store cannot simultaneously provide more than two of consistency, availability, and partition tolerance. In practice, since network partitions are unavoidable, systems must choose between consistency and availability during a partition. CP systems like ZooKeeper choose consistency. AP systems like Cassandra choose availability. The PACELC theorem extends CAP to include latency trade-offs when there is no partition.",
			0.82, 0.85, 0.03),

		// --- Noise documents ---
		doc("noise_sport", "espn.com", "Latest Sports Scores and News",
			"Live scores, highlights, and standings from around the world",
			"Check the latest scores from the NFL NBA MLB NHL and more. Today's highlights include a dramatic overtime victory and a record-breaking performance. Standings updated after each game. Fantasy sports picks and analysis available. Watch replays and highlights on demand.",
			0.60, 0.50, 0.15),
		doc("noise_shop", "cheapdeals.biz", "Amazing Deals Buy Now Save Big",
			"Limited time offers on electronics clothing and more act fast",
			"Buy now and save up to 90% off retail prices. Limited time offer. Click here for exclusive deals. Free shipping on all orders. Best prices guaranteed. Act now before its too late. Subscribe for daily deals. Discount codes available.",
			0.20, 0.10, 0.85),
		doc("noise_filler", "randomsite.net", "Welcome to Our Website",
			"Home page of our general purpose website",
			"Welcome to our website. We provide various services and information. Please browse our pages for more details. Contact us for questions. We are committed to quality and customer satisfaction.",
			0.30, 0.20, 0.25),
	}
}

// --- Query Suite ---

type relevanceJudgment struct {
	docID string
	grade int // 3=perfect, 2=good, 1=partial, 0=irrelevant
}

type queryCase struct {
	query     string
	judgments []relevanceJudgment
}

func queryTestSuite() []queryCase {
	return []queryCase{
		{
			query: "go programming tutorial",
			judgments: []relevanceJudgment{
				{"go_tutorial", 3}, {"go_concurrency", 2}, {"go_web", 2},
			},
		},
		{
			query: "python programming language",
			judgments: []relevanceJudgment{
				{"py_intro", 3}, {"py_django", 1}, {"py_flask", 1}, {"ml_sklearn", 1},
			},
		},
		{
			query: "python web framework",
			judgments: []relevanceJudgment{
				{"py_django", 3}, {"py_flask", 3}, {"go_web", 1},
			},
		},
		{
			query: "machine learning algorithms",
			judgments: []relevanceJudgment{
				{"ml_intro", 3}, {"ml_neural", 2}, {"ml_sklearn", 2},
			},
		},
		{
			query: "neural networks deep learning",
			judgments: []relevanceJudgment{
				{"ml_neural", 3}, {"ml_intro", 2},
			},
		},
		{
			query: "postgresql database",
			judgments: []relevanceJudgment{
				{"db_postgres", 3}, {"db_redis", 1}, {"db_mongo", 1},
			},
		},
		{
			query: "redis cache",
			judgments: []relevanceJudgment{
				{"db_redis", 3},
			},
		},
		{
			query: "web application security",
			judgments: []relevanceJudgment{
				{"sec_owasp", 3}, {"sec_crypto", 2},
			},
		},
		{
			query: "encryption cryptography",
			judgments: []relevanceJudgment{
				{"sec_crypto", 3},
			},
		},
		{
			query: "climate change global warming",
			judgments: []relevanceJudgment{
				{"climate_change", 3},
			},
		},
		{
			query: "sourdough bread recipe",
			judgments: []relevanceJudgment{
				{"cook_sourdough", 3},
			},
		},
		{
			query: "how to cook pasta",
			judgments: []relevanceJudgment{
				{"cook_pasta", 3}, {"cook_sourdough", 1},
			},
		},
		{
			query: "distributed consensus algorithm",
			judgments: []relevanceJudgment{
				{"dist_consensus", 3}, {"dist_cap", 2},
			},
		},
		{
			query: "CAP theorem",
			judgments: []relevanceJudgment{
				{"dist_cap", 3}, {"dist_consensus", 1},
			},
		},
		{
			query: "goroutines channels concurrency",
			judgments: []relevanceJudgment{
				{"go_concurrency", 3}, {"go_tutorial", 2},
			},
		},
		{
			query: "scikit-learn python machine learning",
			judgments: []relevanceJudgment{
				{"ml_sklearn", 3}, {"ml_intro", 2}, {"py_intro", 1},
			},
		},
		{
			query: "mongodb document database",
			judgments: []relevanceJudgment{
				{"db_mongo", 3}, {"db_postgres", 1},
			},
		},
		{
			query: "OWASP top 10",
			judgments: []relevanceJudgment{
				{"sec_owasp", 3},
			},
		},
		{
			query: "raft leader election",
			judgments: []relevanceJudgment{
				{"dist_consensus", 3},
			},
		},
		{
			query: "django web development",
			judgments: []relevanceJudgment{
				{"py_django", 3}, {"py_flask", 2}, {"go_web", 1},
			},
		},
	}
}

// --- Metrics ---

// ndcg computes NDCG@k for a ranked list of document IDs against judgments.
func ndcg(ranked []string, judgments map[string]int, k int) float64 {
	if k > len(ranked) {
		k = len(ranked)
	}

	// DCG
	dcg := 0.0
	for i := 0; i < k; i++ {
		rel := float64(judgments[ranked[i]])
		dcg += (math.Pow(2, rel) - 1) / math.Log2(float64(i+2))
	}

	// Ideal DCG: sort judgments descending, compute DCG
	grades := make([]int, 0, len(judgments))
	for _, g := range judgments {
		grades = append(grades, g)
	}
	sortDescInt(grades)

	idcg := 0.0
	for i := 0; i < k && i < len(grades); i++ {
		rel := float64(grades[i])
		idcg += (math.Pow(2, rel) - 1) / math.Log2(float64(i+2))
	}

	if idcg == 0 {
		return 0
	}
	return dcg / idcg
}

func sortDescInt(s []int) {
	for i := range s {
		for j := i + 1; j < len(s); j++ {
			if s[j] > s[i] {
				s[i], s[j] = s[j], s[i]
			}
		}
	}
}

// reciprocalRank returns 1/rank of the first relevant doc (grade > 0).
func reciprocalRank(ranked []string, judgments map[string]int) float64 {
	for i, id := range ranked {
		if judgments[id] > 0 {
			return 1.0 / float64(i+1)
		}
	}
	return 0
}

// --- Helper ---

func newTestStore(t *testing.T) index.Store {
	t.Helper()
	dir := t.TempDir()
	bs, err := index.NewBleveStore(dir)
	if err != nil {
		t.Fatalf("NewBleveStore: %v", err)
	}
	t.Cleanup(func() { bs.Close() })
	return bs
}

func indexCorpus(t *testing.T, store index.Store) []*index.IndexDocument {
	t.Helper()
	corpus := buildCorpus()
	for _, d := range corpus {
		if err := store.Index(d); err != nil {
			t.Fatalf("Index %s: %v", d.ID, err)
		}
	}
	return corpus
}

func searchTop(t *testing.T, engine *search.Engine, query string, n int) []models.SearchResult {
	t.Helper()
	resp, err := engine.Search(&models.SearchRequest{Query: query, Page: 1, PageSize: n})
	if err != nil {
		t.Fatalf("Search %q: %v", query, err)
	}
	return resp.Results
}

// --- Tests ---

func TestSearchQuality(t *testing.T) {
	store := newTestStore(t)
	indexCorpus(t, store)
	engine := search.NewEngine(store)
	suite := queryTestSuite()

	totalNDCG := 0.0
	totalMRR := 0.0
	totalP1 := 0.0

	for _, tc := range suite {
		results := searchTop(t, engine, tc.query, 10)

		// Build ranked list and judgment map
		ranked := make([]string, 0, len(results))
		for _, r := range results {
			// Extract doc ID from URL path
			for _, j := range tc.judgments {
				url := "https://" + docIDtoURL(j.docID)
				if r.URL == url {
					ranked = append(ranked, j.docID)
					break
				}
			}
		}

		// Simpler: match by URL contains docID
		ranked = ranked[:0]
		for _, r := range results {
			matched := ""
			for _, j := range tc.judgments {
				if strings.Contains(r.URL, j.docID) || urlMatchesDoc(r.URL, j.docID) {
					matched = j.docID
					break
				}
			}
			if matched != "" {
				ranked = append(ranked, matched)
			} else {
				ranked = append(ranked, r.URL) // not judged
			}
		}

		judgMap := make(map[string]int)
		for _, j := range tc.judgments {
			judgMap[j.docID] = j.grade
		}

		n := ndcg(ranked, judgMap, 10)
		rr := reciprocalRank(ranked, judgMap)
		p1 := 0.0
		if len(ranked) > 0 && judgMap[ranked[0]] >= 2 {
			p1 = 1.0
		}

		topDoc := "(none)"
		topScore := 0.0
		if len(results) > 0 {
			topDoc = results[0].URL
			topScore = results[0].Score
		}

		mark := "✓"
		if n < 0.5 {
			mark = "✗"
		}

		t.Logf("%s query %q: NDCG=%.2f MRR=%.2f top=%s (%.2f)", mark, tc.query, n, rr, topDoc, topScore)

		totalNDCG += n
		totalMRR += rr
		totalP1 += p1
	}

	count := float64(len(suite))
	avgNDCG := totalNDCG / count
	avgMRR := totalMRR / count
	avgP1 := totalP1 / count

	t.Logf("")
	t.Logf("=== AGGREGATE (%d queries) ===", len(suite))
	t.Logf("  NDCG@10: %.3f", avgNDCG)
	t.Logf("  MRR:     %.3f", avgMRR)
	t.Logf("  P@1:     %.3f", avgP1)

	if avgNDCG < 0.4 {
		t.Errorf("NDCG@10 %.3f is below threshold 0.4 — ranking quality needs improvement", avgNDCG)
	}
}

// urlMatchesDoc checks if a result URL corresponds to a doc ID from our corpus.
func urlMatchesDoc(resultURL, docID string) bool {
	corpus := buildCorpus()
	for _, d := range corpus {
		if d.ID == docID && d.URL == resultURL {
			return true
		}
	}
	return false
}

func docIDtoURL(docID string) string {
	corpus := buildCorpus()
	for _, d := range corpus {
		if d.ID == docID {
			return d.Domain + "/" + strings.ReplaceAll(strings.ToLower(d.Title), " ", "-")
		}
	}
	return ""
}

func TestTitleBoost(t *testing.T) {
	store := newTestStore(t)
	// Doc A: query terms in title
	store.Index(&index.IndexDocument{
		ID: "title_match", URL: "https://a.com/guide", Domain: "a.com",
		Title: "Complete Database Performance Tuning Guide", Description: "How to tune database performance",
		Content: "This comprehensive guide explains techniques for improving database query execution plans and indexing strategies for production systems.",
		ContentHash: "h1", ContentSize: 140, WordCount: 20, CrawledAt: time.Now(),
		QualityScore: 0.7, EEATScore: 0.7, StaticScore: 1.0,
	})
	// Doc B: same terms only in body, different title
	store.Index(&index.IndexDocument{
		ID: "body_match", URL: "https://b.com/ops", Domain: "b.com",
		Title: "System Administration Best Practices", Description: "Tips for sysadmins",
		Content: "Among the most important tasks is database performance tuning. A well-tuned database reduces latency and improves throughput for all applications.",
		ContentHash: "h2", ContentSize: 140, WordCount: 22, CrawledAt: time.Now(),
		QualityScore: 0.7, EEATScore: 0.7, StaticScore: 1.0,
	})

	engine := search.NewEngine(store)
	results := searchTop(t, engine, "database performance tuning", 10)

	if len(results) < 2 {
		t.Fatalf("expected at least 2 results, got %d", len(results))
	}
	if !strings.Contains(results[0].URL, "a.com") {
		t.Errorf("expected title-match doc (a.com) to rank #1, got %s (score %.2f)", results[0].URL, results[0].Score)
	}
	t.Logf("title-match score=%.2f, body-match score=%.2f", results[0].Score, results[1].Score)
}

func TestSpamPenalty(t *testing.T) {
	store := newTestStore(t)
	// Clean doc
	store.Index(&index.IndexDocument{
		ID: "clean", URL: "https://legit.com/deals", Domain: "legit.com",
		Title: "Holiday Gift Guide", Description: "Thoughtful gift ideas for the holidays",
		Content: "Finding the perfect gift requires understanding the recipient. Consider their hobbies interests and needs. Handmade gifts show personal effort. Experience gifts create lasting memories.",
		ContentHash: "h1", ContentSize: 150, WordCount: 25, CrawledAt: time.Now(),
		QualityScore: 0.75, EEATScore: 0.70, SpamScore: 0.05, StaticScore: 1.2,
	})
	// Spammy doc
	store.Index(&index.IndexDocument{
		ID: "spam", URL: "https://spam.biz/deals", Domain: "spam.biz",
		Title: "Amazing Holiday Gift Deals Buy Now", Description: "Buy now and save big on gifts",
		Content: "Buy now holiday gifts best deals click here limited time offer free shipping act now save big amazing deals gifts for everyone buy now holiday sale.",
		ContentHash: "h2", ContentSize: 140, WordCount: 25, CrawledAt: time.Now(),
		QualityScore: 0.30, EEATScore: 0.10, SpamScore: 0.90, StaticScore: 0.3,
	})

	engine := search.NewEngine(store)
	results := searchTop(t, engine, "holiday gift", 10)

	if len(results) < 2 {
		t.Fatalf("expected at least 2 results, got %d", len(results))
	}
	if strings.Contains(results[0].URL, "spam.biz") {
		t.Errorf("spam doc should not rank #1: %s (score %.2f)", results[0].URL, results[0].Score)
	}
	t.Logf("clean score=%.2f, spam score=%.2f", results[0].Score, results[1].Score)
}

func TestFreshnessDecay(t *testing.T) {
	store := newTestStore(t)
	// Both docs use the same terms so BM25 is comparable — only freshness differs
	store.Index(&index.IndexDocument{
		ID: "recent", URL: "https://news.com/tech", Domain: "news.com",
		Title: "Artificial Intelligence Breakthroughs", Description: "Recent AI research news",
		Content: "Researchers announced major breakthroughs in artificial intelligence this week. New models achieve state-of-the-art results on benchmark tasks including language understanding and image generation.",
		ContentHash: "h1", ContentSize: 180, WordCount: 28, CrawledAt: time.Now(),
		QualityScore: 0.70, EEATScore: 0.65, StaticScore: 1.0, IsTimeSensitive: true, FreshnessScore: 0.95,
	})
	store.Index(&index.IndexDocument{
		ID: "old", URL: "https://archive.com/tech", Domain: "archive.com",
		Title: "Artificial Intelligence Breakthroughs", Description: "AI research from last year",
		Content: "Researchers announced major breakthroughs in artificial intelligence last year. New models achieved state-of-the-art results on benchmark tasks including language understanding and image generation.",
		ContentHash: "h2", ContentSize: 180, WordCount: 28, CrawledAt: time.Now().Add(-365 * 24 * time.Hour),
		QualityScore: 0.70, EEATScore: 0.65, StaticScore: 1.0, IsTimeSensitive: true, FreshnessScore: 0.20,
	})

	engine := search.NewEngine(store)
	results := searchTop(t, engine, "artificial intelligence breakthroughs", 10)

	if len(results) < 2 {
		t.Fatalf("expected at least 2 results, got %d", len(results))
	}
	if strings.Contains(results[0].URL, "archive.com") {
		t.Errorf("old doc should not rank #1 for time-sensitive query: %s", results[0].URL)
	}
	t.Logf("recent score=%.2f, old score=%.2f", results[0].Score, results[1].Score)
}

func TestPhraseBoost(t *testing.T) {
	store := newTestStore(t)
	// Exact phrase
	store.Index(&index.IndexDocument{
		ID: "exact", URL: "https://a.com/ml", Domain: "a.com",
		Title: "Machine Learning Fundamentals", Description: "Core concepts in machine learning",
		Content: "Machine learning is the study of algorithms that improve through experience. The field of machine learning has grown rapidly in recent years. Supervised machine learning uses labeled data for training predictive models.",
		ContentHash: "h1", ContentSize: 200, WordCount: 35, CrawledAt: time.Now(),
		QualityScore: 0.75, EEATScore: 0.70, StaticScore: 1.0,
	})
	// Scattered terms
	store.Index(&index.IndexDocument{
		ID: "scattered", URL: "https://b.com/ai", Domain: "b.com",
		Title: "Artificial Intelligence Overview", Description: "Introduction to AI concepts",
		Content: "Artificial intelligence encompasses many subfields. Some machines can learn patterns from data. Statistical learning theory provides the mathematical foundation for these methods.",
		ContentHash: "h2", ContentSize: 180, WordCount: 30, CrawledAt: time.Now(),
		QualityScore: 0.75, EEATScore: 0.70, StaticScore: 1.0,
	})

	engine := search.NewEngine(store)
	results := searchTop(t, engine, `"machine learning"`, 10)

	if len(results) == 0 {
		t.Fatal("expected at least 1 result")
	}
	if strings.Contains(results[0].URL, "b.com") {
		t.Errorf("scattered-terms doc should not rank #1 for phrase query: %s", results[0].URL)
	}
	t.Logf("exact score=%.2f, results=%d", results[0].Score, len(results))
}

func TestDomainDiversity(t *testing.T) {
	store := newTestStore(t)
	// 5 docs from same domain
	for i := 0; i < 5; i++ {
		store.Index(&index.IndexDocument{
			ID: fmt.Sprintf("same_%d", i), URL: fmt.Sprintf("https://monopoly.com/page%d", i), Domain: "monopoly.com",
			Title:       fmt.Sprintf("Kubernetes Guide Part %d", i+1),
			Description: "Kubernetes container orchestration",
			Content:     fmt.Sprintf("Kubernetes is a container orchestration platform. This is part %d covering deployment strategies, scaling, and service discovery in production environments.", i+1),
			ContentHash: fmt.Sprintf("h_same_%d", i), ContentSize: 100, WordCount: 20, CrawledAt: time.Now(),
			QualityScore: 0.75, EEATScore: 0.70, StaticScore: 1.0,
		})
	}
	// 2 docs from different domains
	store.Index(&index.IndexDocument{
		ID: "other_1", URL: "https://docs.io/k8s", Domain: "docs.io",
		Title: "Kubernetes Documentation", Description: "Official K8s docs",
		Content: "Kubernetes automates deployment scaling and management of containerized applications. It groups containers into logical units for easy management.",
		ContentHash: "h_o1", ContentSize: 100, WordCount: 20, CrawledAt: time.Now(),
		QualityScore: 0.80, EEATScore: 0.75, StaticScore: 1.1,
	})
	store.Index(&index.IndexDocument{
		ID: "other_2", URL: "https://tutorials.dev/k8s", Domain: "tutorials.dev",
		Title: "Kubernetes Tutorial for Beginners", Description: "Learn K8s from scratch",
		Content: "This tutorial teaches Kubernetes fundamentals including pods services deployments and ingress controllers for beginners starting their container orchestration journey.",
		ContentHash: "h_o2", ContentSize: 100, WordCount: 20, CrawledAt: time.Now(),
		QualityScore: 0.78, EEATScore: 0.72, StaticScore: 1.05,
	})

	engine := search.NewEngine(store)
	results := searchTop(t, engine, "kubernetes", 10)

	// Count docs from monopoly.com in top 5
	monopolyCount := 0
	otherDomains := 0
	for i := 0; i < len(results) && i < 7; i++ {
		if strings.Contains(results[i].URL, "monopoly.com") {
			monopolyCount++
		} else {
			otherDomains++
		}
	}

	t.Logf("monopoly.com docs in results: %d, other domains: %d (total %d)", monopolyCount, otherDomains, len(results))
	// Note: domain diversity (max 2 per domain in top 10) is applied in DistributedSearch,
	// not the local Engine. This test verifies that non-monopoly docs still surface
	// despite having slightly lower quality scores.
	if otherDomains == 0 {
		t.Errorf("other-domain docs should appear in results alongside monopoly.com")
	}
}
