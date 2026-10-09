use core_error::CoreError;
use rustybuzz::{shape, Face as ShapingFace, UnicodeBuffer, Variation};
use serde::{Deserialize, Serialize};
use std::collections::{HashSet, VecDeque};
use ttf_parser::{Face as ParsedFace, Tag};
use unicode_bidi::{BidiInfo, Level};
use unicode_linebreak::linebreaks;
use unicode_segmentation::UnicodeSegmentation;
use unicode_width::UnicodeWidthStr;

pub const TEXT_LAYOUT_ENGINE_VERSION: u32 = 3;

const INTER_REGULAR_BYTES: &[u8] = include_bytes!("../../../../public/v2/fonts/InterVariable.ttf");
const INTER_ITALIC_BYTES: &[u8] =
    include_bytes!("../../../../public/v2/fonts/InterVariable-Italic.ttf");

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
    Shaped,
    Mixed,
    DeterministicFallback,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum TextDirection {
    #[default]
    Ltr,
    Rtl,
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
    pub base_direction: TextDirection,
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
    pub direction: TextDirection,
    pub bidi_level: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TextGlyph {
    pub glyph_id: u32,
    pub cluster_start: usize,
    pub cluster_end: usize,
    pub line_index: usize,
    pub x: f32,
    pub y: f32,
    pub advance_x: f32,
    pub offset_x: f32,
    pub offset_y: f32,
    pub font_family: String,
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
    pub glyphs: Vec<TextGlyph>,
    pub resolved_fonts: Vec<String>,
    pub font_fallbacks: Vec<String>,
    pub layout_warnings: Vec<String>,
    pub shaped_run_count: usize,
    pub fallback_grapheme_count: usize,
    pub bidi_paragraph_count: usize,
    pub visual_run_count: usize,
    pub cache_hit: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TextHitTest {
    pub offset: usize,
    pub line_index: usize,
    pub affinity: CaretAffinity,
}

const DEFAULT_LAYOUT_CACHE_CAPACITY: usize = 32;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct TextLayoutCacheStats {
    pub hits: u64,
    pub misses: u64,
    pub entries: usize,
    pub capacity: usize,
}

#[derive(Debug, Clone)]
pub struct TextLayoutHandle {
    pub revision: u64,
    cache: VecDeque<(TextLayoutRequest, TextLayout)>,
    capacity: usize,
    hits: u64,
    misses: u64,
}

impl Default for TextLayoutHandle {
    fn default() -> Self {
        Self::with_capacity(DEFAULT_LAYOUT_CACHE_CAPACITY)
    }
}

impl TextLayoutHandle {
    pub fn with_capacity(capacity: usize) -> Self {
        Self {
            revision: 0,
            cache: VecDeque::new(),
            capacity,
            hits: 0,
            misses: 0,
        }
    }

    pub fn layout(&mut self, request: &TextLayoutRequest) -> Result<TextLayout, CoreError> {
        validate_request(request)?;
        if let Some(index) = self
            .cache
            .iter()
            .position(|(cached_request, _)| cached_request == request)
        {
            let (_, mut layout) = self.cache.remove(index).expect("cache index must exist");
            layout.cache_hit = true;
            self.cache.push_back((request.clone(), layout.clone()));
            self.hits += 1;
            return Ok(layout);
        }

        let layout = layout_text(request)?;
        self.revision += 1;
        self.misses += 1;
        if self.capacity > 0 {
            while self.cache.len() >= self.capacity {
                self.cache.pop_front();
            }
            self.cache.push_back((request.clone(), layout.clone()));
        }
        Ok(layout)
    }

    pub fn clear(&mut self) {
        self.cache.clear();
    }

    pub fn stats(&self) -> TextLayoutCacheStats {
        TextLayoutCacheStats {
            hits: self.hits,
            misses: self.misses,
            entries: self.cache.len(),
            capacity: self.capacity,
        }
    }
}

#[derive(Debug, Clone)]
struct Cluster {
    start: usize,
    end: usize,
    shaping_text: String,
    style: TextStyleMetrics,
    advance: f32,
    line_height: f32,
    font_size: f32,
    whitespace: bool,
    break_after: bool,
    bidi_level: u8,
    glyphs: Vec<ClusterGlyph>,
}

#[derive(Debug, Clone)]
struct ClusterGlyph {
    glyph_id: u32,
    cluster_start: usize,
    cluster_end: usize,
    local_x: f32,
    advance_x: f32,
    offset_x: f32,
    offset_y: f32,
    font_family: String,
}

#[derive(Debug, Clone, Copy)]
struct RegisteredFont {
    family: &'static str,
    data: &'static [u8],
}

#[derive(Debug, Clone, Copy, Default)]
pub struct FontRegistry;

impl FontRegistry {
    pub fn bundled() -> Self {
        Self
    }

    fn resolve(&self, style: &TextStyleMetrics) -> Option<RegisteredFont> {
        let requests_inter = style.font_family.split(',').any(|family| {
            let normalized = family.trim().trim_matches(['\'', '"']).to_ascii_lowercase();
            normalized == "inter" || normalized == "inter variable"
        });
        requests_inter.then_some(RegisteredFont {
            family: "Inter",
            data: if style.italic {
                INTER_ITALIC_BYTES
            } else {
                INTER_REGULAR_BYTES
            },
        })
    }
}

#[derive(Debug, Default)]
struct LayoutDiagnostics {
    resolved_fonts: Vec<String>,
    font_fallbacks: Vec<String>,
    layout_warnings: Vec<String>,
    shaped_run_count: usize,
    fallback_grapheme_count: usize,
    bidi_paragraph_count: usize,
    visual_run_count: usize,
}

#[derive(Debug)]
struct ParagraphClusters {
    clusters: Vec<Cluster>,
    base_direction: TextDirection,
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
    let registry = FontRegistry::bundled();
    let mut diagnostics = LayoutDiagnostics::default();
    let paragraphs = request.content.split('\n').collect::<Vec<_>>();
    let mut global_utf16_offset = 0usize;
    let mut y = 0.0f32;
    let mut lines = Vec::new();
    let mut graphemes = Vec::new();
    let mut carets = Vec::new();
    let mut glyphs = Vec::new();

    for (paragraph_index, paragraph) in paragraphs.iter().enumerate() {
        let paragraph_layout = build_clusters(
            request,
            paragraph,
            global_utf16_offset,
            &registry,
            &mut diagnostics,
        );
        let paragraph_clusters = &paragraph_layout.clusters;
        let slices = wrap_paragraph(paragraph_clusters, width);
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
            let visual_order = visual_order(line_clusters, paragraph_layout.base_direction);
            diagnostics.visual_run_count += visual_run_count(
                line_clusters,
                &visual_order,
                paragraph_layout.base_direction,
            );

            let mut cursor_x = x;
            for cluster_index in visual_order {
                let cluster = &line_clusters[cluster_index];
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
                    direction: direction_for_level(cluster.bidi_level),
                    bidi_level: cluster.bidi_level,
                });
                glyphs.extend(cluster.glyphs.iter().map(|glyph| TextGlyph {
                    glyph_id: glyph.glyph_id,
                    cluster_start: glyph.cluster_start,
                    cluster_end: glyph.cluster_end,
                    line_index,
                    x: cursor_x + glyph.local_x + glyph.offset_x,
                    y: baseline - glyph.offset_y,
                    advance_x: glyph.advance_x,
                    offset_x: glyph.offset_x,
                    offset_y: glyph.offset_y,
                    font_family: glyph.font_family.clone(),
                }));
                let direction = direction_for_level(cluster.bidi_level);
                let (start_x, end_x) = match direction {
                    TextDirection::Ltr => (cursor_x, cursor_x + cluster_width),
                    TextDirection::Rtl => (cursor_x + cluster_width, cursor_x),
                };
                carets.push(TextCaret {
                    offset: cluster.start,
                    line_index,
                    x: start_x,
                    y,
                    height: line_height,
                    affinity: CaretAffinity::Downstream,
                });
                carets.push(TextCaret {
                    offset: cluster.end,
                    line_index,
                    x: end_x,
                    y,
                    height: line_height,
                    affinity: CaretAffinity::Upstream,
                });
                cursor_x += cluster_width;
            }

            if line_clusters.is_empty() {
                carets.push(TextCaret {
                    offset: start_offset,
                    line_index,
                    x,
                    y,
                    height: line_height,
                    affinity: CaretAffinity::Downstream,
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
                base_direction: paragraph_layout.base_direction,
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

    let measurement_mode = if diagnostics.shaped_run_count == 0 {
        TextMeasurementMode::DeterministicFallback
    } else if diagnostics.fallback_grapheme_count > 0 {
        TextMeasurementMode::Mixed
    } else {
        TextMeasurementMode::Shaped
    };

    Ok(TextLayout {
        engine_version: TEXT_LAYOUT_ENGINE_VERSION,
        measurement_mode,
        width,
        height: y.max(request.base_style.line_height.max(1.0)),
        lines,
        graphemes,
        carets,
        glyphs,
        resolved_fonts: diagnostics.resolved_fonts,
        font_fallbacks: diagnostics.font_fallbacks,
        layout_warnings: diagnostics.layout_warnings,
        shaped_run_count: diagnostics.shaped_run_count,
        fallback_grapheme_count: diagnostics.fallback_grapheme_count,
        bidi_paragraph_count: diagnostics.bidi_paragraph_count,
        visual_run_count: diagnostics.visual_run_count,
        cache_hit: false,
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

    let mut rectangles = Vec::new();
    for line in &layout.lines {
        let mut selected = layout
            .graphemes
            .iter()
            .filter(|grapheme| {
                grapheme.line_index == line.index
                    && grapheme.start < selection_end
                    && grapheme.end > selection_start
            })
            .collect::<Vec<_>>();
        selected.sort_by(|left, right| left.x.total_cmp(&right.x));

        let mut current: Option<TextSelectionRect> = None;
        for grapheme in selected {
            let next = TextSelectionRect {
                line_index: line.index,
                x: grapheme.x,
                y: grapheme.y,
                width: grapheme.width.max(1.0),
                height: grapheme.height,
            };
            if let Some(rectangle) = current.as_mut() {
                let current_end = rectangle.x + rectangle.width;
                if next.x <= current_end + 0.5 {
                    rectangle.width = (next.x + next.width - rectangle.x).max(rectangle.width);
                    rectangle.height = rectangle.height.max(next.height);
                    continue;
                }
                rectangles.push(rectangle.clone());
            }
            current = Some(next);
        }
        if let Some(rectangle) = current {
            rectangles.push(rectangle);
        }
    }
    rectangles
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
    registry: &FontRegistry,
    diagnostics: &mut LayoutDiagnostics,
) -> ParagraphClusters {
    let bidi = BidiInfo::new(paragraph, None);
    let paragraph_level = bidi
        .paragraphs
        .first()
        .map(|info| info.level)
        .unwrap_or_else(Level::ltr);
    let base_direction = direction_for_level(paragraph_level.number());
    if bidi.has_rtl() {
        diagnostics.bidi_paragraph_count += 1;
    }
    let break_offsets = linebreaks(paragraph)
        .map(|(offset, _)| offset)
        .collect::<HashSet<_>>();
    let mut utf16_offset = global_utf16_offset;
    let mut word_start = true;

    let mut clusters = paragraph
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
                shaping_text: measured.clone(),
                style: style.clone(),
                advance: measure_grapheme(&measured, style),
                line_height: style.line_height,
                font_size: style.font_size,
                whitespace,
                break_after: break_offsets.contains(&byte_end),
                bidi_level: bidi
                    .levels
                    .get(byte_start)
                    .copied()
                    .unwrap_or(paragraph_level)
                    .number(),
                glyphs: Vec::new(),
            }
        })
        .collect::<Vec<_>>();

    shape_clusters(&mut clusters, registry, diagnostics);
    ParagraphClusters {
        clusters,
        base_direction,
    }
}

fn shape_clusters(
    clusters: &mut [Cluster],
    registry: &FontRegistry,
    diagnostics: &mut LayoutDiagnostics,
) {
    let mut start = 0usize;
    while start < clusters.len() {
        if clusters[start].bidi_level % 2 == 1 {
            diagnostics.fallback_grapheme_count += 1;
            push_unique(
                &mut diagnostics.layout_warnings,
                "RTL glyph shaping/render integration pending".to_string(),
            );
            start += 1;
            continue;
        }

        let style = clusters[start].style.clone();
        let bidi_level = clusters[start].bidi_level;
        let Some(font) = registry.resolve(&style) else {
            push_unique(
                &mut diagnostics.font_fallbacks,
                format!("{}: family unavailable", style.font_family),
            );
            diagnostics.fallback_grapheme_count += 1;
            start += 1;
            continue;
        };

        let Ok(parsed) = ParsedFace::parse(font.data, 0) else {
            push_unique(
                &mut diagnostics.font_fallbacks,
                format!("{}: invalid font data", font.family),
            );
            diagnostics.fallback_grapheme_count += 1;
            start += 1;
            continue;
        };

        if !font_covers(&parsed, &clusters[start].shaping_text) {
            push_unique(
                &mut diagnostics.font_fallbacks,
                format!("{}: missing glyphs", font.family),
            );
            diagnostics.fallback_grapheme_count += 1;
            start += 1;
            continue;
        }

        let mut end = start + 1;
        while end < clusters.len() {
            let candidate = &clusters[end];
            let same_style = candidate.style == style;
            let same_font = registry.resolve(&candidate.style).is_some_and(|resolved| {
                resolved.family == font.family && resolved.data.as_ptr() == font.data.as_ptr()
            });
            if !same_style
                || !same_font
                || candidate.bidi_level != bidi_level
                || !font_covers(&parsed, &candidate.shaping_text)
            {
                break;
            }
            end += 1;
        }

        if shape_cluster_run(&mut clusters[start..end], font, &style) {
            diagnostics.shaped_run_count += 1;
            push_unique(&mut diagnostics.resolved_fonts, font.family.to_string());
        } else {
            let run_len = end - start;
            diagnostics.fallback_grapheme_count += run_len;
            push_unique(
                &mut diagnostics.font_fallbacks,
                format!("{}: shaping failed", font.family),
            );
        }
        start = end;
    }
}

fn direction_for_level(level: u8) -> TextDirection {
    if level % 2 == 1 {
        TextDirection::Rtl
    } else {
        TextDirection::Ltr
    }
}

fn visual_order(clusters: &[Cluster], base_direction: TextDirection) -> Vec<usize> {
    if clusters.is_empty() {
        return Vec::new();
    }

    let base_level = match base_direction {
        TextDirection::Ltr => 0,
        TextDirection::Rtl => 1,
    };
    let mut levels = clusters
        .iter()
        .map(|cluster| Level::new(cluster.bidi_level).unwrap_or_else(|_| Level::ltr()))
        .collect::<Vec<_>>();

    // UAX #9 rule L1 resets trailing whitespace to the paragraph embedding level.
    for (cluster, level) in clusters.iter().zip(levels.iter_mut()).rev() {
        if !cluster.whitespace {
            break;
        }
        *level = Level::new(base_level).unwrap_or_else(|_| Level::ltr());
    }

    BidiInfo::reorder_visual(&levels)
}

fn visual_run_count(clusters: &[Cluster], order: &[usize], base_direction: TextDirection) -> usize {
    let mut previous = None;
    let mut count = 0;
    for index in order {
        let direction = clusters
            .get(*index)
            .map(|cluster| direction_for_level(cluster.bidi_level))
            .unwrap_or(base_direction);
        if previous != Some(direction) {
            count += 1;
            previous = Some(direction);
        }
    }
    count
}

fn shape_cluster_run(
    clusters: &mut [Cluster],
    font: RegisteredFont,
    style: &TextStyleMetrics,
) -> bool {
    if clusters.is_empty() {
        return false;
    }

    let Some(mut face) = ShapingFace::from_slice(font.data, 0) else {
        return false;
    };
    face.set_variations(&[
        Variation {
            tag: Tag::from_bytes(b"wght"),
            value: style.font_weight.clamp(100, 900) as f32,
        },
        Variation {
            tag: Tag::from_bytes(b"opsz"),
            value: style.font_size.clamp(14.0, 32.0),
        },
    ]);

    let mut input = String::new();
    let mut spans = Vec::with_capacity(clusters.len());
    for (index, cluster) in clusters.iter().enumerate() {
        let byte_start = input.len();
        input.push_str(&cluster.shaping_text);
        spans.push((byte_start, input.len(), index));
    }
    if input.is_empty() {
        return false;
    }

    let mut buffer = UnicodeBuffer::new();
    buffer.push_str(&input);
    buffer.guess_segment_properties();
    let shaped = shape(&face, &[], buffer);
    if shaped.is_empty() {
        return false;
    }

    let scale = style.font_size / face.units_per_em().max(1) as f32;
    let infos = shaped.glyph_infos();
    let positions = shaped.glyph_positions();
    for cluster in clusters.iter_mut() {
        cluster.advance = 0.0;
    }
    let mut logical_offsets = infos
        .iter()
        .map(|info| info.cluster as usize)
        .collect::<Vec<_>>();
    logical_offsets.push(input.len());
    logical_offsets.sort_unstable();
    logical_offsets.dedup();

    let mut pending = Vec::with_capacity(infos.len());
    for (info, position) in infos.iter().zip(positions.iter()) {
        let glyph_start = (info.cluster as usize).min(input.len());
        let glyph_end = logical_offsets
            .iter()
            .copied()
            .find(|offset| *offset > glyph_start)
            .unwrap_or(input.len());
        let owners = spans
            .iter()
            .filter(|(start, end, _)| *start < glyph_end && *end > glyph_start)
            .map(|(_, _, index)| *index)
            .collect::<Vec<_>>();
        let Some(&owner) = owners.first() else {
            continue;
        };
        let advance = (position.x_advance as f32 * scale).abs();
        let share = advance / owners.len().max(1) as f32;
        for index in &owners {
            clusters[*index].advance = (clusters[*index].advance + share).max(0.0);
        }
        let cluster_start = owners
            .first()
            .map(|index| clusters[*index].start)
            .unwrap_or(clusters[owner].start);
        let cluster_end = owners
            .last()
            .map(|index| clusters[*index].end)
            .unwrap_or(clusters[owner].end);
        pending.push((
            owner,
            info.glyph_id,
            cluster_start,
            cluster_end,
            advance,
            position.x_offset as f32 * scale,
            position.y_offset as f32 * scale,
        ));
    }

    let mut spacing_prefixes = Vec::with_capacity(clusters.len());
    let mut accumulated_spacing = 0.0f32;
    for cluster in clusters.iter_mut() {
        spacing_prefixes.push(accumulated_spacing);
        let shaped_advance = cluster.advance;
        cluster.advance = (shaped_advance + style.letter_spacing).max(0.0);
        accumulated_spacing += cluster.advance - shaped_advance;
    }
    let cluster_starts = clusters
        .iter()
        .scan(0.0f32, |cursor, cluster| {
            let start = *cursor;
            *cursor += cluster.advance;
            Some(start)
        })
        .collect::<Vec<_>>();
    let mut glyph_pen = 0.0f32;
    for (owner, glyph_id, cluster_start, cluster_end, advance, offset_x, offset_y) in pending {
        clusters[owner].glyphs.push(ClusterGlyph {
            glyph_id,
            cluster_start,
            cluster_end,
            local_x: glyph_pen + spacing_prefixes[owner] - cluster_starts[owner],
            advance_x: advance,
            offset_x,
            offset_y,
            font_family: font.family.to_string(),
        });
        glyph_pen += advance;
    }
    true
}

fn font_covers(face: &ParsedFace<'_>, text: &str) -> bool {
    text.chars().all(|character| {
        character != '\t'
            && (character.is_whitespace()
                || is_default_ignorable(character)
                || face.glyph_index(character).is_some())
    })
}

fn is_default_ignorable(character: char) -> bool {
    matches!(character as u32, 0x200B..=0x200F | 0x202A..=0x202E | 0x2060..=0x206F | 0xFE00..=0xFE0F | 0xE0100..=0xE01EF)
}

fn push_unique(values: &mut Vec<String>, value: String) {
    if !values.iter().any(|existing| existing == &value) {
        values.push(value);
    }
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

    #[test]
    fn shapes_bundled_inter_with_open_type_positioning_and_glyph_geometry() {
        let mut input = request("AV a\u{301}", 300.0);
        input.base_style.font_family = "Inter, sans-serif".to_string();
        let layout = layout_text(&input).expect("Inter layout succeeds");

        let mut left = request("A", 300.0);
        left.base_style.font_family = "Inter".to_string();
        let mut right = request("V", 300.0);
        right.base_style.font_family = "Inter".to_string();
        let mut pair = request("AV", 300.0);
        pair.base_style.font_family = "Inter".to_string();
        let separate_width = layout_text(&left).expect("A layout").lines[0].width
            + layout_text(&right).expect("V layout").lines[0].width;
        let pair_width = layout_text(&pair).expect("AV layout").lines[0].width;

        assert_eq!(layout.engine_version, 3);
        assert_eq!(layout.measurement_mode, TextMeasurementMode::Shaped);
        assert_eq!(layout.resolved_fonts, vec!["Inter"]);
        assert!(layout.font_fallbacks.is_empty());
        assert_eq!(layout.shaped_run_count, 1);
        assert_eq!(layout.fallback_grapheme_count, 0);
        assert!(pair_width < separate_width);
        assert!(layout.glyphs.iter().all(|glyph| glyph.glyph_id > 0));
        assert!(layout.glyphs.iter().all(|glyph| glyph.advance_x >= 0.0));
        assert!(layout
            .glyphs
            .iter()
            .any(|glyph| glyph.cluster_end - glyph.cluster_start > 1));
    }

    #[test]
    fn selects_the_bundled_italic_face_and_variable_weight() {
        let mut input = request("Variable italic", 300.0);
        input.base_style.font_family = "Inter".to_string();
        input.base_style.font_weight = 725;
        input.base_style.italic = true;
        let layout = layout_text(&input).expect("italic layout succeeds");

        assert_eq!(layout.measurement_mode, TextMeasurementMode::Shaped);
        assert!(!layout.glyphs.is_empty());
        assert!(layout
            .glyphs
            .iter()
            .all(|glyph| glyph.font_family == "Inter"));
    }

    #[test]
    fn reports_mixed_measurement_when_inter_lacks_hangul_glyphs() {
        let mut input = request("Hello 한글", 300.0);
        input.base_style.font_family = "Inter".to_string();
        let layout = layout_text(&input).expect("mixed layout succeeds");

        assert_eq!(layout.measurement_mode, TextMeasurementMode::Mixed);
        assert_eq!(layout.fallback_grapheme_count, 2);
        assert_eq!(layout.font_fallbacks, vec!["Inter: missing glyphs"]);
        assert!(layout.shaped_run_count >= 1);
    }

    #[test]
    fn reports_unavailable_font_without_claiming_shaping() {
        let mut input = request("No bundled face", 300.0);
        input.base_style.font_family = "Unregistered Sans".to_string();
        let layout = layout_text(&input).expect("fallback layout succeeds");

        assert_eq!(
            layout.measurement_mode,
            TextMeasurementMode::DeterministicFallback
        );
        assert!(layout.glyphs.is_empty());
        assert_eq!(layout.fallback_grapheme_count, layout.graphemes.len());
        assert_eq!(
            layout.font_fallbacks,
            vec!["Unregistered Sans: family unavailable"]
        );
    }

    #[test]
    fn applies_letter_spacing_to_glyph_origins_and_caret_geometry() {
        let mut compact = request("AV", 300.0);
        compact.base_style.font_family = "Inter".to_string();
        let compact_layout = layout_text(&compact).expect("compact layout");

        let mut spaced = compact;
        spaced.base_style.letter_spacing = 5.0;
        let spaced_layout = layout_text(&spaced).expect("spaced layout");
        let compact_v = compact_layout
            .glyphs
            .iter()
            .find(|glyph| glyph.cluster_start == 1)
            .expect("compact V glyph");
        let spaced_v = spaced_layout
            .glyphs
            .iter()
            .find(|glyph| glyph.cluster_start == 1)
            .expect("spaced V glyph");

        assert!((spaced_v.x - compact_v.x - 5.0).abs() < 0.01);
        assert!((spaced_layout.lines[0].width - compact_layout.lines[0].width - 10.0).abs() < 0.01);
    }

    #[test]
    fn resolves_rtl_visual_order_carets_and_hit_testing() {
        let mut input = request("אבג", 300.0);
        input.base_style.font_family = "Inter".to_string();
        let layout = layout_text(&input).expect("RTL layout");
        let line = &layout.lines[0];

        assert_eq!(
            layout.measurement_mode,
            TextMeasurementMode::DeterministicFallback
        );
        assert!(layout.glyphs.is_empty());
        assert_eq!(layout.fallback_grapheme_count, layout.graphemes.len());
        assert!(layout.font_fallbacks.is_empty());
        assert_eq!(
            layout.layout_warnings,
            vec!["RTL glyph shaping/render integration pending"]
        );
        assert_eq!(layout.bidi_paragraph_count, 1);
        assert_eq!(layout.visual_run_count, 1);
        assert_eq!(line.base_direction, TextDirection::Rtl);
        assert_eq!(
            layout
                .graphemes
                .iter()
                .map(|grapheme| grapheme.start)
                .collect::<Vec<_>>(),
            vec![2, 1, 0]
        );
        assert_eq!(
            hit_test_text(&layout, line.x, line.y)
                .expect("left-edge hit")
                .offset,
            3
        );
        assert_eq!(
            hit_test_text(&layout, line.x + line.width, line.y)
                .expect("right-edge hit")
                .offset,
            0
        );
    }

    #[test]
    fn splits_discontiguous_mixed_direction_selection_geometry() {
        let mut input = request("abc אבג def", 300.0);
        input.base_style.font_family = "Inter".to_string();
        let layout = layout_text(&input).expect("mixed bidi layout");
        let selection = selection_rects(&layout, 2, 5);

        assert_eq!(layout.measurement_mode, TextMeasurementMode::Mixed);
        assert_eq!(layout.bidi_paragraph_count, 1);
        assert_eq!(layout.visual_run_count, 3);
        assert_eq!(layout.lines[0].base_direction, TextDirection::Ltr);
        assert_eq!(selection.len(), 2);
        assert!(selection[0].x < selection[1].x);
        assert!(selection[0].x + selection[0].width < selection[1].x);
    }

    #[test]
    fn reuses_exact_layout_requests_without_advancing_revision() {
        let mut handle = TextLayoutHandle::with_capacity(2);
        let input = request("cached text", 300.0);

        let first = handle.layout(&input).expect("first layout");
        let second = handle.layout(&input).expect("cached layout");

        assert!(!first.cache_hit);
        assert!(second.cache_hit);
        assert_eq!(handle.revision, 1);
        assert_eq!(
            handle.stats(),
            TextLayoutCacheStats {
                hits: 1,
                misses: 1,
                entries: 1,
                capacity: 2,
            }
        );
    }

    #[test]
    fn bounds_layout_cache_and_never_reuses_changed_metrics() {
        let mut handle = TextLayoutHandle::with_capacity(1);
        let first_request = request("same content", 300.0);
        let mut changed_request = first_request.clone();
        changed_request.width = 40.0;

        let first = handle.layout(&first_request).expect("first layout");
        let changed = handle.layout(&changed_request).expect("changed layout");
        let first_again = handle.layout(&first_request).expect("evicted layout");

        assert!(!first.cache_hit);
        assert!(!changed.cache_hit);
        assert!(!first_again.cache_hit);
        assert_ne!(first.lines.len(), changed.lines.len());
        assert_eq!(handle.revision, 3);
        assert_eq!(handle.stats().entries, 1);
        assert_eq!(handle.stats().misses, 3);
    }
}
