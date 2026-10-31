import { colorTable, hexToRgb } from './color.ts';
import type { Palette, Renderer, SceneSettings } from './types.ts';

const curveVertex = `#version 300 es
precision highp float;
precision highp int;
layout(location=0) in vec3 aSample;
uniform vec2 uPoints[10];
uniform vec2 uViewport;
uniform float uLayer, uCurvature, uWidth;
uniform int uStroke;
out float vEdge;
vec2 point(int i) { return mix(uPoints[clamp(i,0,4)],uPoints[5+clamp(i,0,4)],uLayer); }
vec2 curve(float t) {
  float f=clamp(t,0.,1.)*4.; int i=min(int(f),3); float s=f-float(i);
  vec2 p=point(i), q=point(i+1);
  vec2 m=(q-point(i-1))*.5*uCurvature, n=(point(i+2)-p)*.5*uCurvature;
  float s2=s*s, s3=s2*s;
  return (2.*s3-3.*s2+1.)*p+(s3-2.*s2+s)*m+(-2.*s3+3.*s2)*q+(s3-s2)*n;
}
void main() {
  vec2 p=curve(aSample.x);
  vEdge=aSample.y;
  if(uStroke==1) {
    vec2 d=(curve(aSample.x+.0001)-curve(aSample.x-.0001))*uViewport;
    vec2 normal=vec2(-d.y,d.x)/max(length(d),.00001);
    p+=normal*aSample.y*(uWidth*.5+1.)/uViewport;
  } else if(aSample.z>0.5) { p=vec2(0.); }
  gl_Position=vec4(p.x*2.-1.,1.-p.y*2.,0.,1.);
}`;
const curveFragment = `#version 300 es
precision highp float;
precision highp int;
in float vEdge;
uniform vec4 uColor;
uniform float uWidth;
uniform int uStroke;
out vec4 outColor;
void main(){
  float alpha=uColor.a;
  if(uStroke==1) {
    float distance=abs(vEdge)*(uWidth*.5+1.);
    alpha*=1.-smoothstep(max(0.,uWidth*.5-.5),uWidth*.5+.5,distance);
  }
  outColor=vec4(uColor.rgb,alpha);
}`;
const screenVertex = `#version 300 es
out vec2 vUv;
void main(){ vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2)); vUv=p; gl_Position=vec4(p*2.-1.,0.,1.); }`;
const screenFragment = `#version 300 es
precision highp float;
in vec2 vUv;
uniform vec4 uColor;
uniform vec3 uTop, uBottom;
uniform int uBackground;
out vec4 outColor;
void main(){ outColor=uBackground==1 ? vec4(mix(uBottom,uTop,vUv.y),1.) : uColor; }`;

function program(gl: WebGL2RenderingContext, vertex: string, fragment: string) {
  const shaders = [gl.VERTEX_SHADER, gl.FRAGMENT_SHADER].map((type, i) => {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, i === 0 ? vertex : fragment);
    gl.compileShader(shader);
    return shader;
  });
  const result = gl.createProgram()!;
  shaders.forEach(shader => gl.attachShader(result, shader));
  gl.linkProgram(result);
  const error = gl.getProgramParameter(result, gl.LINK_STATUS) ? '' :
    shaders.map(shader => gl.getShaderInfoLog(shader)).join('\n') + gl.getProgramInfoLog(result);
  shaders.forEach(shader => gl.deleteShader(shader));
  if (error) { gl.deleteProgram(result); throw new Error(error); }
  return result;
}

export class WaveRenderer implements Renderer {
  private gl: WebGL2RenderingContext;
  private curve!: WebGLProgram;
  private screen!: WebGLProgram;
  private stroke!: WebGLVertexArrayObject;
  private fill!: WebGLVertexArrayObject;
  private buffers: WebGLBuffer[] = [];
  private uniforms = new Map<string, WebGLUniformLocation | null>();
  private width = 1;
  private height = 1;
  private strokeColors = new Uint8Array(0);
  private fillColors = new Uint8Array(0);
  private top: number[] = [0, 0, 0];
  private bottom: number[] = [0, 0, 0];
  private lost = false;
  private readonly samples = 256;

  constructor(private canvas: HTMLCanvasElement, private status: (message: string) => void, private invalidate: () => void) {
    const gl = canvas.getContext('webgl2', { stencil: true, antialias: true, depth: false, preserveDrawingBuffer: false });
    if (!gl) throw new Error('WebGL2 is unavailable. You can still explore and save palettes.');
    this.gl = gl;
    this.initialize();
    canvas.addEventListener('webglcontextlost', this.onLost);
    canvas.addEventListener('webglcontextrestored', this.onRestored);
  }

  private onLost = (event: Event) => {
    event.preventDefault(); this.lost = true;
    this.status('Rendering paused while the graphics connection recovers.');
    this.invalidate();
  };
  private onRestored = () => {
    try { this.initialize(); this.lost = false; this.status(''); this.invalidate(); }
    catch { this.lost = true; this.status('Rendering could not recover. Reload to try again; your palettes are still available.'); }
  };
  get available() { return !this.lost; }

  private initialize() {
    const gl = this.gl;
    this.uniforms.clear(); this.buffers = [];
    this.curve = program(gl, curveVertex, curveFragment);
    this.screen = program(gl, screenVertex, screenFragment);
    const ribbon: number[] = [], fan: number[] = [];
    for (let i = 0; i <= this.samples; i++) ribbon.push(i / this.samples, -1, 0, i / this.samples, 1, 0);
    for (let i = 0; i <= this.samples; i++) {
      fan.push(0, 0, 1, i / this.samples, 0, 0, (i === this.samples ? 0 : (i + 1) / this.samples), 0, 0);
    }
    const geometry = (data: number[]) => {
      const vao = gl.createVertexArray()!;
      const buffer = gl.createBuffer()!; this.buffers.push(buffer);
      gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
      return vao;
    };
    this.stroke = geometry(ribbon); this.fill = geometry(fan);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }

  private uniform(program: WebGLProgram, key: string) {
    const cacheKey = (program === this.curve ? 'curve:' : 'screen:') + key;
    if (!this.uniforms.has(cacheKey)) this.uniforms.set(cacheKey, this.gl.getUniformLocation(program, key));
    return this.uniforms.get(cacheKey)!;
  }

  resize(width: number, height: number, pixelRatio: number) {
    this.width = width; this.height = height;
    this.canvas.width = Math.max(1, Math.round(width * Math.min(pixelRatio, 2)));
    this.canvas.height = Math.max(1, Math.round(height * Math.min(pixelRatio, 2)));
  }
  setPalette(palette: Palette) {
    this.top = hexToRgb(palette.background[0]); this.bottom = hexToRgb(palette.background[1]);
    this.strokeColors = colorTable(palette.strokes); this.fillColors = colorTable(palette.fills);
  }

  render(points: Float32Array, settings: SceneSettings) {
    if (this.lost) return;
    const gl = this.gl, curve = this.curve, screen = this.screen;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.disable(gl.BLEND); gl.disable(gl.STENCIL_TEST); gl.colorMask(true, true, true, true);
    gl.useProgram(screen); gl.bindVertexArray(null);
    gl.uniform1i(this.uniform(screen, 'uBackground'), 1);
    gl.uniform3fv(this.uniform(screen, 'uTop'), this.top);
    gl.uniform3fv(this.uniform(screen, 'uBottom'), this.bottom);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.uniform1i(this.uniform(screen, 'uBackground'), 0);
    gl.useProgram(curve);
    gl.uniform2fv(this.uniform(curve, 'uPoints[0]'), points);
    gl.uniform2f(this.uniform(curve, 'uViewport'), this.width, this.height);
    gl.uniform1f(this.uniform(curve, 'uCurvature'), settings.curvature);
    gl.uniform1f(this.uniform(curve, 'uWidth'), settings.strokeWidth);
    gl.enable(gl.BLEND); gl.stencilMask(0xff); gl.clearStencil(0); gl.clear(gl.STENCIL_BUFFER_BIT);
    for (let i = 0; i < settings.curveCount; i++) {
      const t = i / (settings.curveCount - 1), offset = Math.round(t * 255) * 4;
      gl.useProgram(curve); gl.uniform1f(this.uniform(curve, 'uLayer'), t);
      if (settings.fillOpacity > 0) {
        // Winding stencil handles concavity and self-intersections without
        // triangulating animated polygons or uploading vertices every frame.
        gl.enable(gl.STENCIL_TEST); gl.colorMask(false, false, false, false);
        gl.stencilFunc(gl.ALWAYS, 0, 0xff);
        gl.stencilOpSeparate(gl.FRONT, gl.KEEP, gl.KEEP, gl.INCR_WRAP);
        gl.stencilOpSeparate(gl.BACK, gl.KEEP, gl.KEEP, gl.DECR_WRAP);
        gl.uniform1i(this.uniform(curve, 'uStroke'), 0);
        gl.bindVertexArray(this.fill); gl.drawArrays(gl.TRIANGLES, 0, (this.samples + 1) * 3);
        gl.colorMask(true, true, true, true);
        gl.stencilFunc(gl.NOTEQUAL, 0, 0xff); gl.stencilOp(gl.KEEP, gl.KEEP, gl.ZERO);
        gl.useProgram(screen); gl.bindVertexArray(null);
        gl.uniform4f(this.uniform(screen, 'uColor'), this.fillColors[offset]/255, this.fillColors[offset+1]/255, this.fillColors[offset+2]/255, settings.fillOpacity);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.disable(gl.STENCIL_TEST);
      }
      if (settings.strokeWidth > 0 && settings.strokeOpacity > 0) {
        gl.useProgram(curve); gl.uniform1i(this.uniform(curve, 'uStroke'), 1);
        gl.uniform4f(this.uniform(curve, 'uColor'), this.strokeColors[offset]/255, this.strokeColors[offset+1]/255, this.strokeColors[offset+2]/255, settings.strokeOpacity * t);
        gl.bindVertexArray(this.stroke); gl.drawArrays(gl.TRIANGLE_STRIP, 0, (this.samples + 1) * 2);
      }
    }
    gl.bindVertexArray(null);
  }

  destroy() {
    this.canvas.removeEventListener('webglcontextlost', this.onLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onRestored);
    const gl = this.gl;
    this.buffers.forEach(buffer => gl.deleteBuffer(buffer));
    gl.deleteVertexArray(this.stroke); gl.deleteVertexArray(this.fill);
    gl.deleteProgram(this.curve); gl.deleteProgram(this.screen);
  }
}
