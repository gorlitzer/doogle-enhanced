package search

import (
	"fmt"
	"math"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode"

	"github.com/doogle/doogle-v2/internal/models"
)

var (
	percentOfRe   = regexp.MustCompile(`(?i)^([\d.]+)\s*%\s*of\s*([\d.]+)$`)
	sqrtRe        = regexp.MustCompile(`(?i)^sqrt\(\s*([\d.]+)\s*\)$`)
	pureMathRe    = regexp.MustCompile(`^[\d\s.\+\-\*/\(\)%\^]+$`)
	conversionRe  = regexp.MustCompile(`(?i)^([\d.]+)\s*([a-zA-Z°]+)\s+(?:to|in)\s+([a-zA-Z°]+)$`)
	timeQueryRe   = regexp.MustCompile(`(?i)^(?:what(?:'s| is) the )?(?:current )?time(?:\?)?$`)
	dateQueryRe   = regexp.MustCompile(`(?i)^(?:what(?:'s| is) (?:the |today(?:'s)? )?)?date(?:\?| today\??)?$`)
	daysUntilRe   = regexp.MustCompile(`(?i)^(?:how many )?days (?:until|till|to) (.+)$`)
)

// DetectInstantAnswer checks if a query matches an instant-answer pattern.
func DetectInstantAnswer(query string) *models.InstantAnswer {
	q := strings.TrimSpace(query)
	if q == "" {
		return nil
	}

	// 1. Percent-of: "15% of 200"
	if m := percentOfRe.FindStringSubmatch(q); m != nil {
		pct, _ := strconv.ParseFloat(m[1], 64)
		base, _ := strconv.ParseFloat(m[2], 64)
		result := pct / 100.0 * base
		return &models.InstantAnswer{
			Type:   "calculator",
			Query:  q,
			Answer: formatNumber(result),
			Detail: fmt.Sprintf("%.4g%% of %.4g", pct, base),
		}
	}

	// 2. sqrt()
	if m := sqrtRe.FindStringSubmatch(q); m != nil {
		val, _ := strconv.ParseFloat(m[1], 64)
		result := math.Sqrt(val)
		return &models.InstantAnswer{
			Type:   "calculator",
			Query:  q,
			Answer: formatNumber(result),
			Detail: fmt.Sprintf("√%.4g", val),
		}
	}

	// 3. Pure math expression
	if pureMathRe.MatchString(q) && containsOperator(q) {
		result, err := evalMath(q)
		if err == nil {
			return &models.InstantAnswer{
				Type:   "calculator",
				Query:  q,
				Answer: formatNumber(result),
				Detail: q,
			}
		}
	}

	// 4. Unit conversion
	if m := conversionRe.FindStringSubmatch(q); m != nil {
		val, _ := strconv.ParseFloat(m[1], 64)
		from := normalizeUnit(m[2])
		to := normalizeUnit(m[3])
		if result, ok := convertUnits(val, from, to); ok {
			return &models.InstantAnswer{
				Type:   "conversion",
				Query:  q,
				Answer: fmt.Sprintf("%s %s", formatNumber(result), m[3]),
				Detail: fmt.Sprintf("%.4g %s = %s %s", val, m[2], formatNumber(result), m[3]),
			}
		}
	}

	// 5. Time query
	if timeQueryRe.MatchString(q) {
		return &models.InstantAnswer{
			Type:   "time",
			Query:  q,
			Answer: time.Now().Format("3:04 PM"),
			Detail: time.Now().Format("Monday, January 2, 2006"),
		}
	}

	// 6. Date query
	if dateQueryRe.MatchString(q) {
		return &models.InstantAnswer{
			Type:   "date",
			Query:  q,
			Answer: time.Now().Format("Monday, January 2, 2006"),
		}
	}

	// 7. Days until
	if m := daysUntilRe.FindStringSubmatch(q); m != nil {
		event := strings.ToLower(strings.TrimSpace(m[1]))
		if target, ok := knownDates(event); ok {
			now := time.Now()
			target = nextOccurrence(target, now)
			days := int(target.Sub(now).Hours() / 24)
			if days < 0 {
				days = 0
			}
			return &models.InstantAnswer{
				Type:   "days_until",
				Query:  q,
				Answer: fmt.Sprintf("%d days", days),
				Detail: target.Format("January 2, 2006"),
			}
		}
	}

	return nil
}

func containsOperator(s string) bool {
	for _, c := range s {
		if c == '+' || c == '-' || c == '*' || c == '/' || c == '^' {
			return true
		}
	}
	return false
}

func formatNumber(f float64) string {
	if f == math.Trunc(f) && math.Abs(f) < 1e15 {
		return strconv.FormatInt(int64(f), 10)
	}
	s := fmt.Sprintf("%.6g", f)
	return s
}

// --- Recursive descent math parser ---

type mathParser struct {
	input string
	pos   int
}

func evalMath(expr string) (float64, error) {
	p := &mathParser{input: strings.TrimSpace(expr)}
	result := p.parseExpr()
	p.skipSpaces()
	if p.pos < len(p.input) {
		return 0, fmt.Errorf("unexpected character at %d", p.pos)
	}
	return result, nil
}

func (p *mathParser) skipSpaces() {
	for p.pos < len(p.input) && p.input[p.pos] == ' ' {
		p.pos++
	}
}

func (p *mathParser) parseExpr() float64 {
	result := p.parseTerm()
	for {
		p.skipSpaces()
		if p.pos >= len(p.input) {
			break
		}
		op := p.input[p.pos]
		if op == '+' {
			p.pos++
			result += p.parseTerm()
		} else if op == '-' {
			p.pos++
			result -= p.parseTerm()
		} else {
			break
		}
	}
	return result
}

func (p *mathParser) parseTerm() float64 {
	result := p.parsePower()
	for {
		p.skipSpaces()
		if p.pos >= len(p.input) {
			break
		}
		op := p.input[p.pos]
		if op == '*' {
			p.pos++
			result *= p.parsePower()
		} else if op == '/' {
			p.pos++
			divisor := p.parsePower()
			if divisor != 0 {
				result /= divisor
			}
		} else if op == '%' {
			p.pos++
			mod := p.parsePower()
			if mod != 0 {
				result = math.Mod(result, mod)
			}
		} else {
			break
		}
	}
	return result
}

func (p *mathParser) parsePower() float64 {
	result := p.parseUnary()
	p.skipSpaces()
	if p.pos < len(p.input) && p.input[p.pos] == '^' {
		p.pos++
		exp := p.parseUnary()
		result = math.Pow(result, exp)
	}
	return result
}

func (p *mathParser) parseUnary() float64 {
	p.skipSpaces()
	if p.pos < len(p.input) && p.input[p.pos] == '-' {
		p.pos++
		return -p.parseAtom()
	}
	if p.pos < len(p.input) && p.input[p.pos] == '+' {
		p.pos++
	}
	return p.parseAtom()
}

func (p *mathParser) parseAtom() float64 {
	p.skipSpaces()
	if p.pos < len(p.input) && p.input[p.pos] == '(' {
		p.pos++
		result := p.parseExpr()
		p.skipSpaces()
		if p.pos < len(p.input) && p.input[p.pos] == ')' {
			p.pos++
		}
		return result
	}
	return p.parseNumber()
}

func (p *mathParser) parseNumber() float64 {
	p.skipSpaces()
	start := p.pos
	for p.pos < len(p.input) && (unicode.IsDigit(rune(p.input[p.pos])) || p.input[p.pos] == '.') {
		p.pos++
	}
	if start == p.pos {
		return 0
	}
	val, _ := strconv.ParseFloat(p.input[start:p.pos], 64)
	return val
}

// --- Unit conversion ---

var unitAliases = map[string]string{
	"kilometers": "km", "kilometer": "km", "kilometres": "km", "kilometre": "km",
	"miles": "mi", "mile": "mi",
	"meters": "m", "meter": "m", "metres": "m", "metre": "m",
	"feet": "ft", "foot": "ft",
	"centimeters": "cm", "centimeter": "cm", "centimetres": "cm", "centimetre": "cm",
	"inches": "in", "inch": "in",
	"kilograms": "kg", "kilogram": "kg",
	"pounds": "lb", "pound": "lb", "lbs": "lb",
	"grams": "g", "gram": "g",
	"ounces": "oz", "ounce": "oz",
	"liters": "l", "liter": "l", "litres": "l", "litre": "l",
	"gallons": "gal", "gallon": "gal",
	"celsius": "c", "fahrenheit": "f",
	"kph": "kph", "kmh": "kph", "km/h": "kph",
	"mph": "mph",
}

func normalizeUnit(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	s = strings.TrimPrefix(s, "°")
	if alias, ok := unitAliases[s]; ok {
		return alias
	}
	return s
}

type conversionEntry struct {
	from, to string
	factor   float64
}

var conversions = []conversionEntry{
	{"km", "mi", 0.621371}, {"mi", "km", 1.60934},
	{"m", "ft", 3.28084}, {"ft", "m", 0.3048},
	{"cm", "in", 0.393701}, {"in", "cm", 2.54},
	{"kg", "lb", 2.20462}, {"lb", "kg", 0.453592},
	{"g", "oz", 0.035274}, {"oz", "g", 28.3495},
	{"l", "gal", 0.264172}, {"gal", "l", 3.78541},
	{"kph", "mph", 0.621371}, {"mph", "kph", 1.60934},
	{"km", "m", 1000}, {"m", "km", 0.001},
	{"m", "cm", 100}, {"cm", "m", 0.01},
	{"kg", "g", 1000}, {"g", "kg", 0.001},
	{"mi", "ft", 5280}, {"ft", "mi", 1.0 / 5280},
	{"lb", "oz", 16}, {"oz", "lb", 1.0 / 16},
}

func convertUnits(val float64, from, to string) (float64, bool) {
	// Special case: temperature
	if (from == "c" && to == "f") || (from == "celsius" && to == "fahrenheit") {
		return val*9.0/5.0 + 32, true
	}
	if (from == "f" && to == "c") || (from == "fahrenheit" && to == "celsius") {
		return (val - 32) * 5.0 / 9.0, true
	}

	for _, c := range conversions {
		if c.from == from && c.to == to {
			return val * c.factor, true
		}
	}
	return 0, false
}

// --- Known dates for "days until" ---

func knownDates(event string) (time.Time, bool) {
	now := time.Now()
	year := now.Year()

	dates := map[string][2]int{ // month, day
		"christmas":          {12, 25},
		"christmas day":      {12, 25},
		"new year":           {1, 1},
		"new years":          {1, 1},
		"new year's":         {1, 1},
		"new year's day":     {1, 1},
		"new years day":      {1, 1},
		"halloween":          {10, 31},
		"valentine's day":    {2, 14},
		"valentines day":     {2, 14},
		"valentine's":        {2, 14},
		"valentines":         {2, 14},
		"independence day":   {7, 4},
		"july 4th":           {7, 4},
		"4th of july":        {7, 4},
		"st patrick's day":   {3, 17},
		"st patricks day":    {3, 17},
		"april fools":        {4, 1},
		"april fools day":    {4, 1},
		"april fool's day":   {4, 1},
	}

	if md, ok := dates[event]; ok {
		return time.Date(year, time.Month(md[0]), md[1], 0, 0, 0, 0, time.Local), true
	}
	return time.Time{}, false
}

func nextOccurrence(target time.Time, now time.Time) time.Time {
	if target.Before(now) {
		return target.AddDate(1, 0, 0)
	}
	return target
}
