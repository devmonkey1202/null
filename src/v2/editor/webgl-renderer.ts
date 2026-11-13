import type { RenderList } from "@/v2/editor/contracts";
import {
  buildWebGlDrawPlan,
  WEBGL_INSTANCE_FLOATS,
} from "@/v2/editor/render-batches";

const VERTEX_SHADER = `#version 300 es
precision highp float;

layout(location = 0) in vec2 a_corner;
layout(location = 1) in vec4 i_matrix;
layout(location = 2) in vec4 i_translate_size;
layout(location = 3) in vec4 i_fill;
layout(location = 4) in vec4 i_stroke;
layout(location = 5) in vec4 i_shape;

uniform vec2 u_world_origin;
uniform float u_world_scale;
uniform vec2 u_surface_size;

out vec2 v_local;
flat out vec2 v_size;
flat out vec4 v_fill;
flat out vec4 v_stroke;
flat out vec4 v_shape;

void main() {
  float pixel_world_size = 1.0 / max(u_world_scale, 0.0001);
  float padding = i_shape.x * 0.5 + pixel_world_size * 2.0;
  vec2 local = a_corner * (i_translate_size.zw + vec2(padding * 2.0)) - vec2(padding);
  vec2 world = vec2(
    i_matrix.x * local.x + i_matrix.z * local.y + i_translate_size.x,
    i_matrix.y * local.x + i_matrix.w * local.y + i_translate_size.y
  );
  vec2 pixel = (world - u_world_origin) * u_world_scale;
  vec2 clip = (pixel / u_surface_size) * 2.0 - 1.0;

  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  v_local = local;
  v_size = i_translate_size.zw;
  v_fill = i_fill;
  v_stroke = i_stroke;
  v_shape = i_shape;
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_local;
flat in vec2 v_size;
flat in vec4 v_fill;
flat in vec4 v_stroke;
flat in vec4 v_shape;

out vec4 out_color;

float rounded_box_distance(vec2 point, vec2 half_size, float radius) {
  vec2 delta = abs(point) - half_size + vec2(radius);
  return length(max(delta, 0.0)) + min(max(delta.x, delta.y), 0.0) - radius;
}

float ellipse_distance(vec2 point, vec2 radii) {
  vec2 safe_radii = max(radii, vec2(0.0001));
  return (length(point / safe_radii) - 1.0) * min(safe_radii.x, safe_radii.y);
}

vec4 premultiply(vec4 color) {
  return vec4(color.rgb * color.a, color.a);
}

void main() {
  vec2 half_size = v_size * 0.5;
  vec2 centered = v_local - half_size;
  float distance_to_edge = v_shape.z > 0.5
    ? ellipse_distance(centered, half_size)
    : rounded_box_distance(centered, half_size, min(v_shape.y, min(half_size.x, half_size.y)));
  float antialias_width = max(fwidth(distance_to_edge), 0.0001);
  float fill_mask = 1.0 - smoothstep(-antialias_width, antialias_width, distance_to_edge);
  float stroke_half = max(v_shape.x, 0.0) * 0.5;
  float stroke_mask = stroke_half > 0.0
    ? 1.0 - smoothstep(stroke_half - antialias_width, stroke_half + antialias_width, abs(distance_to_edge))
    : 0.0;

  vec4 fill_layer = premultiply(v_fill) * fill_mask;
  vec4 stroke_layer = premultiply(v_stroke) * stroke_mask;
  vec4 composed = stroke_layer + fill_layer * (1.0 - stroke_layer.a);
  if (composed.a <= 0.0001) {
    discard;
  }
  out_color = composed;
}
`;

const MESH_VERTEX_SHADER = `#version 300 es
precision highp float;

layout(location = 0) in vec2 a_position;
layout(location = 1) in vec4 a_color;

uniform vec2 u_world_origin;
uniform float u_world_scale;
uniform vec2 u_surface_size;

out vec4 v_color;

void main() {
  vec2 pixel = (a_position - u_world_origin) * u_world_scale;
  vec2 clip = (pixel / u_surface_size) * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  v_color = a_color;
}
`;

const MESH_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec4 v_color;
out vec4 out_color;

void main() {
  if (v_color.a <= 0.0001) {
    discard;
  }
  out_color = vec4(v_color.rgb * v_color.a, v_color.a);
}
`;

export type WebGlRenderStatus = {
  backend: "webgl2" | "unavailable";
  available: boolean;
  contextLost: boolean;
  revision: string;
  drawCalls: number;
  instanceCount: number;
  supportedCommandCount: number;
  unsupportedCommandCount: number;
  skippedCommandCount: number;
  invalidPaintCount: number;
  invalidGeometryCount: number;
  meshVertexCount: number;
  meshIndexCount: number;
  triangleCount: number;
  pixelWidth: number;
  pixelHeight: number;
  glError: number;
  error?: string;
};

type RenderRequest = {
  renderList: RenderList;
  cssWidth: number;
  cssHeight: number;
  pixelRatio: number;
};

type RendererResources = {
  program: WebGLProgram;
  vertexArray: WebGLVertexArrayObject;
  cornerBuffer: WebGLBuffer;
  instanceBuffer: WebGLBuffer;
  worldOrigin: WebGLUniformLocation;
  worldScale: WebGLUniformLocation;
  surfaceSize: WebGLUniformLocation;
  meshProgram: WebGLProgram;
  meshVertexArray: WebGLVertexArrayObject;
  meshVertexBuffer: WebGLBuffer;
  meshIndexBuffer: WebGLBuffer;
  meshWorldOrigin: WebGLUniformLocation;
  meshWorldScale: WebGLUniformLocation;
  meshSurfaceSize: WebGLUniformLocation;
};

export class WebGl2UnavailableError extends Error {
  constructor(message = "WebGL2 is unavailable.") {
    super(message);
    this.name = "WebGl2UnavailableError";
  }
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error("WebGL2 could not allocate a shader.");
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || "Unknown shader compile error.";
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function requireUniform(gl: WebGL2RenderingContext, program: WebGLProgram, name: string) {
  const location = gl.getUniformLocation(program, name);
  if (!location) {
    throw new Error(`WebGL2 uniform '${name}' is unavailable.`);
  }
  return location;
}

function createProgram(gl: WebGL2RenderingContext, vertexSource: string, fragmentSource: string) {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  let fragmentShader: WebGLShader;
  try {
    fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  } catch (error) {
    gl.deleteShader(vertexShader);
    throw error;
  }
  const program = gl.createProgram();
  if (!program) {
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    throw new Error("WebGL2 could not allocate a program.");
  }
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) || "Unknown program link error.";
    gl.deleteProgram(program);
    throw new Error(message);
  }
  return program;
}

function createResources(gl: WebGL2RenderingContext): RendererResources {
  const program = createProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER);
  let meshProgram: WebGLProgram;
  try {
    meshProgram = createProgram(gl, MESH_VERTEX_SHADER, MESH_FRAGMENT_SHADER);
  } catch (error) {
    gl.deleteProgram(program);
    throw error;
  }

  const vertexArray = gl.createVertexArray();
  const cornerBuffer = gl.createBuffer();
  const instanceBuffer = gl.createBuffer();
  const meshVertexArray = gl.createVertexArray();
  const meshVertexBuffer = gl.createBuffer();
  const meshIndexBuffer = gl.createBuffer();
  if (
    !vertexArray ||
    !cornerBuffer ||
    !instanceBuffer ||
    !meshVertexArray ||
    !meshVertexBuffer ||
    !meshIndexBuffer
  ) {
    gl.deleteVertexArray(vertexArray);
    gl.deleteBuffer(cornerBuffer);
    gl.deleteBuffer(instanceBuffer);
    gl.deleteVertexArray(meshVertexArray);
    gl.deleteBuffer(meshVertexBuffer);
    gl.deleteBuffer(meshIndexBuffer);
    gl.deleteProgram(program);
    gl.deleteProgram(meshProgram);
    throw new Error("WebGL2 could not allocate renderer buffers.");
  }

  gl.bindVertexArray(vertexArray);
  gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]),
    gl.STATIC_DRAW,
  );
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
  const stride = WEBGL_INSTANCE_FLOATS * Float32Array.BYTES_PER_ELEMENT;
  for (let location = 1; location <= 5; location += 1) {
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(
      location,
      4,
      gl.FLOAT,
      false,
      stride,
      (location - 1) * 4 * Float32Array.BYTES_PER_ELEMENT,
    );
    gl.vertexAttribDivisor(location, 1);
  }

  gl.bindVertexArray(meshVertexArray);
  gl.bindBuffer(gl.ARRAY_BUFFER, meshVertexBuffer);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, meshIndexBuffer);
  const meshStride = 6 * Float32Array.BYTES_PER_ELEMENT;
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, meshStride, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(
    1,
    4,
    gl.FLOAT,
    false,
    meshStride,
    2 * Float32Array.BYTES_PER_ELEMENT,
  );

  gl.bindBuffer(gl.ARRAY_BUFFER, null);
  gl.bindVertexArray(null);
  try {
    return {
      program,
      vertexArray,
      cornerBuffer,
      instanceBuffer,
      worldOrigin: requireUniform(gl, program, "u_world_origin"),
      worldScale: requireUniform(gl, program, "u_world_scale"),
      surfaceSize: requireUniform(gl, program, "u_surface_size"),
      meshProgram,
      meshVertexArray,
      meshVertexBuffer,
      meshIndexBuffer,
      meshWorldOrigin: requireUniform(gl, meshProgram, "u_world_origin"),
      meshWorldScale: requireUniform(gl, meshProgram, "u_world_scale"),
      meshSurfaceSize: requireUniform(gl, meshProgram, "u_surface_size"),
    };
  } catch (error) {
    gl.deleteVertexArray(vertexArray);
    gl.deleteBuffer(cornerBuffer);
    gl.deleteBuffer(instanceBuffer);
    gl.deleteVertexArray(meshVertexArray);
    gl.deleteBuffer(meshVertexBuffer);
    gl.deleteBuffer(meshIndexBuffer);
    gl.deleteProgram(program);
    gl.deleteProgram(meshProgram);
    throw error;
  }
}

function emptyStatus(error?: string): WebGlRenderStatus {
  return {
    backend: "unavailable",
    available: false,
    contextLost: false,
    revision: "",
    drawCalls: 0,
    instanceCount: 0,
    supportedCommandCount: 0,
    unsupportedCommandCount: 0,
    skippedCommandCount: 0,
    invalidPaintCount: 0,
    invalidGeometryCount: 0,
    meshVertexCount: 0,
    meshIndexCount: 0,
    triangleCount: 0,
    pixelWidth: 0,
    pixelHeight: 0,
    glError: 0,
    ...(error ? { error } : {}),
  };
}

export class WebGlRenderBackend {
  private gl: WebGL2RenderingContext | null = null;
  private resources: RendererResources | null = null;
  private contextLost = false;
  private disposed = false;
  private lastRequest: RenderRequest | null = null;
  private lastStatus: WebGlRenderStatus = emptyStatus();

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly onStatus?: (status: WebGlRenderStatus) => void,
  ) {
    this.initialize();
    this.canvas.addEventListener("webglcontextlost", this.handleContextLost);
    this.canvas.addEventListener("webglcontextrestored", this.handleContextRestored);
  }

  render(request: RenderRequest): WebGlRenderStatus {
    this.lastRequest = request;
    if (this.disposed) {
      return this.publishStatus(emptyStatus("The WebGL2 renderer has been disposed."));
    }
    if (this.contextLost || !this.gl || !this.resources) {
      return this.publishStatus({
        ...emptyStatus("The WebGL2 context is lost."),
        backend: "webgl2",
        contextLost: true,
        revision: request.renderList.revision,
      });
    }

    const gl = this.gl;
    const resources = this.resources;
    const pixelRatio = Math.min(Math.max(request.pixelRatio || 1, 1), 3);
    const pixelWidth = Math.max(Math.round(request.cssWidth * pixelRatio), 1);
    const pixelHeight = Math.max(Math.round(request.cssHeight * pixelRatio), 1);
    if (this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight) {
      this.canvas.width = pixelWidth;
      this.canvas.height = pixelHeight;
    }
    this.canvas.style.width = `${Math.max(request.cssWidth, 1)}px`;
    this.canvas.style.height = `${Math.max(request.cssHeight, 1)}px`;

    const plan = buildWebGlDrawPlan(request.renderList);
    const worldScale = request.renderList.viewport.scale * pixelRatio;
    gl.viewport(0, 0, pixelWidth, pixelHeight);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    let drawCalls = 0;
    for (const operation of plan.operations) {
      if (operation.kind === "instances") {
        gl.useProgram(resources.program);
        gl.uniform2f(
          resources.worldOrigin,
          request.renderList.viewport.x,
          request.renderList.viewport.y,
        );
        gl.uniform1f(resources.worldScale, worldScale);
        gl.uniform2f(resources.surfaceSize, pixelWidth, pixelHeight);
        gl.bindVertexArray(resources.vertexArray);
        gl.bindBuffer(gl.ARRAY_BUFFER, resources.instanceBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, operation.batch.instances, gl.DYNAMIC_DRAW);
        gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, operation.batch.instanceCount);
      } else {
        gl.useProgram(resources.meshProgram);
        gl.uniform2f(
          resources.meshWorldOrigin,
          request.renderList.viewport.x,
          request.renderList.viewport.y,
        );
        gl.uniform1f(resources.meshWorldScale, worldScale);
        gl.uniform2f(resources.meshSurfaceSize, pixelWidth, pixelHeight);
        gl.bindVertexArray(resources.meshVertexArray);
        gl.bindBuffer(gl.ARRAY_BUFFER, resources.meshVertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, operation.batch.vertices, gl.DYNAMIC_DRAW);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, resources.meshIndexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, operation.batch.indices, gl.DYNAMIC_DRAW);
        gl.drawElements(gl.TRIANGLES, operation.batch.indexCount, gl.UNSIGNED_INT, 0);
      }
      drawCalls += 1;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindVertexArray(null);
    gl.useProgram(null);
    const glError = gl.getError();
    return this.publishStatus({
      backend: "webgl2",
      available: true,
      contextLost: false,
      revision: request.renderList.revision,
      drawCalls,
      instanceCount: plan.instanceCount,
      supportedCommandCount: plan.supportedCommandIds.length,
      unsupportedCommandCount: plan.unsupportedCommandIds.length,
      skippedCommandCount: plan.skippedCommandIds.length,
      invalidPaintCount: plan.invalidPaintCommandIds.length,
      invalidGeometryCount: plan.invalidGeometryCommandIds.length,
      meshVertexCount: plan.meshVertexCount,
      meshIndexCount: plan.meshIndexCount,
      triangleCount: plan.triangleCount,
      pixelWidth,
      pixelHeight,
      glError,
      ...(glError === gl.NO_ERROR ? {} : { error: `WebGL2 error ${glError}.` }),
    });
  }

  dispose() {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.canvas.removeEventListener("webglcontextlost", this.handleContextLost);
    this.canvas.removeEventListener("webglcontextrestored", this.handleContextRestored);
    this.destroyResources();
    this.gl = null;
    this.lastRequest = null;
  }

  private initialize() {
    const gl = this.canvas.getContext("webgl2", {
      alpha: true,
      antialias: true,
      depth: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
      stencil: false,
    });
    if (!gl) {
      throw new WebGl2UnavailableError();
    }
    this.gl = gl;
    this.resources = createResources(gl);
    this.contextLost = false;
  }

  private destroyResources() {
    if (!this.gl || !this.resources || this.contextLost) {
      this.resources = null;
      return;
    }
    this.gl.deleteBuffer(this.resources.cornerBuffer);
    this.gl.deleteBuffer(this.resources.instanceBuffer);
    this.gl.deleteVertexArray(this.resources.vertexArray);
    this.gl.deleteProgram(this.resources.program);
    this.gl.deleteBuffer(this.resources.meshVertexBuffer);
    this.gl.deleteBuffer(this.resources.meshIndexBuffer);
    this.gl.deleteVertexArray(this.resources.meshVertexArray);
    this.gl.deleteProgram(this.resources.meshProgram);
    this.resources = null;
  }

  private publishStatus(status: WebGlRenderStatus) {
    this.lastStatus = status;
    this.onStatus?.(status);
    return status;
  }

  private readonly handleContextLost = (event: Event) => {
    event.preventDefault();
    this.contextLost = true;
    this.resources = null;
    this.publishStatus({
      ...this.lastStatus,
      backend: "webgl2",
      available: false,
      contextLost: true,
      error: "The WebGL2 context was lost.",
    });
  };

  private readonly handleContextRestored = () => {
    if (this.disposed) {
      return;
    }
    try {
      this.initialize();
      if (this.lastRequest) {
        this.render(this.lastRequest);
      }
    } catch (error) {
      this.publishStatus(
        emptyStatus(error instanceof Error ? error.message : "WebGL2 context restore failed."),
      );
    }
  };
}
