use core_error::CoreError;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use unicode_linebreak::linebreaks;
use unicode_segmentation::UnicodeSegmentation;
use unicode_width::UnicodeWidthStr;

pub const TEXT_LAYOUT_ENGINE_VERSION: u32 = 1;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum TextAlignment {
    #[default]
    Left,
    Center,
    Right,
    Justify,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum TextTransform {
    #[default]
    None,
    Upper,
    Lower,
    Capitalize,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TextMeasurementMode {
    DeterministicFallback,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TextStyleMetrics {
    pub font_family: String,
    pub font_size: f32,
    pub font_weight: u16,
    pub line_height: f32,
    pub letter_spacing: f32,
    #[serde(default)]
    pub italic: bool,
    #[serde(default)]
    pub transform: TextTransform,
}

impl Default for TextStyleMetrics {
    fn default() -> Self {
        Self {
            font_family: "system-ui".to_string(),
            font_size: 16.0,
            font_weight: 400,
            line_height: 24.0,
            letter_spacing: 0.0,
            italic: false,
            transform: TextTransform::None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TextLayoutRun {
    pub start: usize,
    pub end: usize,
    pub style: TextStyleMetrics,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TextLayoutRequest {
    pub content: String,
    pub width: f32,
    pub alignment: TextAlignment,
    pub paragraph_spacing: f32,
    pub base_style: TextStyleMetrics,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub runs: Vec<TextLayoutRun>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TextLine {
    pub index: usize,
    pub paragraph_index: usize,
    pub start: usize,
    pub end: usize,
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
    pub baseline: f32,
    pub hard_break: bool,
    pub soft_wrapped: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TextGraphemeBox {
    pub start: usize,
    pub end: usize,
    pub line_index: usize,
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CaretAffinity {
    Upstream,
    Downstream,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TextCaret {
    pub offset: usize,
    pub line_index: usize,
    pub x: f32,
    pub y: f32,
    pub height: f32,
    pub affinity: CaretAffinity,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TextSelectionRect {
    pub line_index: usize,
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TextLayout {
    pub engine_version: u32,
    pub measurement_mode: TextMeasurementMode,
    pub width: f32,
    pub height: f32,
    pub lines: Vec<TextLine>,
    pub graphemes: Vec<TextGraphemeBox>,
    pub carets: Vec<TextCaret>,
    pub font_fallbacks: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TextHitTest {
    pub offset: usize,
    pub line_index: usize,
    pub affinity: CaretAffinity,
}

#[derive(Debug, Clone, Default)]
pub struct TextLayoutHandle {
    pub revision: u64,
}

impl TextLayoutHandle {
    pub fn layout(&mut self, request: &TextLayoutRequest) -> Result<TextLayout, CoreError> {
        let layout = layout_text(request)?;
        self.revision += 1;
        Ok(layout)
    }
}

#[derive(Debug, Clone)]
struct Cluster {
    start: usize,
    end: usize,
    advance: f32,
    line_height: f32,
    font_size: f32,
    whitespace: bool,
    break_after: bool,
}

#[derive(Debug, Clone, Copy)]
struct LineSlice {
    start: usize,
    end: usize,
    soft_wrapped: bool,
}

pub fn layout_text(request: &TextLayoutRequest) -> Result<TextLayout, CoreError> {
    validate_request(request)?;

    let width = request.width.max(1.0);
    let paragraphs = request.content.split('\n').collect::<Vec<_>>();
    let mut global_utf16_offset = 0usize;
    let mut y = 0.0f32;
    let mut lines = Vec::new();
    let mut graphemes = Vec::new();
    let mut carets = Vec::new();

    for (paragraph_index, paragraph) in paragraphs.iter().enumerate() {
        let paragraph_clusters = build_clusters(request, paragraph, global_utf16_offset);
        let slices = wrap_paragraph(&paragraph_clusters, width);
        let has_newline_after = paragraph_index + 1 < paragraphs.len();

        for (slice_index, slice) in slices.iter().enumerate() {
            let line_index = lines.len();
            let line_clusters = &paragraph_clusters[slice.start..slice.end];
            let line_height = if line_clusters.is_empty() {
                request.base_style.line_height
            } else {
                line_clusters
                    .iter()
                    .map(|cluster| cluster.line_height)
                    .fold(0.0, f32::max)
            }
            .max(1.0);
            let max_font_size = if line_clusters.is_empty() {
                request.base_style.font_size
            } else {
                line_clusters
                    .iter()
                    .map(|cluster| cluster.font_size)
                    .fold(0.0, f32::max)
            }
            .max(1.0);
            let natural_width = line_clusters
                .iter()
                .map(|cluster| cluster.advance)
                .sum::<f32>();
            let is_last_paragraph_line = slice_index + 1 == slices.len();
            let justify = matches!(request.alignment, TextAlignment::Justify)
                && slice.soft_wrapped
                && !is_last_paragraph_line;
            let whitespace_count = line_clusters
                .iter()
                .filter(|cluster| cluster.whitespace)
                .count();
            let justify_extra = if justify && whitespace_count > 0 {
                ((width - natural_width) / whitespace_count as f32).max(0.0)
            } else {
                0.0
            };
            let rendered_width = if justify_extra > 0.0 {
                width
            } else {
                natural_width
            };
            let x = match request.alignment {
                TextAlignment::Center => ((width - rendered_width) / 2.0).max(0.0),
                TextAlignment::Right => (width - rendered_width).max(0.0),
                TextAlignment::Left | TextAlignment::Justify => 0.0,
            };
            let start_offset = line_clusters
                .first()
                .map(|cluster| cluster.start)
                .unwrap_or(global_utf16_offset);
            let end_offset = line_clusters
                .last()
                .map(|cluster| cluster.end)
                .unwrap_or(global_utf16_offset);
            let baseline = y + ((line_height - max_font_size) / 2.0).max(0.0) + max_font_size * 0.8;
            let hard_break = has_newline_after && is_last_paragraph_line;

            carets.push(TextCaret {
                offset: start_offset,
                line_index,
                x,
                y,
                height: line_height,
                affinity: CaretAffinity::Downstream,
            });

            let mut cursor_x = x;
            for cluster in line_clusters {
                let extra = if cluster.whitespace {
                    justify_extra
                } else {
                    0.0
                };
                let cluster_width = cluster.advance + extra;
                graphemes.push(TextGraphemeBox {
                    start: cluster.start,
                    end: cluster.end,
                    line_index,
                    x: cursor_x,
                    y,
                    width: cluster_width,
                    height: line_height,
                });
                cursor_x += cluster_width;
                carets.push(TextCaret {
                    offset: cluster.end,
                    line_index,
                    x: cursor_x,
                    y,
                    height: line_height,
                    affinity: if slice.soft_wrapped && cluster.end == end_offset {
                        CaretAffinity::Upstream
                    } else {
                        CaretAffinity::Downstream
                    },
                });
            }

            lines.push(TextLine {
                index: line_index,
                paragraph_index,
                start: start_offset,
                end: end_offset,
                x,
                y,
                width: rendered_width,
                height: line_height,
                baseline,
                hard_break,
                soft_wrapped: slice.soft_wrapped,
            });
            y += line_height;
        }

        if has_newline_after {
            y += request.paragraph_spacing.max(0.0);
            global_utf16_offset += paragraph.encode_utf16().count() + 1;
        } else {
            global_utf16_offset += paragraph.encode_utf16().count();
        }
    }

    let mut font_fallbacks = Vec::new();
    let mut seen_fonts = HashSet::new();
    for family in std::iter::once(&request.base_style.font_family)
        .chain(request.runs.iter().map(|run| &run.style.font_family))
    {
        if seen_fonts.insert(family.as_str()) {
            font_fallbacks.push(family.clone());
        }
    }

    Ok(TextLayout {
        engine_version: TEXT_LAYOUT_ENGINE_VERSION,
        measurement_mode: TextMeasurementMode::DeterministicFallback,
        width,
        height: y.max(request.base_style.line_height.max(1.0)),
        lines,
        graphemes,
        carets,
        font_fallbacks,
    })
}

pub fn hit_test_text(layout: &TextLayout, x: f32, y: f32) -> Option<TextHitTest> {
    let line = layout.lines.iter().min_by(|left, right| {
        distance_to_range(y, left.y, left.y + left.height).total_cmp(&distance_to_range(
            y,
            right.y,
            right.y + right.height,
        ))
    })?;
    let caret = layout
        .carets
        .iter()
        .filter(|caret| caret.line_index == line.index)
        .min_by(|left, right| (x - left.x).abs().total_cmp(&(x - right.x).abs()))?;

    Some(TextHitTest {
        offset: caret.offset,
        line_index: caret.line_index,
        affinity: caret.affinity,
    })
}

pub fn selection_rects(layout: &TextLayout, start: usize, end: usize) -> Vec<TextSelectionRect> {
    let selection_start = start.min(end);
    let selection_end = start.max(end);
    if selection_start == selection_end {
        return Vec::new();
    }

    layout
        .lines
        .iter()
        .filter_map(|line| {
            let start_offset = selection_start.max(line.start).min(line.end);
            let end_offset = selection_end.max(line.start).min(line.end);
            if start_offset >= end_offset {
                return None;
            }

            let start_x = caret_x(layout, line.index, start_offset, line.x);
            let end_x = caret_x(layout, line.index, end_offset, line.x + line.width);
            Some(TextSelectionRect {
                line_index: line.index,
                x: start_x.min(end_x),
                y: line.y,
                width: (end_x - start_x).abs().max(1.0),
                height: line.height,
            })
        })
        .collect()
}

fn validate_request(request: &TextLayoutRequest) -> Result<(), CoreError> {
    if !request.width.is_finite() || request.width <= 0.0 {
        return Err(CoreError::new(
            "text.layout.width.invalid",
            "Text layout width must be a finite number greater than zero.",
        ));
    }
    if !valid_style(&request.base_style) {
        return Err(CoreError::new(
            "text.layout.style.invalid",
            "Base text style contains invalid metrics.",
        ));
    }
    let content_len = request.content.encode_utf16().count();
    for run in &request.runs {
        if run.start >= run.end || run.end > content_len || !valid_style(&run.style) {
            return Err(CoreError::new(
                "text.layout.run.invalid",
                "Text layout run has an invalid range or style.",
            ));
        }
    }
    Ok(())
}

fn valid_style(style: &TextStyleMetrics) -> bool {
    style.font_size.is_finite()
        && style.font_size > 0.0
        && style.line_height.is_finite()
        && style.line_height > 0.0
        && style.letter_spacing.is_finite()
}

fn build_clusters(
    request: &TextLayoutRequest,
    paragraph: &str,
    global_utf16_offset: usize,
) -> Vec<Cluster> {
    let break_offsets = linebreaks(paragraph)
        .map(|(offset, _)| offset)
        .collect::<HashSet<_>>();
    let mut utf16_offset = global_utf16_offset;
    let mut word_start = true;

    paragraph
        .grapheme_indices(true)
        .map(|(byte_start, grapheme)| {
            let utf16_len = grapheme.encode_utf16().count();
            let start = utf16_offset;
            let end = start + utf16_len;
            utf16_offset = end;
            let style = resolve_style(request, start);
            let measured = transform_for_measurement(grapheme, style.transform, word_start);
            let whitespace = grapheme.chars().all(char::is_whitespace);
            word_start = whitespace
                || grapheme
                    .chars()
                    .all(|character| !character.is_alphanumeric());
            let byte_end = byte_start + grapheme.len();

            Cluster {
                start,
                end,
                advance: measure_grapheme(&measured, style),
                line_height: style.line_height,
                font_size: style.font_size,
                whitespace,
                break_after: break_offsets.contains(&byte_end),
            }
        })
        .collect()
}

fn resolve_style<'a>(request: &'a TextLayoutRequest, offset: usize) -> &'a TextStyleMetrics {
    request
        .runs
        .iter()
        .rev()
        .find(|run| run.start <= offset && offset < run.end)
        .map(|run| &run.style)
        .unwrap_or(&request.base_style)
}

fn transform_for_measurement(grapheme: &str, transform: TextTransform, word_start: bool) -> String {
    match transform {
        TextTransform::Upper => grapheme.to_uppercase(),
        TextTransform::Lower => grapheme.to_lowercase(),
        TextTransform::Capitalize if word_start => grapheme.to_uppercase(),
        TextTransform::None | TextTransform::Capitalize => grapheme.to_string(),
    }
}

fn measure_grapheme(grapheme: &str, style: &TextStyleMetrics) -> f32 {
    let base = if grapheme == "\t" {
        style.font_size * 1.32
    } else if grapheme.chars().all(char::is_whitespace) {
        style.font_size * 0.33
    } else {
        let width_cells = UnicodeWidthStr::width(grapheme);
        if width_cells >= 2 {
            style.font_size
        } else if grapheme
            .chars()
            .all(|character| "ilI.,'`:;!|".contains(character))
        {
            style.font_size * 0.32
        } else if grapheme
            .chars()
            .all(|character| "MW@#%&".contains(character))
        {
            style.font_size * 0.78
        } else if width_cells == 0 {
            0.0
        } else {
            style.font_size * 0.56
        }
    };
    let weight_factor = 1.0 + ((style.font_weight as f32 - 400.0) / 500.0).clamp(-0.6, 1.2) * 0.025;
    let italic_factor = if style.italic { 1.01 } else { 1.0 };
    (base * weight_factor * italic_factor + style.letter_spacing).max(0.0)
}

fn wrap_paragraph(clusters: &[Cluster], width: f32) -> Vec<LineSlice> {
    if clusters.is_empty() {
        return vec![LineSlice {
            start: 0,
            end: 0,
            soft_wrapped: false,
        }];
    }

    let mut slices = Vec::new();
    let mut start = 0usize;
    while start < clusters.len() {
        let mut current_width = 0.0f32;
        let mut last_break = None;
        let mut index = start;
        let mut wrapped = false;

        while index < clusters.len() {
            let next_width = current_width + clusters[index].advance;
            if index > start && next_width > width {
                let end = last_break
                    .filter(|candidate| *candidate > start)
                    .unwrap_or(index);
                slices.push(LineSlice {
                    start,
                    end,
                    soft_wrapped: true,
                });
                start = end;
                wrapped = true;
                break;
            }

            current_width = next_width;
            if clusters[index].break_after {
                last_break = Some(index + 1);
            }
            index += 1;
        }

        if !wrapped {
            slices.push(LineSlice {
                start,
                end: clusters.len(),
                soft_wrapped: false,
            });
            break;
        }
    }

    slices
}

fn caret_x(layout: &TextLayout, line_index: usize, offset: usize, fallback: f32) -> f32 {
    layout
        .carets
        .iter()
        .find(|caret| caret.line_index == line_index && caret.offset == offset)
        .map(|caret| caret.x)
        .unwrap_or(fallback)
}

fn distance_to_range(value: f32, start: f32, end: f32) -> f32 {
    if value < start {
        start - value
    } else if value > end {
        value - end
    } else {
        0.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request(content: &str, width: f32) -> TextLayoutRequest {
        TextLayoutRequest {
            content: content.to_string(),
            width,
            alignment: TextAlignment::Left,
            paragraph_spacing: 0.0,
            base_style: TextStyleMetrics::default(),
            runs: vec![],
        }
    }

    #[test]
    fn wraps_at_unicode_line_breaks_and_builds_carets() {
        let layout = layout_text(&request("alpha beta gamma", 70.0)).expect("layout succeeds");

        assert!(layout.lines.len() >= 2);
        assert_eq!(layout.lines.first().unwrap().start, 0);
        assert_eq!(layout.lines.last().unwrap().end, 16);
        assert!(layout.carets.iter().any(|caret| caret.offset == 16));
    }

    #[test]
    fn keeps_combining_sequences_on_single_grapheme_boundary() {
        let layout = layout_text(&request("a\u{301}🙂", 200.0)).expect("layout succeeds");

        assert_eq!(layout.graphemes.len(), 2);
        assert_eq!(layout.graphemes[0].start, 0);
        assert_eq!(layout.graphemes[0].end, 2);
        assert_eq!(layout.graphemes[1].start, 2);
        assert_eq!(layout.graphemes[1].end, 4);
        assert!(!layout.carets.iter().any(|caret| caret.offset == 1));
        assert!(!layout.carets.iter().any(|caret| caret.offset == 3));
    }

    #[test]
    fn cjk_metrics_wrap_more_conservatively_than_ascii() {
        let ascii = layout_text(&request("abcdef", 55.0)).expect("ascii layout");
        let cjk = layout_text(&request("가나다라마바", 55.0)).expect("cjk layout");

        assert!(cjk.lines.len() > ascii.lines.len());
    }

    #[test]
    fn explicit_newlines_add_paragraph_spacing_and_empty_lines() {
        let mut input = request("first\n\nthird", 300.0);
        input.paragraph_spacing = 8.0;
        let layout = layout_text(&input).expect("layout succeeds");

        assert_eq!(layout.lines.len(), 3);
        assert!(layout.lines[0].hard_break);
        assert_eq!(layout.lines[1].start, 6);
        assert!(layout.height >= 88.0);
    }

    #[test]
    fn style_runs_expand_line_metrics() {
        let mut input = request("small LARGE", 300.0);
        input.runs.push(TextLayoutRun {
            start: 6,
            end: 11,
            style: TextStyleMetrics {
                font_size: 32.0,
                line_height: 40.0,
                ..TextStyleMetrics::default()
            },
        });
        let layout = layout_text(&input).expect("layout succeeds");

        assert_eq!(layout.lines[0].height, 40.0);
        assert!(layout.lines[0].baseline > 24.0);
    }

    #[test]
    fn alignment_hit_test_and_selection_geometry_share_caret_positions() {
        let mut input = request("hello world", 240.0);
        input.alignment = TextAlignment::Center;
        let layout = layout_text(&input).expect("layout succeeds");
        let line = &layout.lines[0];
        let hit = hit_test_text(&layout, line.x, line.y).expect("hit exists");
        let selection = selection_rects(&layout, 0, 5);

        assert!(line.x > 0.0);
        assert_eq!(hit.offset, 0);
        assert_eq!(selection.len(), 1);
        assert_eq!(selection[0].x, line.x);
        assert!(selection[0].width > 0.0);
    }

    #[test]
    fn rejects_invalid_layout_metrics() {
        let error = layout_text(&request("invalid", 0.0)).expect_err("invalid width rejected");
        assert_eq!(error.code, "text.layout.width.invalid");
    }
}
