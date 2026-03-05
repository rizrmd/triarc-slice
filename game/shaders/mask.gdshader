shader_type canvas_item;

uniform sampler2D mask_texture : filter_linear_mipmap;

void fragment() {
    vec4 main_color = texture(TEXTURE, UV);
    vec4 mask_color = texture(mask_texture, UV);
    
    // destination-out emulation
    // Keep main_color where mask_color is transparent.
    // If mask is opaque (drawn), it erases the main content.
    COLOR = main_color;
    COLOR.a = main_color.a * (1.0 - mask_color.a);
}
