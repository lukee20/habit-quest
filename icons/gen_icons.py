#!/usr/bin/env python3
"""Generate Habit Quest PWA icons with no third-party dependencies.

Draws a rounded-square gradient tile with a white check mark and writes
icon-192.png and icon-512.png next to this script.
"""
import math
import os
import struct
import zlib

OUT_DIR = os.path.dirname(os.path.abspath(__file__))

# Brand colours
C1 = (139, 92, 246)   # #8b5cf6 purple
C2 = (244, 114, 182)  # #f472b6 pink
WHITE = (255, 255, 255)


def lerp(a, b, t):
    return a + (b - a) * t


def dist_seg(px, py, ax, ay, bx, by):
    """Distance from point (px,py) to segment (ax,ay)-(bx,by)."""
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return math.hypot(px - ax, py - ay)
    t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)
    t = max(0.0, min(1.0, t))
    cx, cy = ax + t * dx, ay + t * dy
    return math.hypot(px - cx, py - cy)


def render(size, ss=4):
    """Render an RGBA image at `size` using supersampling factor ss."""
    w = h = size
    # Supersampled work buffer
    W = w * ss
    H = h * ss
    radius = 0.22 * W
    # checker coordinates (fractions of tile)
    p1 = (0.30 * W, 0.53 * H)
    p2 = (0.44 * W, 0.66 * H)
    p3 = (0.72 * W, 0.38 * H)
    stroke = 0.085 * W
    half = stroke / 2.0

    # accumulate downsampled RGBA
    out = bytearray(w * h * 4)

    for y in range(h):
        for x in range(w):
            r_acc = g_acc = b_acc = a_acc = 0
            for sy in range(ss):
                for sx in range(ss):
                    px = x * ss + sx + 0.5
                    py = y * ss + sy + 0.5
                    # rounded-rect mask (distance to inner rect)
                    cx = min(max(px, radius), W - radius)
                    cy = min(max(py, radius), H - radius)
                    inside = (px - cx) ** 2 + (py - cy) ** 2 <= radius * radius
                    if not inside:
                        continue
                    # gradient background
                    t = min(1.0, max(0.0, (px / W) * 0.55 + (py / H) * 0.45))
                    r = int(lerp(C1[0], C2[0], t))
                    g = int(lerp(C1[1], C2[1], t))
                    b = int(lerp(C1[2], C2[2], t))
                    # check mark overlay
                    d = min(
                        dist_seg(px, py, p1[0], p1[1], p2[0], p2[1]),
                        dist_seg(px, py, p2[0], p2[1], p3[0], p3[1]),
                    )
                    if d <= half and d >= 0:
                        # fade edge slightly for anti-aliasing
                        edge = half - d
                        if edge > ss * 0.75:
                            r, g, b = WHITE
                        else:
                            mix = max(0.0, min(1.0, edge / (ss * 0.75)))
                            r = int(lerp(r, WHITE[0], mix))
                            g = int(lerp(g, WHITE[1], mix))
                            b = int(lerp(b, WHITE[2], mix))
                    r_acc += r
                    g_acc += g
                    b_acc += b
                    a_acc += 255
            n = ss * ss
            idx = (y * w + x) * 4
            if a_acc == 0:
                out[idx:idx + 4] = bytes((0, 0, 0, 0))
            else:
                # average only over covered samples for colour, alpha over all
                covered = max(1, round(a_acc / 255))
                out[idx] = r_acc // covered
                out[idx + 1] = g_acc // covered
                out[idx + 2] = b_acc // covered
                out[idx + 3] = a_acc // n
    return bytes(out)


def write_png(path, width, height, rgba):
    def chunk(typ, data):
        return (struct.pack('>I', len(data)) + typ + data +
                struct.pack('>I', zlib.crc32(typ + data) & 0xFFFFFFFF))

    stride = width * 4
    raw = bytearray()
    for y in range(height):
        raw.append(0)  # filter type 0
        raw.extend(rgba[y * stride:(y + 1) * stride])
    comp = zlib.compress(bytes(raw), 9)
    ihdr = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)  # 8-bit RGBA
    data = (b'\x89PNG\r\n\x1a\n' +
            chunk(b'IHDR', ihdr) +
            chunk(b'IDAT', comp) +
            chunk(b'IEND', b''))
    with open(path, 'wb') as f:
        f.write(data)


def main():
    for size in (192, 512):
        px = render(size, ss=4 if size <= 192 else 3)
        path = os.path.join(OUT_DIR, 'icon-%d.png' % size)
        write_png(path, size, size, px)
        print('wrote', path, '(%d bytes)' % os.path.getsize(path))


if __name__ == '__main__':
    main()
