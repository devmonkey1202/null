use core_error::CoreError;
use lyon_path::{math::point, Path};
use lyon_tessellation::{
    BuffersBuilder, FillOptions, FillTessellator, FillVertex, LineCap, LineJoin, StrokeOptions,
    StrokeTessellator, StrokeVertex, VertexBuffers,
};
use serde::{Deserialize, Serialize};

pub const VECTOR_GEOMETRY_VERSION: u32 = 1;
pub const MAX_PATH_POINTS: usize = 65_536;
pub const MAX_MESH_VERTICES: usize = 2_000_000;
pub const MAX_MESH_INDICES: usize = 6_000_000;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct VectorPoint {
    pub x: f32,
    pub y: f32,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct VectorBounds {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct VectorPathPoint {
    pub x: f32,
    pub y: f32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub handle_in: Option<VectorPoint>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub handle_out: Option<VectorPoint>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct VectorPath {
    pub points: Vec<VectorPathPoint>,
    pub closed: bool,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum VectorLineCap {
    #[default]
    Butt,
    Square,
    Round,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum VectorLineJoin {
    #[default]
    Miter,
    Bevel,
    Round,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct VectorTessellationOptions {
    pub fill: bool,
    pub stroke_width: f32,
    pub tolerance: f32,
    pub line_cap: VectorLineCap,
    pub line_join: VectorLineJoin,
    pub miter_limit: f32,
}

impl Default for VectorTessellationOptions {
    fn default() -> Self {
        Self {
            fill: true,
            stroke_width: 0.0,
            tolerance: 0.25,
            line_cap: VectorLineCap::Butt,
            line_join: VectorLineJoin::Miter,
            miter_limit: 4.0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct VectorMesh {
    pub vertices: Vec<VectorPoint>,
    pub indices: Vec<u32>,
    pub bounds: VectorBounds,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct VectorGeometryStats {
    pub path_point_count: usize,
    pub fill_vertex_count: usize,
    pub fill_index_count: usize,
    pub stroke_vertex_count: usize,
    pub stroke_index_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TessellatedPath {
    pub version: u32,
    pub tolerance: f32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fill: Option<VectorMesh>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stroke: Option<VectorMesh>,
    pub stats: VectorGeometryStats,
    pub fingerprint: String,
}

pub fn tessellate_path(
    input: &VectorPath,
    options: VectorTessellationOptions,
) -> Result<TessellatedPath, CoreError> {
    validate_path(input)?;
    validate_options(options)?;
    if !options.fill && options.stroke_width == 0.0 {
        return Err(CoreError::new(
            "vector.options.no_output",
            "Path tessellation requires a fill or a positive stroke width.",
        ));
    }

    let path = build_lyon_path(input);
    let fill = if options.fill && input.points.len() >= 3 {
        Some(tessellate_fill(&path, options.tolerance)?)
    } else {
        None
    };
    let stroke = if options.stroke_width > 0.0 {
        Some(tessellate_stroke(&path, options)?)
    } else {
        None
    };
    let stats = VectorGeometryStats {
        path_point_count: input.points.len(),
        fill_vertex_count: fill.as_ref().map_or(0, |mesh| mesh.vertices.len()),
        fill_index_count: fill.as_ref().map_or(0, |mesh| mesh.indices.len()),
        stroke_vertex_count: stroke.as_ref().map_or(0, |mesh| mesh.vertices.len()),
        stroke_index_count: stroke.as_ref().map_or(0, |mesh| mesh.indices.len()),
    };
    let fingerprint = geometry_fingerprint(input, options, fill.as_ref(), stroke.as_ref());

    Ok(TessellatedPath {
        version: VECTOR_GEOMETRY_VERSION,
        tolerance: options.tolerance,
        fill,
        stroke,
        stats,
        fingerprint,
    })
}

fn validate_path(path: &VectorPath) -> Result<(), CoreError> {
    if path.points.len() < 2 {
        return Err(CoreError::new(
            "vector.path.too_few_points",
            "A vector path requires at least two points.",
        ));
    }
    if path.points.len() > MAX_PATH_POINTS {
        return Err(CoreError::new(
            "vector.path.point_limit",
            format!("A vector path cannot exceed {MAX_PATH_POINTS} points."),
        ));
    }
    for (index, path_point) in path.points.iter().enumerate() {
        let mut values = vec![path_point.x, path_point.y];
        if let Some(handle) = path_point.handle_in {
            values.extend([handle.x, handle.y]);
        }
        if let Some(handle) = path_point.handle_out {
            values.extend([handle.x, handle.y]);
        }
        if !values.into_iter().all(f32::is_finite) {
            return Err(CoreError::new(
                "vector.path.non_finite",
                format!("Path point {index} contains a non-finite coordinate."),
            ));
        }
    }
    Ok(())
}

fn validate_options(options: VectorTessellationOptions) -> Result<(), CoreError> {
    if !options.tolerance.is_finite() || options.tolerance <= 0.0 || options.tolerance > 100.0 {
        return Err(CoreError::new(
            "vector.options.invalid_tolerance",
            "Vector tolerance must be finite and greater than zero, up to 100.",
        ));
    }
    if !options.stroke_width.is_finite()
        || options.stroke_width < 0.0
        || options.stroke_width > 1_000_000.0
    {
        return Err(CoreError::new(
            "vector.options.invalid_stroke_width",
            "Vector stroke width must be finite and between zero and 1,000,000.",
        ));
    }
    if !options.miter_limit.is_finite() || options.miter_limit < 1.0 {
        return Err(CoreError::new(
            "vector.options.invalid_miter_limit",
            "Vector miter limit must be finite and at least one.",
        ));
    }
    Ok(())
}

fn build_lyon_path(input: &VectorPath) -> Path {
    let mut builder = Path::builder();
    let first = &input.points[0];
    builder.begin(point(first.x, first.y));
    for index in 1..input.points.len() {
        append_segment(&mut builder, &input.points[index - 1], &input.points[index]);
    }
    if input.closed {
        append_segment(
            &mut builder,
            input.points.last().expect("validated path"),
            first,
        );
    }
    builder.end(input.closed);
    builder.build()
}

fn append_segment(
    builder: &mut lyon_path::path::Builder,
    from: &VectorPathPoint,
    to: &VectorPathPoint,
) {
    match (from.handle_out, to.handle_in) {
        (None, None) => {
            builder.line_to(point(to.x, to.y));
        }
        (handle_out, handle_in) => {
            let first = handle_out.unwrap_or(VectorPoint {
                x: from.x,
                y: from.y,
            });
            let second = handle_in.unwrap_or(VectorPoint { x: to.x, y: to.y });
            builder.cubic_bezier_to(
                point(first.x, first.y),
                point(second.x, second.y),
                point(to.x, to.y),
            );
        }
    }
}

fn tessellate_fill(path: &Path, tolerance: f32) -> Result<VectorMesh, CoreError> {
    let mut buffers: VertexBuffers<[f32; 2], u32> = VertexBuffers::new();
    FillTessellator::new()
        .tessellate_path(
            path,
            &FillOptions::default().with_tolerance(tolerance),
            &mut BuffersBuilder::new(&mut buffers, |vertex: FillVertex<'_>| {
                let position = vertex.position();
                [position.x, position.y]
            }),
        )
        .map_err(|error| {
            CoreError::new(
                "vector.tessellation.fill_failed",
                format!("Fill tessellation failed: {error:?}."),
            )
        })?;
    mesh_from_buffers(buffers)
}

fn tessellate_stroke(
    path: &Path,
    options: VectorTessellationOptions,
) -> Result<VectorMesh, CoreError> {
    let mut buffers: VertexBuffers<[f32; 2], u32> = VertexBuffers::new();
    let stroke_options = StrokeOptions::default()
        .with_line_width(options.stroke_width)
        .with_tolerance(options.tolerance)
        .with_line_cap(line_cap(options.line_cap))
        .with_line_join(line_join(options.line_join))
        .with_miter_limit(options.miter_limit);
    StrokeTessellator::new()
        .tessellate_path(
            path,
            &stroke_options,
            &mut BuffersBuilder::new(&mut buffers, |vertex: StrokeVertex<'_, '_>| {
                let position = vertex.position();
                [position.x, position.y]
            }),
        )
        .map_err(|error| {
            CoreError::new(
                "vector.tessellation.stroke_failed",
                format!("Stroke tessellation failed: {error:?}."),
            )
        })?;
    mesh_from_buffers(buffers)
}

fn mesh_from_buffers(buffers: VertexBuffers<[f32; 2], u32>) -> Result<VectorMesh, CoreError> {
    if buffers.vertices.len() > MAX_MESH_VERTICES || buffers.indices.len() > MAX_MESH_INDICES {
        return Err(CoreError::new(
            "vector.tessellation.output_limit",
            format!(
                "Tessellation exceeded the mesh limit of {MAX_MESH_VERTICES} vertices or {MAX_MESH_INDICES} indices."
            ),
        ));
    }
    if buffers.vertices.is_empty() || buffers.indices.is_empty() {
        return Err(CoreError::new(
            "vector.tessellation.empty_geometry",
            "The path did not produce drawable geometry.",
        ));
    }
    let vertices = buffers
        .vertices
        .into_iter()
        .map(|position| VectorPoint {
            x: position[0],
            y: position[1],
        })
        .collect::<Vec<_>>();
    let bounds = mesh_bounds(&vertices);
    Ok(VectorMesh {
        vertices,
        indices: buffers.indices,
        bounds,
    })
}

fn mesh_bounds(vertices: &[VectorPoint]) -> VectorBounds {
    let min_x = vertices
        .iter()
        .map(|vertex| vertex.x)
        .fold(f32::INFINITY, f32::min);
    let min_y = vertices
        .iter()
        .map(|vertex| vertex.y)
        .fold(f32::INFINITY, f32::min);
    let max_x = vertices
        .iter()
        .map(|vertex| vertex.x)
        .fold(f32::NEG_INFINITY, f32::max);
    let max_y = vertices
        .iter()
        .map(|vertex| vertex.y)
        .fold(f32::NEG_INFINITY, f32::max);
    VectorBounds {
        x: min_x,
        y: min_y,
        width: (max_x - min_x).max(0.0),
        height: (max_y - min_y).max(0.0),
    }
}

fn line_cap(value: VectorLineCap) -> LineCap {
    match value {
        VectorLineCap::Butt => LineCap::Butt,
        VectorLineCap::Square => LineCap::Square,
        VectorLineCap::Round => LineCap::Round,
    }
}

fn line_join(value: VectorLineJoin) -> LineJoin {
    match value {
        VectorLineJoin::Miter => LineJoin::Miter,
        VectorLineJoin::Bevel => LineJoin::Bevel,
        VectorLineJoin::Round => LineJoin::Round,
    }
}

fn geometry_fingerprint(
    path: &VectorPath,
    options: VectorTessellationOptions,
    fill: Option<&VectorMesh>,
    stroke: Option<&VectorMesh>,
) -> String {
    let mut bytes = Vec::new();
    bytes.extend_from_slice(&VECTOR_GEOMETRY_VERSION.to_le_bytes());
    bytes.push(u8::from(path.closed));
    bytes.push(u8::from(options.fill));
    bytes.extend_from_slice(&options.stroke_width.to_bits().to_le_bytes());
    bytes.extend_from_slice(&options.tolerance.to_bits().to_le_bytes());
    bytes.push(options.line_cap as u8);
    bytes.push(options.line_join as u8);
    bytes.extend_from_slice(&options.miter_limit.to_bits().to_le_bytes());
    for path_point in &path.points {
        bytes.extend_from_slice(&path_point.x.to_bits().to_le_bytes());
        bytes.extend_from_slice(&path_point.y.to_bits().to_le_bytes());
        append_optional_point(&mut bytes, path_point.handle_in);
        append_optional_point(&mut bytes, path_point.handle_out);
    }
    append_mesh_fingerprint(&mut bytes, fill);
    append_mesh_fingerprint(&mut bytes, stroke);
    format!("{:016x}", fnv1a64(&bytes))
}

fn append_optional_point(bytes: &mut Vec<u8>, value: Option<VectorPoint>) {
    bytes.push(u8::from(value.is_some()));
    if let Some(value) = value {
        bytes.extend_from_slice(&value.x.to_bits().to_le_bytes());
        bytes.extend_from_slice(&value.y.to_bits().to_le_bytes());
    }
}

fn append_mesh_fingerprint(bytes: &mut Vec<u8>, mesh: Option<&VectorMesh>) {
    bytes.push(u8::from(mesh.is_some()));
    if let Some(mesh) = mesh {
        for vertex in &mesh.vertices {
            bytes.extend_from_slice(&vertex.x.to_bits().to_le_bytes());
            bytes.extend_from_slice(&vertex.y.to_bits().to_le_bytes());
        }
        for index in &mesh.indices {
            bytes.extend_from_slice(&index.to_le_bytes());
        }
    }
}

fn fnv1a64(bytes: &[u8]) -> u64 {
    let mut hash = 0xcbf29ce484222325u64;
    for byte in bytes {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    hash
}

#[cfg(test)]
mod tests {
    use super::*;

    fn triangle() -> VectorPath {
        VectorPath {
            points: vec![
                VectorPathPoint {
                    x: 0.0,
                    y: 0.0,
                    handle_in: None,
                    handle_out: None,
                },
                VectorPathPoint {
                    x: 100.0,
                    y: 0.0,
                    handle_in: None,
                    handle_out: None,
                },
                VectorPathPoint {
                    x: 50.0,
                    y: 80.0,
                    handle_in: None,
                    handle_out: None,
                },
            ],
            closed: true,
        }
    }

    #[test]
    fn closed_path_produces_indexed_fill_geometry() {
        let geometry = tessellate_path(&triangle(), VectorTessellationOptions::default())
            .expect("triangle geometry");
        let fill = geometry.fill.as_ref().expect("fill");

        assert_eq!(geometry.version, VECTOR_GEOMETRY_VERSION);
        assert!(fill.vertices.len() >= 3);
        assert_eq!(fill.indices.len() % 3, 0);
        assert_eq!(fill.bounds.width, 100.0);
        assert_eq!(fill.bounds.height, 80.0);
        assert!(geometry.stroke.is_none());
    }

    #[test]
    fn open_path_produces_stroke_with_requested_caps() {
        let path = VectorPath {
            points: triangle().points[..2].to_vec(),
            closed: false,
        };
        let geometry = tessellate_path(
            &path,
            VectorTessellationOptions {
                fill: false,
                stroke_width: 10.0,
                line_cap: VectorLineCap::Round,
                ..VectorTessellationOptions::default()
            },
        )
        .expect("stroke geometry");
        let stroke = geometry.stroke.as_ref().expect("stroke");

        assert!(geometry.fill.is_none());
        assert!(stroke.vertices.len() > 4);
        assert!(stroke.bounds.x < 0.0);
        assert!(stroke.bounds.width > 100.0);
    }

    #[test]
    fn cubic_handles_generate_curve_segments() {
        let path = VectorPath {
            points: vec![
                VectorPathPoint {
                    x: 0.0,
                    y: 0.0,
                    handle_in: None,
                    handle_out: Some(VectorPoint { x: 20.0, y: 100.0 }),
                },
                VectorPathPoint {
                    x: 100.0,
                    y: 0.0,
                    handle_in: Some(VectorPoint { x: 80.0, y: 100.0 }),
                    handle_out: None,
                },
            ],
            closed: false,
        };
        let geometry = tessellate_path(
            &path,
            VectorTessellationOptions {
                fill: false,
                stroke_width: 2.0,
                ..VectorTessellationOptions::default()
            },
        )
        .expect("curve geometry");

        assert!(geometry.stats.stroke_vertex_count > 8);
        assert!(geometry.stroke.as_ref().expect("stroke").bounds.height > 70.0);
    }

    #[test]
    fn geometry_fingerprint_is_stable_and_option_sensitive() {
        let first =
            tessellate_path(&triangle(), VectorTessellationOptions::default()).expect("first");
        let second =
            tessellate_path(&triangle(), VectorTessellationOptions::default()).expect("second");
        let detailed = tessellate_path(
            &triangle(),
            VectorTessellationOptions {
                tolerance: 0.1,
                ..VectorTessellationOptions::default()
            },
        )
        .expect("detailed");

        assert_eq!(first.fingerprint, second.fingerprint);
        assert_ne!(first.fingerprint, detailed.fingerprint);
    }

    #[test]
    fn invalid_path_and_options_are_rejected_before_tessellation() {
        let mut invalid = triangle();
        invalid.points[0].x = f32::NAN;
        assert_eq!(
            tessellate_path(&invalid, VectorTessellationOptions::default())
                .expect_err("non-finite point")
                .code,
            "vector.path.non_finite"
        );

        let too_short = VectorPath {
            points: triangle().points[..1].to_vec(),
            closed: false,
        };
        assert_eq!(
            tessellate_path(&too_short, VectorTessellationOptions::default())
                .expect_err("too few points")
                .code,
            "vector.path.too_few_points"
        );

        assert_eq!(
            tessellate_path(
                &triangle(),
                VectorTessellationOptions {
                    tolerance: 0.0,
                    ..VectorTessellationOptions::default()
                }
            )
            .expect_err("zero tolerance")
            .code,
            "vector.options.invalid_tolerance"
        );
    }

    #[test]
    fn no_output_configuration_is_rejected() {
        let error = tessellate_path(
            &triangle(),
            VectorTessellationOptions {
                fill: false,
                stroke_width: 0.0,
                ..VectorTessellationOptions::default()
            },
        )
        .expect_err("no output");
        assert_eq!(error.code, "vector.options.no_output");
    }
}
