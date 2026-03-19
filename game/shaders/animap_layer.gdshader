shader_type canvas_item;

uniform vec2 animap_size = vec2(1.0, 1.0);
uniform vec2 layer_position = vec2(0.0, 0.0);
uniform float layer_scale = 1.0;

uniform float hue_degrees = 0.0;
uniform float saturation_pct = 100.0;
uniform float lightness_pct = 100.0;
uniform float brightness_pct = 100.0;
uniform float contrast_pct = 100.0;

uniform int mask_count = 0;
uniform sampler2D mask_tex_0 : source_color;
uniform sampler2D mask_tex_1 : source_color;
uniform sampler2D mask_tex_2 : source_color;
uniform sampler2D mask_tex_3 : source_color;

vec3 rgb_to_hsv(vec3 c) {
	vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
	vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
	vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
	float d = q.x - min(q.w, q.y);
	float e = 1.0e-10;
	return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

vec3 hsv_to_rgb(vec3 c) {
	vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
	vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
	return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

float sample_mask_alpha(vec2 mask_uv) {
	float alpha = 0.0;
	if (mask_count > 0) {
		alpha = max(alpha, texture(mask_tex_0, mask_uv).a);
	}
	if (mask_count > 1) {
		alpha = max(alpha, texture(mask_tex_1, mask_uv).a);
	}
	if (mask_count > 2) {
		alpha = max(alpha, texture(mask_tex_2, mask_uv).a);
	}
	if (mask_count > 3) {
		alpha = max(alpha, texture(mask_tex_3, mask_uv).a);
	}
	return alpha;
}

void fragment() {
	vec4 color = texture(TEXTURE, UV);
	vec2 texture_size_px = vec2(textureSize(TEXTURE, 0));
	vec2 animap_px = layer_position + (UV * texture_size_px * layer_scale);
	vec2 mask_uv = animap_px / max(animap_size, vec2(1.0, 1.0));

	vec3 hsv = rgb_to_hsv(color.rgb);
	hsv.x = fract(hsv.x + hue_degrees / 360.0);
	hsv.y = clamp(hsv.y * (saturation_pct / 100.0), 0.0, 1.0);
	color.rgb = hsv_to_rgb(hsv);
	color.rgb *= lightness_pct / 100.0;
	color.rgb *= brightness_pct / 100.0;
	color.rgb = ((color.rgb - 0.5) * (contrast_pct / 100.0)) + 0.5;
	color.rgb = clamp(color.rgb, 0.0, 1.0);

	if (mask_count > 0) {
		color.a *= 1.0 - clamp(sample_mask_alpha(mask_uv), 0.0, 1.0);
	}

	COLOR = color;
}
