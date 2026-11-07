#!/usr/bin/env python3
"""V46 crystal apex atlas, offline from the EXACT facet-normal bitmap.

Input: 720x406 'assets/crystal_facet_normals_v16.webp' (unmodified).
Output: matching 720x406 *lossless* WebP RGB data map:
  R = clamp(0.5 + (pixel_x - nearest_apex_x) / (0.24*width), 0..1)
  G = clamp(0.5 + (nearest_apex_y - pixel_y) / (0.24*height), 0..1)
  B = deterministic 0..1 phase per Voronoi region
The y direction is up in UV space because WebGL uploads with UNPACK_FLIP_Y_WEBGL.
No geometric remapping/cropping. The two maps share coverUV in the shader.

Install: python -m pip install pillow numpy scipy opencv-python
Run:
  python tools/bake_apex.py --normals assets/crystal_facet_normals_v16.webp \
      --out assets/crystal_facet_apex_v1.webp \
      --overlay crystal_facet_apex_alignment.png
"""
import argparse
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw
from scipy.spatial import cKDTree


def _color_groups(rgb, x, y, radius=10, tolerance=54):
    """Number of visibly different face colors on a 16-direction small ring."""
    h, w = rgb.shape[:2]
    groups = []
    for angle in np.linspace(0, 2*np.pi, 16, endpoint=False):
        xx = int(np.clip(round(x + radius * np.cos(angle)), 0, w-1))
        yy = int(np.clip(round(y + radius * np.sin(angle)), 0, h-1))
        color = rgb[yy, xx].astype(np.float32)
        if not groups or min(np.linalg.norm(color - c) for c in groups) > tolerance:
            groups.append(color)
    return len(groups)


def _boundary_candidates(median):
    h, w = median.shape[:2]
    result = []
    for edge in ('top', 'bottom', 'left', 'right'):
        horizontal = edge in ('top', 'bottom')
        x0 = 0 if edge == 'left' else w-1
        y0 = 0 if edge == 'top' else h-1
        samples = median[y0, :, :] if horizontal else median[:, x0, :]
        # Detect two distinct face colors across the canvas border. Each
        # boundary crossing is one apex, not every compressed edge pixel.
        diff = np.linalg.norm(samples[8:].astype(float)-samples[:-8].astype(float), axis=1)
        indices = np.where(diff > 43)[0]
        for run in np.split(indices, np.where(np.diff(indices) > 1)[0] + 1):
            if len(run) < 2:
                continue
            position = float((run[0] + run[-1]) / 2 + 4)
            if horizontal:
                result.append((position, float(y0)))
            else:
                result.append((float(x0), position))
    return result


def _merge_points(points, radius=14.5):
    points = np.asarray(points, dtype=np.float32)
    if len(points) == 0:
        return []
    tree = cKDTree(points)
    pairs = tree.query_pairs(radius)
    parents = list(range(len(points)))

    def root(i):
        while parents[i] != i:
            parents[i] = parents[parents[i]]
            i = parents[i]
        return i

    for a, b in pairs:
        ra, rb = root(a), root(b)
        if ra != rb:
            parents[rb] = ra
    groups = {}
    for i, p in enumerate(points):
        groups.setdefault(root(i), []).append(p)
    return [np.median(g, axis=0).astype(float) for g in groups.values()]


def detect_apices(image):
    """Harris corner proposals, local >=3 face intersection, edge >=2.

    Candidate clustering removes the multiple adjacent corner responses at a
    single triangle vertex. The 720x406 compressed normal map has smooth
    flat-colored triangular faces and only slightly softened boundaries.
    """
    rgb = np.asarray(image.convert('RGB'))
    h, w = rgb.shape[:2]
    median = cv2.medianBlur(rgb, 5)
    proposals = []
    for block in (5, 7, 11):
        for channel in range(3):
            pts = cv2.goodFeaturesToTrack(
                median[:, :, channel], maxCorners=190, qualityLevel=.006,
                minDistance=9, blockSize=block,
                useHarrisDetector=True, k=.04)
            if pts is not None:
                proposals.extend(tuple(map(float, p)) for p in pts.reshape(-1, 2))
    proposals.extend(_boundary_candidates(median))
    # Filter BEFORE merging: color sectors ensure the anchors are real
    # face intersections instead of arbitrary points along an edge.
    valid = []
    for x, y in proposals:
        on_border = min(x, y, w-1-x, h-1-y) <= 7
        count = _color_groups(median, x, y, radius=10, tolerance=52)
        if count >= (2 if on_border else 3):
            valid.append((x, y))
    combined = _merge_points(valid, 14.5)
    corrected = []
    for x, y in combined:
        # Boundary intersections are clamped to the ACTUAL image edge.
        if x < 8: x = 0.
        if x > w-9: x = float(w-1)
        if y < 8: y = 0.
        if y > h-9: y = float(h-1)
        corrected.append((float(x), float(y)))
    # Re-merge after boundary snapping and order deterministically.
    return sorted(_merge_points(corrected, 8.5), key=lambda p: (p[1], p[0]))


def encode_apex(image, points):
    w, h = image.size
    yy, xx = np.indices((h, w), dtype=np.float32)
    uv = np.column_stack((xx.ravel() / w, yy.ravel() / h))
    locations = np.asarray(points, dtype=np.float32)
    if not len(locations):
        raise RuntimeError('No facet apices found; image or threshold mismatch')
    apex_uv = locations / np.asarray([w, h], dtype=np.float32)
    _, ids = cKDTree(apex_uv).query(uv, k=1, workers=-1)
    nearest = locations[ids]
    dx = (uv[:, 0] - nearest[:, 0] / w)
    dy = (nearest[:, 1] / h - uv[:, 1])  # upward in shader UV space
    r = np.clip(0.5 + dx / 0.24, 0, 1)
    g = np.clip(0.5 + dy / 0.24, 0, 1)
    # Stable, per-apex pseudo-random phase. Same B throughout one region.
    i = np.arange(len(points), dtype=np.uint32)
    key = (np.round(locations[:, 0]*17).astype(np.uint32) * np.uint32(0x45d9f3b)
          ^ np.round(locations[:, 1]*31).astype(np.uint32) * np.uint32(0x27d4eb2d)
          ^ i * np.uint32(0x9e3779b9))
    key ^= key >> np.uint32(16)
    key *= np.uint32(0x7feb352d)
    key ^= key >> np.uint32(15)
    phases = (key % np.uint32(256)).astype(np.uint8)
    rgb = np.column_stack((np.round(r*255), np.round(g*255), phases[ids]))
    return Image.fromarray(rgb.reshape((h, w, 3)).astype(np.uint8), 'RGB')


def alignment_overlay(normals, points, dest):
    canvas = normals.convert('RGB').copy()
    draw = ImageDraw.Draw(canvas)
    for x, y in points:
        # Small red markers (same debug color used by ?apex=1).
        draw.ellipse((x-2.7, y-2.7, x+2.7, y+2.7),
                     fill=(246, 19, 40), outline=(255, 240, 217), width=1)
    canvas.save(dest)


def main():
    parser = argparse.ArgumentParser(description='Bake V46 crystal-facet apex map')
    parser.add_argument('--normals', default='assets/crystal_facet_normals_v16.webp')
    parser.add_argument('--out', default='assets/crystal_facet_apex_v1.webp')
    parser.add_argument('--overlay', default='crystal_facet_apex_alignment.png')
    args = parser.parse_args()
    normals = Image.open(args.normals).convert('RGB')
    if normals.size != (720, 406):
        raise ValueError(f'Expected 720x406 original facet normals; got {normals.size}')
    points = detect_apices(normals)
    apex = encode_apex(normals, points)
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.overlay).parent.mkdir(parents=True, exist_ok=True)
    apex.save(args.out, format='WEBP', lossless=True, method=6)
    alignment_overlay(normals, points, args.overlay)
    print(f'Baked {len(points)} unique apices; atlas {apex.width}x{apex.height}; ' \
          f'output {args.out}; debug overlay {args.overlay}')


if __name__ == '__main__':
    main()
