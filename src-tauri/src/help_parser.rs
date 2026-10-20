//! Parser for the text printed by `claude --help`.

/// Returns `(--flag, takes_value, description)` for every option in the `Options:` section.
pub fn parse(help: &str) -> Vec<(String, bool, String)> {
    let mut out: Vec<(String, bool, String)> = Vec::new();
    let mut in_options = false;
    let mut current: Option<(String, bool, Vec<String>)> = None;
    let flush = |cur: &mut Option<(String, bool, Vec<String>)>, out: &mut Vec<(String, bool, String)>| {
        if let Some((flag, val, desc)) = cur.take() {
            out.push((flag, val, desc.join(" ")));
        }
    };
    for line in help.lines() {
        let trimmed = line.trim_end();
        if !line.starts_with(' ') && !trimmed.is_empty() {
            flush(&mut current, &mut out);
            in_options = trimmed == "Options:";
            continue;
        }
        if !in_options || trimmed.is_empty() {
            continue;
        }
        let indent = line.len() - line.trim_start().len();
        let body = trimmed.trim_start();
        if indent == 2 && body.starts_with('-') {
            flush(&mut current, &mut out);
            // Spec ends at the first run of 2+ spaces; the rest is the description.
            let (spec, desc) = match body.find("  ") {
                Some(i) => (&body[..i], body[i..].trim()),
                None => (body, ""),
            };
            let Some(flag) = spec
                .split(|c: char| c == ',' || c.is_whitespace())
                .rfind(|p| p.starts_with("--"))
            else {
                continue;
            };
            let takes_value = spec.contains('<') || spec.contains('[');
            let mut d = Vec::new();
            if !desc.is_empty() {
                d.push(desc.to_string());
            }
            current = Some((flag.to_string(), takes_value, d));
        } else if let Some((_, _, d)) = current.as_mut() {
            d.push(body.to_string());
        }
    }
    flush(&mut current, &mut out);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    const HELP: &str = include_str!("../../docs/reference/claude-help.txt");

    fn find<'a>(v: &'a [(String, bool, String)], f: &str) -> &'a (String, bool, String) {
        v.iter().find(|x| x.0 == f).unwrap_or_else(|| panic!("missing {f}"))
    }

    #[test]
    fn parser_reads_flags() {
        let v = parse(HELP);
        assert!(find(&v, "--model").1, "--model takes a value");
        assert!(!find(&v, "--continue").1, "--continue has no value");
        assert!(find(&v, "--add-dir").1, "--add-dir takes a value");
        // alias form: the kebab-case long name is used
        assert!(find(&v, "--allowed-tools").1);
        // optional value
        assert!(find(&v, "--worktree").1);
        // wrapped description is joined
        assert!(find(&v, "--model").2.contains("full name"));
        // commands section is not parsed as options
        assert!(!v.iter().any(|x| x.0 == "agents"));
    }
}
