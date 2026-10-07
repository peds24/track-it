/// JS `JSON.stringify` text for the JSON the TS app stores in columns
/// (`genres_json`, `seasons_json`). Swift's JSONEncoder escapes "/" and
/// doesn't promise key order; the stored text is compared across platforms.
func jsonText(_ strings: [String]) -> String {
    "[" + strings.map(jsonString).joined(separator: ",") + "]"
}

func jsonText(_ seasons: [SeasonBoundary]) -> String {
    "[" + seasons.map { "{\"number\":\($0.number),\"episodeCount\":\($0.episodeCount)}" }.joined(separator: ",") + "]"
}

/// JSON.stringify of one string: escapes `"`, `\` and control characters
/// (named where JSON has a name, else \u00XX), nothing else.
func jsonString(_ s: String) -> String {
    var out = "\""
    for scalar in s.unicodeScalars {
        switch scalar {
        case "\"": out += "\\\""
        case "\\": out += "\\\\"
        case "\u{08}": out += "\\b"
        case "\u{0C}": out += "\\f"
        case "\n": out += "\\n"
        case "\r": out += "\\r"
        case "\t": out += "\\t"
        case _ where scalar.value < 0x20:
            out += "\\u" + String(repeating: "0", count: 4 - String(scalar.value, radix: 16).count) + String(scalar.value, radix: 16)
        default: out.unicodeScalars.append(scalar)
        }
    }
    return out + "\""
}
