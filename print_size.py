import sys
from PIL import Image

try:
    with Image.open(sys.argv[1]) as img:
        print(f"{img.width}x{img.height}")
except Exception as e:
    print(f"Error: {e}")
