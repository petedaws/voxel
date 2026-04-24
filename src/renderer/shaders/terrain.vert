#version 300 es
layout(location=0) in vec3 a_position;
layout(location=1) in vec3 a_normal;
layout(location=2) in vec2 a_tile;   // (tileX, tileY) in atlas grid [0,7]
layout(location=3) in float a_ao;

uniform mat4 u_viewProjection;
uniform vec3 u_chunkOffset;

out vec3 v_worldPos;
out vec3 v_normal;
out vec2 v_tile;
out float v_ao;

void main() {
  vec3 worldPos = a_position + u_chunkOffset;
  v_worldPos = worldPos;
  v_normal   = a_normal;
  v_tile     = a_tile;
  v_ao       = a_ao;
  gl_Position = u_viewProjection * vec4(worldPos, 1.0);
}
