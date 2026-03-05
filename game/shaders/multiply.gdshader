shader_type canvas_item;
render_mode blend_mul;

void fragment() {
    vec4 tex = texture(TEXTURE, UV);
    // React implementation uses a solid color div masked by the frame alpha.
    // So we only care about the texture's alpha channel, not its RGB.
    // mix(White, Tint, Alpha)
    // White (1.0) * DST = DST (Transparent/Unchanged)
    // Tint * DST = Tinted DST
    COLOR.rgb = mix(vec3(1.0), COLOR.rgb, tex.a * COLOR.a);
    COLOR.a = 1.0; // Force alpha to 1 so blend mode multiplies fully
}
