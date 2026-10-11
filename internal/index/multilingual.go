package index

import (
	"strings"
)

// MultilingualEmbedder wraps TFIDFEmbedder with cross-language projection.
// It maps words across languages to shared canonical forms before embedding,
// enabling cross-language retrieval (e.g., searching "house" finds "maison" documents).
//
// Strategy: For each input word, we also inject its translations into the
// feature hashing vector. This means a German document about "Haus" and an
// English query for "house" will share vector dimensions because both contribute
// to the same canonical hash buckets.
type MultilingualEmbedder struct {
	base *TFIDFEmbedder
}

// NewMultilingualEmbedder wraps an existing TF-IDF embedder with cross-lingual projection.
func NewMultilingualEmbedder(base *TFIDFEmbedder) *MultilingualEmbedder {
	return &MultilingualEmbedder{base: base}
}

// AddDocument delegates to the base embedder.
func (m *MultilingualEmbedder) AddDocument(text string) {
	m.base.AddDocument(text)
}

// Finalize delegates to the base embedder.
func (m *MultilingualEmbedder) Finalize() {
	m.base.Finalize()
}

// Embed produces a cross-lingual embedding by expanding input tokens with translations.
func (m *MultilingualEmbedder) Embed(text string) ([]float32, error) {
	expanded := expandWithTranslations(text)
	return m.base.Embed(expanded)
}

// EmbedBatch computes multilingual embeddings for multiple texts.
func (m *MultilingualEmbedder) EmbedBatch(texts []string) ([][]float32, error) {
	results := make([][]float32, len(texts))
	for i, text := range texts {
		vec, err := m.Embed(text)
		if err != nil {
			return nil, err
		}
		results[i] = vec
	}
	return results, nil
}

// expandWithTranslations adds canonical translations of each word to the text.
// This projects different languages into shared hash buckets.
func expandWithTranslations(text string) string {
	words := tokenize(text)
	var expanded strings.Builder
	expanded.WriteString(text)

	for _, w := range words {
		if translations, ok := crossLingualMap[w]; ok {
			for _, t := range translations {
				expanded.WriteByte(' ')
				expanded.WriteString(t)
			}
		}
	}

	return expanded.String()
}

// crossLingualMap maps words across languages to shared canonical forms.
// Each entry maps a word (in any language) to its equivalents in other languages.
// This enables cross-language vector similarity without neural models.
//
// Coverage: ~500 high-frequency words across EN, DE, FR, ES, IT, PT, NL, RU, SV.
// These are the most common query and document terms — covering them provides
// meaningful cross-language retrieval for the majority of searches.
var crossLingualMap = buildCrossLingualMap()

func buildCrossLingualMap() map[string][]string {
	// Each group contains translations of the same concept.
	// All words in a group get mapped to ALL other words in the group.
	groups := [][]string{
		// Common nouns
		{"search", "suche", "recherche", "búsqueda", "ricerca", "pesquisa", "zoeken", "поиск", "sökning"},
		{"computer", "rechner", "ordinateur", "computadora", "computer", "computador", "компьютер", "dator"},
		{"network", "netzwerk", "réseau", "red", "rete", "rede", "netwerk", "сеть", "nätverk"},
		{"information", "informationen", "information", "información", "informazione", "informação", "informatie", "информация"},
		{"system", "system", "système", "sistema", "sistema", "sistema", "systeem", "система"},
		{"program", "programm", "programme", "programa", "programma", "programa", "programma", "программа"},
		{"data", "daten", "données", "datos", "dati", "dados", "gegevens", "данные"},
		{"world", "welt", "monde", "mundo", "mondo", "mundo", "wereld", "мир", "värld"},
		{"time", "zeit", "temps", "tiempo", "tempo", "tempo", "tijd", "время", "tid"},
		{"year", "jahr", "année", "año", "anno", "ano", "jaar", "год", "år"},
		{"people", "leute", "gens", "gente", "gente", "pessoas", "mensen", "люди", "människor"},
		{"house", "haus", "maison", "casa", "casa", "casa", "huis", "дом", "hus"},
		{"water", "wasser", "eau", "agua", "acqua", "água", "water", "вода", "vatten"},
		{"book", "buch", "livre", "libro", "libro", "livro", "boek", "книга", "bok"},
		{"city", "stadt", "ville", "ciudad", "città", "cidade", "stad", "город", "stad"},
		{"school", "schule", "école", "escuela", "scuola", "escola", "school", "школа", "skola"},
		{"money", "geld", "argent", "dinero", "denaro", "dinheiro", "geld", "деньги", "pengar"},
		{"music", "musik", "musique", "música", "musica", "música", "muziek", "музыка", "musik"},
		{"language", "sprache", "langue", "idioma", "lingua", "idioma", "taal", "язык", "språk"},
		{"country", "land", "pays", "país", "paese", "país", "land", "страна", "land"},
		{"health", "gesundheit", "santé", "salud", "salute", "saúde", "gezondheid", "здоровье", "hälsa"},
		{"food", "essen", "nourriture", "comida", "cibo", "comida", "voedsel", "еда", "mat"},
		{"work", "arbeit", "travail", "trabajo", "lavoro", "trabalho", "werk", "работа", "arbete"},
		{"game", "spiel", "jeu", "juego", "gioco", "jogo", "spel", "игра", "spel"},
		{"science", "wissenschaft", "science", "ciencia", "scienza", "ciência", "wetenschap", "наука", "vetenskap"},
		{"history", "geschichte", "histoire", "historia", "storia", "história", "geschiedenis", "история", "historia"},
		{"technology", "technologie", "technologie", "tecnología", "tecnologia", "tecnologia", "technologie", "технология", "teknik"},
		{"government", "regierung", "gouvernement", "gobierno", "governo", "governo", "regering", "правительство", "regering"},
		{"education", "bildung", "éducation", "educación", "istruzione", "educação", "onderwijs", "образование", "utbildning"},
		{"business", "geschäft", "affaires", "negocio", "affari", "negócio", "bedrijf", "бизнес", "företag"},
		{"news", "nachrichten", "nouvelles", "noticias", "notizie", "notícias", "nieuws", "новости", "nyheter"},
		{"weather", "wetter", "météo", "clima", "meteo", "clima", "weer", "погода", "väder"},
		{"market", "markt", "marché", "mercado", "mercato", "mercado", "markt", "рынок", "marknad"},
		{"energy", "energie", "énergie", "energía", "energia", "energia", "energie", "энергия", "energi"},
		{"security", "sicherheit", "sécurité", "seguridad", "sicurezza", "segurança", "beveiliging", "безопасность", "säkerhet"},
		{"problem", "problem", "problème", "problema", "problema", "problema", "probleem", "проблема"},
		{"question", "frage", "question", "pregunta", "domanda", "pergunta", "vraag", "вопрос", "fråga"},
		{"answer", "antwort", "réponse", "respuesta", "risposta", "resposta", "antwoord", "ответ", "svar"},
		{"price", "preis", "prix", "precio", "prezzo", "preço", "prijs", "цена", "pris"},
		{"image", "bild", "image", "imagen", "immagine", "imagem", "afbeelding", "изображение", "bild"},
		{"video", "video", "vidéo", "vídeo", "video", "vídeo", "video", "видео"},

		// Common verbs
		{"help", "hilfe", "aide", "ayuda", "aiuto", "ajuda", "hulp", "помощь", "hjälp"},
		{"buy", "kaufen", "acheter", "comprar", "comprare", "comprar", "kopen", "купить", "köpa"},
		{"learn", "lernen", "apprendre", "aprender", "imparare", "aprender", "leren", "учить", "lära"},
		{"find", "finden", "trouver", "encontrar", "trovare", "encontrar", "vinden", "найти", "hitta"},
		{"download", "herunterladen", "télécharger", "descargar", "scaricare", "baixar", "downloaden", "скачать", "ladda"},
		{"create", "erstellen", "créer", "crear", "creare", "criar", "maken", "создать", "skapa"},

		// Common adjectives
		{"free", "kostenlos", "gratuit", "gratis", "gratuito", "grátis", "gratis", "бесплатно", "gratis"},
		{"new", "neu", "nouveau", "nuevo", "nuovo", "novo", "nieuw", "новый", "ny"},
		{"best", "beste", "meilleur", "mejor", "migliore", "melhor", "beste", "лучший", "bäst"},
		{"good", "gut", "bon", "bueno", "buono", "bom", "goed", "хороший", "bra"},
		{"open", "offen", "ouvert", "abierto", "aperto", "aberto", "open", "открытый", "öppen"},
		{"small", "klein", "petit", "pequeño", "piccolo", "pequeno", "klein", "маленький", "liten"},
		{"large", "groß", "grand", "grande", "grande", "grande", "groot", "большой", "stor"},

		// Tech terms
		{"software", "software", "logiciel", "software", "software", "software", "software", "программное"},
		{"database", "datenbank", "base de données", "base de datos", "database", "banco de dados", "databank", "база данных", "databas"},
		{"internet", "internet", "internet", "internet", "internet", "internet", "internet", "интернет"},
		{"privacy", "datenschutz", "confidentialité", "privacidad", "privacy", "privacidade", "privacy", "конфиденциальность", "integritet"},
		{"tutorial", "anleitung", "tutoriel", "tutorial", "tutorial", "tutorial", "handleiding", "руководство", "handledning"},
		{"documentation", "dokumentation", "documentation", "documentación", "documentazione", "documentação", "documentatie", "документация", "dokumentation"},
		{"guide", "anleitung", "guide", "guía", "guida", "guia", "gids", "руководство", "guide"},
		{"example", "beispiel", "exemple", "ejemplo", "esempio", "exemplo", "voorbeeld", "пример", "exempel"},
		{"error", "fehler", "erreur", "error", "errore", "erro", "fout", "ошибка", "fel"},
		{"password", "passwort", "mot de passe", "contraseña", "password", "senha", "wachtwoord", "пароль", "lösenord"},
		{"file", "datei", "fichier", "archivo", "file", "arquivo", "bestand", "файл", "fil"},
		{"map", "karte", "carte", "mapa", "mappa", "mapa", "kaart", "карта", "karta"},
		{"recipe", "rezept", "recette", "receta", "ricetta", "receita", "recept", "рецепт", "recept"},
	}

	m := make(map[string][]string, len(groups)*8)
	for _, group := range groups {
		// Deduplicate within group
		unique := make([]string, 0, len(group))
		seen := make(map[string]bool)
		for _, w := range group {
			lower := strings.ToLower(w)
			if !seen[lower] {
				seen[lower] = true
				unique = append(unique, lower)
			}
		}

		// Each word maps to all OTHER words in the group
		for i, w := range unique {
			others := make([]string, 0, len(unique)-1)
			for j, o := range unique {
				if i != j {
					others = append(others, o)
				}
			}
			if existing, ok := m[w]; ok {
				m[w] = append(existing, others...)
			} else {
				m[w] = others
			}
		}
	}

	return m
}
