//! Human-facing sizes and counts, and the inverse for the command line.

/// `1024` → `1.0 KB`. Three significant figures is the most a reader uses.
pub fn format_size(bytes: u64) -> String {
    const UNIT: &[&str] = &["B", "KB", "MB", "GB", "TB"];
    let mut value = bytes as f64;
    let mut unit = 0;
    while value >= 1024.0 && unit < UNIT.len() - 1 {
        value /= 1024.0;
        unit += 1;
    }
    if unit == 0 {
        format!("{bytes} B")
    } else if value < 10.0 {
        format!("{value:.1} {}", UNIT[unit])
    } else {
        format!("{value:.0} {}", UNIT[unit])
    }
}

/// `18240` → `18.2k`. Used for token counts, where the exact digit is noise.
pub fn format_count(n: u64) -> String {
    match n {
        0..=999 => n.to_string(),
        1_000..=999_999 => {
            let k = n as f64 / 1000.0;
            if k < 10.0 {
                format!("{k:.1}k")
            } else {
                format!("{k:.0}k")
            }
        }
        _ => {
            let m = n as f64 / 1_000_000.0;
            if m < 10.0 {
                format!("{m:.1}M")
            } else {
                format!("{m:.0}M")
            }
        }
    }
}

/// `200`, `200k`, `1.5M`, `2 mb` → bytes. Bare numbers are kilobytes, because
/// that is the unit anyone typing a source-file limit is thinking in.
pub fn parse_size(input: &str) -> Result<u64, String> {
    let text = input.trim();
    let digits = text.trim_end_matches(|c: char| c.is_ascii_alphabetic() || c.is_whitespace());
    let suffix = text[digits.len()..].trim().to_ascii_lowercase();

    let value: f64 = digits
        .trim()
        .parse()
        .map_err(|_| format!("`{input}` is not a size"))?;
    if value < 0.0 {
        return Err(format!("`{input}` is not a size"));
    }

    let scale = match suffix.trim_end_matches('b') {
        "" if suffix.is_empty() => 1024.0,
        "" => 1.0,
        "k" => 1024.0,
        "m" => 1024.0 * 1024.0,
        "g" => 1024.0 * 1024.0 * 1024.0,
        _ => return Err(format!("`{suffix}` is not a unit")),
    };

    Ok((value * scale) as u64)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sizes_read_the_way_a_person_would_say_them() {
        assert_eq!(format_size(0), "0 B");
        assert_eq!(format_size(999), "999 B");
        assert_eq!(format_size(1024), "1.0 KB");
        assert_eq!(format_size(1024 * 15), "15 KB");
        assert_eq!(format_size(1024 * 1024 * 3 / 2), "1.5 MB");
    }

    #[test]
    fn counts_collapse_to_a_magnitude() {
        assert_eq!(format_count(999), "999");
        assert_eq!(format_count(1_500), "1.5k");
        assert_eq!(format_count(18_240), "18k");
        assert_eq!(format_count(2_400_000), "2.4M");
    }

    #[test]
    fn bare_numbers_are_kilobytes() {
        assert_eq!(parse_size("200").unwrap(), 200 * 1024);
        assert_eq!(parse_size("200k").unwrap(), 200 * 1024);
        assert_eq!(parse_size("200 KB").unwrap(), 200 * 1024);
        assert_eq!(parse_size("1.5M").unwrap(), 1024 * 1024 * 3 / 2);
        assert_eq!(parse_size("512b").unwrap(), 512);
        assert!(parse_size("nope").is_err());
    }
}
