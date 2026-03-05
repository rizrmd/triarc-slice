shader_type canvas_item;
render_mode unshaded, blend_premul_alpha;

uniform sampler2D mask_texture : filter_linear_mipmap;
uniform vec2 mask_origin;
uniform vec2 mask_size;

void fragment() {
    vec2 uv = (FRAGCOORD.xy - mask_origin) / mask_size;
    vec4 main_color = texture(TEXTURE, UV);
    vec4 mask_color = texture(mask_texture, uv);
    float alpha_factor = 1.0 - mask_color.a;
    float out_a = main_color.a * alpha_factor;
    COLOR.a = out_a;
    COLOR.rgb = main_color.rgb * out_a;
}
