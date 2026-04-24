#version 300 es
precision highp float;

in vec3 v_worldPos;
in vec3 v_normal;
in vec2 v_tile;   // atlas tile coords (tileX, tileY) in [0,7]
in float v_ao;

uniform sampler2D u_atlas;
uniform vec3 u_cameraPos;
uniform vec3 u_fogColor;
uniform float u_fogDensity;

out vec4 fragColor;

void main() {
  // World-space UV so greedy-merged quads tile correctly
  vec3 absN = abs(v_normal);
  vec2 worldUV;
  if (absN.y > 0.5)      worldUV = fract(v_worldPos.xz);
  else if (absN.x > 0.5) worldUV = fract(v_worldPos.zy);
  else                   worldUV = fract(v_worldPos.xy);

  vec2 uv = (v_tile + worldUV) / 8.0;
  vec4 texColor = texture(u_atlas, uv);
  if (texColor.a < 0.1) discard;

  vec3 lightDir = normalize(vec3(0.6, 1.0, 0.4));
  float diffuse = max(dot(v_normal, lightDir), 0.0) * 0.6 + 0.4;

  vec3 color = texColor.rgb * diffuse * v_ao;

  float dist = length(v_worldPos - u_cameraPos);
  float fogFactor = exp(-(u_fogDensity * dist) * (u_fogDensity * dist));
  color = mix(u_fogColor, color, clamp(fogFactor, 0.0, 1.0));

  fragColor = vec4(color, 1.0);
}
