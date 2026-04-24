#version 300 es
layout(location=0) in vec3 a_position;

uniform mat4 u_viewProjection;
uniform vec3 u_chunkOffset;

out vec3 v_worldPos;

void main() {
  vec3 worldPos = a_position + u_chunkOffset;
  v_worldPos = worldPos;
  gl_Position = u_viewProjection * vec4(worldPos, 1.0);
}
