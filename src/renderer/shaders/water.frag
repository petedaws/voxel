#version 300 es
precision highp float;

in vec3 v_worldPos;

uniform vec3 u_cameraPos;
uniform vec3 u_fogColor;
uniform float u_fogDensity;

out vec4 fragColor;

void main() {
  vec3 waterColor = vec3(0.1, 0.35, 0.7);

  float dist = length(v_worldPos - u_cameraPos);
  float fogFactor = exp(-(u_fogDensity * dist) * (u_fogDensity * dist));
  vec3 color = mix(u_fogColor, waterColor, clamp(fogFactor, 0.0, 1.0));

  fragColor = vec4(color, 0.65);
}
