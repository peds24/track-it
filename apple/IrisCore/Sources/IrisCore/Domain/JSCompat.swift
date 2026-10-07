import Foundation

// The few JavaScript built-in behaviours the TS domain relies on, reproduced
// on purpose and in one place (spec §3: same values, same messages). Probed
// on Node 22, 2026-10-06; see docs/superpowers/plans/2026-10-06-iris-i3-domain.md.

/// `String.prototype.trim`: Unicode whitespace and line terminators, plus BOM.
func jsTrim(_ s: String) -> String {
    s.trimmingCharacters(in: CharacterSet.whitespacesAndNewlines.union(CharacterSet(charactersIn: "\u{FEFF}")))
}

/// `Math.round`: half rounds toward +∞ (Math.round(-2.5) == -2).
func jsRound(_ x: Double) -> Double {
    let r = x.rounded(.down)
    return x - r >= 0.5 ? r + 1 : r
}

/// `parseInt(s, 10)`: leading whitespace, an optional sign, then the longest
/// run of ASCII digits; nil where JS would give NaN.
func jsParseInt(_ s: String) -> Int? {
    var scalars = Substring(jsTrimStart(s)).unicodeScalars[...]
    var sign = 1
    if let first = scalars.first, first == "-" || first == "+" {
        sign = first == "-" ? -1 : 1
        scalars = scalars.dropFirst()
    }
    let digits = scalars.prefix { $0.isASCII && ("0"..."9").contains($0) }
    guard !digits.isEmpty, let n = Int(String(String.UnicodeScalarView(digits))) else { return nil }
    return sign * n
}

private func jsTrimStart(_ s: String) -> String {
    let ws = CharacterSet.whitespacesAndNewlines.union(CharacterSet(charactersIn: "\u{FEFF}"))
    return String(String.UnicodeScalarView(s.unicodeScalars.drop { ws.contains($0) }))
}

/// `String(n)` (ECMAScript Number::toString): the shortest round-trip digits,
/// laid out the JS way — plain from 1e-6 up to 1e21 ("100000000000000000000",
/// "0.00001"), exponent form outside it ("1e+21", "1.5e-7"). Swift's own
/// description prints "1e+20" and "1e-05", and Int64 traps past 2^63.
func jsNumberString(_ x: Double) -> String {
    if x.isNaN { return "NaN" }
    if x.isInfinite { return x < 0 ? "-Infinity" : "Infinity" }
    if x == 0 { return "0" }
    let sign = x < 0 ? "-" : ""
    // Swift's description already holds the shortest round-trip digits.
    let parts = "\(abs(x))".lowercased().split(separator: "e")
    let mantissa = parts[0].split(separator: ".", omittingEmptySubsequences: false)
    let intPart = String(mantissa[0])
    let fracPart = mantissa.count > 1 ? String(mantissa[1]) : ""
    var digits = intPart + fracPart
    var point = intPart.count + (parts.count > 1 ? Int(parts[1])! : 0)
    while digits.hasPrefix("0"), digits.count > 1 { digits.removeFirst(); point -= 1 }
    while digits.hasSuffix("0"), digits.count > 1 { digits.removeLast() }
    let k = digits.count, n = point
    if k <= n && n <= 21 { return sign + digits + String(repeating: "0", count: n - k) }
    if 0 < n && n <= 21 { return sign + digits.prefix(n) + "." + digits.dropFirst(n) }
    if -6 < n && n <= 0 { return sign + "0." + String(repeating: "0", count: -n) + digits }
    let exponent = n - 1
    let head = k == 1 ? digits : digits.prefix(1) + "." + digits.dropFirst()
    return sign + head + "e" + (exponent < 0 ? "-" : "+") + String(abs(exponent))
}

/// `Number.prototype.toFixed(1)`: rounds the *exact* binary value, ties up —
/// not printf's ties-to-even (8.25 → "8.3", not "8.2").
func jsToFixed1(_ x: Double) -> String {
    var exact = Decimal(string: String(format: "%.40f", x)) ?? Decimal(x)
    var rounded = Decimal()
    NSDecimalRound(&rounded, &exact, 1, .plain)
    return String(format: "%.1f", NSDecimalNumber(decimal: rounded).doubleValue)
}

/// A regex with JavaScript's flavour: per-scalar matching (so "\r\n" is two
/// characters), ASCII \d and \w, and \b on ASCII word characters.
func jsRegex<Output>(_ regex: Regex<Output>) -> Regex<Output> {
    regex
        .matchingSemantics(.unicodeScalar)
        .asciiOnlyDigits()
        .asciiOnlyWordCharacters()
        .wordBoundaryKind(.simple)
}

/// `Number.isSafeInteger`: whole and within ±(2^53 − 1).
func isSafeInteger(_ x: Double) -> Bool {
    x.isFinite && x.rounded(.towardZero) == x && abs(x) <= 9_007_199_254_740_991
}
