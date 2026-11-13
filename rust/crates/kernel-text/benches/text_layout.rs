use kernel_text::{
    TextAlignment, TextLayoutHandle, TextLayoutRequest, TextLayoutRun, TextStyleMetrics,
};
use std::hint::black_box;
use std::time::{Duration, Instant};

const RUN_COUNT: usize = 100;
const GRAPHEMES_PER_RUN: usize = 100;
const EDIT_ITERATIONS: usize = 50;
const INTER_REGULAR: &[u8] = include_bytes!("../../../../public/v2/fonts/InterVariable.ttf");

fn main() {
    let mut handle = TextLayoutHandle::default();
    handle
        .register_font("Inter", INTER_REGULAR.to_vec(), false)
        .expect("benchmark font should register");
    let baseline = benchmark_request();

    let cold_started = Instant::now();
    let cold = handle
        .layout(&baseline)
        .expect("cold layout should succeed");
    let cold_elapsed = cold_started.elapsed();
    assert_eq!(cold.graphemes.len(), RUN_COUNT * GRAPHEMES_PER_RUN);
    assert_eq!(cold.shaping_run_cache_misses, RUN_COUNT);
    black_box(cold.glyphs.len());

    let mut samples = Vec::with_capacity(EDIT_ITERATIONS);
    let mut reused_runs = 0usize;
    let mut reshaped_runs = 0usize;
    for iteration in 0..EDIT_ITERATIONS {
        let mut edited = baseline.clone();
        let dirty_run = iteration % RUN_COUNT;
        edited.runs[dirty_run].style.letter_spacing = 0.01 * (iteration + 1) as f32;

        let started = Instant::now();
        let layout = handle
            .layout(&edited)
            .expect("incremental layout should succeed");
        samples.push(started.elapsed());
        reused_runs += layout.shaping_run_cache_hits;
        reshaped_runs += layout.shaping_run_cache_misses;
        assert!(layout.shaping_run_cache_hits >= RUN_COUNT - 1);
        black_box(layout.glyphs.len());
    }

    samples.sort_unstable();
    let p50 = percentile(&samples, 0.50);
    let p95 = percentile(&samples, 0.95);
    let stats = handle.stats();
    println!(
        "kernel-text-large-document graphemes={} runs={} edits={} cold_ms={:.3} warm_p50_ms={:.3} warm_p95_ms={:.3} reused_runs={} reshaped_runs={} run_cache_entries={}/{} run_cache_bytes={}/{} evictions={}",
        RUN_COUNT * GRAPHEMES_PER_RUN,
        RUN_COUNT,
        EDIT_ITERATIONS,
        milliseconds(cold_elapsed),
        milliseconds(p50),
        milliseconds(p95),
        reused_runs,
        reshaped_runs,
        stats.shaping_run_entries,
        stats.shaping_run_capacity,
        stats.shaping_run_bytes,
        stats.shaping_run_byte_capacity,
        stats.shaping_run_evictions,
    );
}

fn benchmark_request() -> TextLayoutRequest {
    let mut content = String::with_capacity(RUN_COUNT * GRAPHEMES_PER_RUN);
    let mut runs = Vec::with_capacity(RUN_COUNT);
    let mut offset = 0usize;
    for index in 0..RUN_COUNT {
        let prefix = format!("{index:04}-");
        let segment = format!("{prefix}{}", "x".repeat(GRAPHEMES_PER_RUN - prefix.len()));
        content.push_str(&segment);
        runs.push(TextLayoutRun {
            start: offset,
            end: offset + GRAPHEMES_PER_RUN,
            style: TextStyleMetrics {
                font_family: "Inter".to_string(),
                font_size: 15.0 + (index % 3) as f32,
                font_weight: 300 + ((index % 6) as u16 * 100),
                line_height: 22.0,
                letter_spacing: 0.0,
                italic: false,
                transform: Default::default(),
            },
        });
        offset += GRAPHEMES_PER_RUN;
    }

    TextLayoutRequest {
        content,
        width: 1_200.0,
        alignment: TextAlignment::Left,
        paragraph_spacing: 0.0,
        base_style: TextStyleMetrics {
            font_family: "Inter".to_string(),
            ..TextStyleMetrics::default()
        },
        runs,
    }
}

fn percentile(samples: &[Duration], percentile: f32) -> Duration {
    let index = (((samples.len() - 1) as f32 * percentile).ceil() as usize)
        .min(samples.len().saturating_sub(1));
    samples[index]
}

fn milliseconds(duration: Duration) -> f64 {
    duration.as_secs_f64() * 1_000.0
}
