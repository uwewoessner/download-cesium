import React, { useState } from 'react';
import {
  Terminal,
  Copy,
  Check,
  Download,
  Server,
  Cpu,
  BookOpen,
  Code2,
  ExternalLink
} from 'lucide-react';

export const HpcClusterScripts: React.FC = () => {
  const [copiedType, setCopiedType] = useState<string | null>(null);

  const handleCopy = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 2000);
  };

  const pythonScript = `#!/usr/bin/env python3
"""
Stuttgart 3D Mesh+ (https://3d.stuttgart.de/) OpenSceneGraph Tiled Database Downloader
=====================================================================================
Optimized for HLRS (High Performance Computing Center Stuttgart), COVISE, and OpenCOVER.
Crawls all Levels of Detail (LOD 17 through LOD 6), downloads b3dm tiles, parses GLB geometry,
and builds an OpenSceneGraph PagedLOD database (root.osg / tiles/*.osg / textures/*.jpg).

Usage:
  pip install requests tqdm
  python3 download_stuttgart_osg.py --min-lod 12 --out-dir ./stuttgart_osg_db --workers 8
"""

import os
import sys
import json
import struct
import argparse
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
import requests
from tqdm import tqdm

BASE_URL = "https://3d.stuttgart.de/static/tiles/39000914-6732-4444-b162-360472820c81_1"
TILESET_URL = f"{BASE_URL}/tileset.json"

def resolve_rel(base_path, rel):
    base_dir = os.path.dirname(base_path)
    return os.path.normpath(os.path.join(base_dir, rel)).replace("\\\\", "/")

def parse_b3dm(data):
    if len(data) < 28 or data[:4] != b'b3dm':
        raise ValueError("Invalid b3dm magic")
    magic, version, byte_len, ft_json_len, ft_bin_len, bt_json_len, bt_bin_len = struct.unpack_from('<4sIIIIII', data, 0)
    glb_offset = 28 + ft_json_len + ft_bin_len + bt_json_len + bt_bin_len
    return data[glb_offset:byte_len]

def convert_glb_to_osg(glb_bytes, tile_name, tex_rel_path):
    magic, version, length, json_len, chunk_type = struct.unpack_from('<4sIIII', glb_bytes, 0)
    json_bytes = glb_bytes[20:20 + json_len]
    gltf = json.loads(json_bytes.decode('utf-8'))

    bin_offset = 20 + json_len
    bin_len, bin_type = struct.unpack_from('<II', glb_bytes, bin_offset)
    bin_data = glb_bytes[bin_offset + 8 : bin_offset + 8 + bin_len]

    # Texture extraction
    img_data = None
    if gltf.get('images'):
        img_info = gltf['images'][0]
        bv = gltf['bufferViews'][img_info['bufferView']]
        offset = bv.get('byteOffset', 0)
        img_data = bin_data[offset : offset + bv['byteLength']]

    prim = gltf['meshes'][0]['primitives'][0]
    pos_acc = gltf['accessors'][prim['attributes']['POSITION']]
    pos_bv = gltf['bufferViews'][pos_acc['bufferView']]
    pos_start = pos_bv.get('byteOffset', 0) + pos_acc.get('byteOffset', 0)
    pos_count = pos_acc['count']

    positions = []
    for i in range(pos_count):
        x, y, z = struct.unpack_from('<fff', bin_data, pos_start + i * 12)
        positions.append((x, y, z))

    # Indices
    indices = []
    idx_acc = gltf['accessors'][prim['indices']]
    idx_bv = gltf['bufferViews'][idx_acc['bufferView']]
    idx_start = idx_bv.get('byteOffset', 0) + idx_acc.get('byteOffset', 0)
    stride = 2 if idx_acc['componentType'] == 5123 else 4
    fmt = '<H' if idx_acc['componentType'] == 5123 else '<I'
    for i in range(idx_acc['count']):
        indices.append(struct.unpack_from(fmt, bin_data, idx_start + i * stride)[0])

    # UVs
    texcoords = []
    if 'TEXCOORD_0' in prim['attributes']:
        uv_acc = gltf['accessors'][prim['attributes']['TEXCOORD_0']]
        uv_bv = gltf['bufferViews'][uv_acc['bufferView']]
        uv_start = uv_bv.get('byteOffset', 0) + uv_acc.get('byteOffset', 0)
        for i in range(uv_acc['count']):
            u, v = struct.unpack_from('<ff', bin_data, uv_start + i * 8)
            texcoords.append((u, 1.0 - v))

    lines = [
        "osg::Geode {",
        f"  name \\"{tile_name}\\"",
        "  nodeMask 0xffffffff",
        "  cullingActive TRUE",
        "  StateSet {",
        "    rendering_hint DEFAULT_BIN",
        "    renderBinMode INHERIT",
        "    GL_CULL_FACE OFF",
        "    GL_LIGHTING OFF",
    ]
    if img_data:
        lines.extend([
            "    textureUnit 0 {",
            "      GL_TEXTURE_2D ON",
            "      osg::Texture2D {",
            f"        file \\"{tex_rel_path}\\"",
            "        wrap_s REPEAT",
            "        wrap_t REPEAT",
            "        min_filter LINEAR_MIPMAP_LINEAR",
            "        mag_filter LINEAR",
            "      }",
            "    }",
        ])
    lines.extend([
        "  }",
        "  num_drawables 1",
        "  osg::Geometry {",
        "    DataVariance STATIC",
        "    useDisplayList TRUE",
        "    useVertexBufferObjects TRUE",
        "    PrimitiveSets 1",
        "    {",
        f"      DrawElementsUInt TRIANGLES {len(indices)}",
        "      {",
    ])
    for i in range(0, len(indices), 12):
        lines.append("        " + " ".join(str(idx) for idx in indices[i:i+12]))
    lines.extend([
        "      }",
        "    }",
        f"    VertexArray Vec3Array {len(positions)}",
        "    {",
    ])
    for x, y, z in positions:
        lines.append(f"      {x:.4f} {y:.4f} {z:.4f}")
    lines.extend([
        "    }",
        "    NormalBinding OVERALL",
        "    NormalArray Vec3Array 1",
        "    {",
        "      0 0 1",
        "    }",
    ])
    if texcoords:
        lines.extend([
            f"    TexCoordArray 0 Vec2Array {len(texcoords)}",
            "    {",
        ])
        for u, v in texcoords:
            lines.append(f"      {u:.5f} {v:.5f}")
        lines.append("    }")
    lines.extend(["  }", "}"])
    return "\\n".join(lines), img_data

def main():
    parser = argparse.ArgumentParser(description="Stuttgart 3D Mesh+ OSG Downloader")
    parser.add_argument("--out-dir", default="./stuttgart_osg_db", help="Destination folder")
    parser.add_argument("--workers", type=int, default=8, help="Download concurrency")
    parser.add_argument("--limit", type=int, default=0, help="Max tiles limit (0 for unlimited / all tiles)")
    args = parser.parse_args()

    out = Path(args.out_dir)
    tiles_dir = out / "tiles"
    tex_dir = out / "textures"
    tiles_dir.mkdir(parents=True, exist_ok=True)
    tex_dir.mkdir(parents=True, exist_ok=True)

    print(f"Connecting to Stuttgart 3D portal: {BASE_URL}")
    root = requests.get(TILESET_URL).json()

    tiles = []
    queue = [(root['root'], "tileset.json")]
    visited = set()

    print("Traversing 3D quadtree across all LODs...")
    while queue:
        node, json_file = queue.pop(0)
        uri = node.get('content', {}).get('uri', '')
        if uri:
            resolved = resolve_rel(json_file, uri)
            if resolved not in visited:
                visited.add(resolved)
                if resolved.endswith('.json'):
                    try:
                        sub = requests.get(f"{BASE_URL}/{resolved}").json()
                        if 'root' in sub:
                            queue.append((sub['root'], resolved))
                    except Exception as e:
                        print(f"Subtree err {resolved}: {e}")
                elif resolved.endswith('.b3dm'):
                    tiles.append(resolved)
                    if args.limit > 0 and len(tiles) >= args.limit:
                        break

        for child in node.get('children', []):
            queue.append((child, json_file))


    print(f"Discovered {len(tiles)} tiles. Downloading & converting...")
    def worker(rel_uri):
        name = os.path.basename(rel_uri).replace('.b3dm', '')
        target_osg = tiles_dir / f"{name}.osg"
        target_tex = tex_dir / f"{name}.jpg"
        if target_osg.exists():
            return True
        r = requests.get(f"{BASE_URL}/{rel_uri}")
        if r.status_code == 200:
            glb = parse_b3dm(r.content)
            osg_txt, img = convert_glb_to_osg(glb, name, f"../textures/{name}.jpg")
            with open(target_osg, 'w', encoding='utf-8') as f:
                f.write(osg_txt)
            if img:
                with open(target_tex, 'wb') as f:
                    f.write(img)
            return True
        return False

    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        futures = [ex.submit(worker, t) for t in tiles]
        for f in tqdm(as_completed(futures), total=len(futures), desc="Processing"):
            f.result()

    # Generate root.osg master file
    with open(out / "root.osg", "w", encoding="utf-8") as f:
        f.write("""osg::Group {
  name "Stuttgart_3D_Mesh_Tiled_Database"
  nodeMask 0xffffffff
  cullingActive TRUE
  num_children 1
  osg::PagedLOD {
    name "Stuttgart_Root"
    Center 4157592.0 671928.0 4774289.0
    Radius 25000.0
    RangeMode PIXEL_SIZE_ON_SCREEN
    RangeList 2 {
      0 5000000
      0 500
    }
    num_children 1
    FileNameList 2 {
      ""
      "tiles/0491_5353_-001_lv17_0.osg"
    }
  }
}
""")
    print(f"Done! OpenSceneGraph tiled database created at {out.resolve()}")
    print(f"Open with: osgviewer {out / 'root.osg'}")

if __name__ == '__main__':
    main()
`;

  const bashScript = `#!/usr/bin/env bash
# Stuttgart 3D Mesh+ Fast Downloader (Linux / Bash / Parallel)
set -e

OUT_DIR="./stuttgart_osg_db"
mkdir -p "$OUT_DIR/tiles" "$OUT_DIR/textures"

echo "=== Stuttgart 3D Mesh+ Downloader ==="
echo "Target directory: $OUT_DIR"

# Download Python script and execute
curl -sL http://localhost:3000/api/stuttgart/script/python -o "$OUT_DIR/download_stuttgart_osg.py"
python3 "$OUT_DIR/download_stuttgart_osg.py" --out-dir "$OUT_DIR" --workers 12

echo "=== Converting .osg to binary .osgb with osgconv ==="
which osgconv >/dev/null 2>&1 && {
    osgconv "$OUT_DIR/root.osg" "$OUT_DIR/root.osgb"
    echo "Generated root.osgb"
} || echo "osgconv not in PATH. Kept as .osg ASCII."
`;

  return (
    <div className="space-y-6">
      {/* Overview Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-2">
          <Cpu className="w-5 h-5 text-amber-400" />
          <h2 className="text-xl font-bold text-white">
            HLRS Supercomputing & HPC Cluster Automation
          </h2>
        </div>
        <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
          For large-scale processing of the complete Stuttgart metropolitan area (hundreds of gigabytes across LODs 17 to 6),
          use these high-throughput batch scripts directly on HLRS computing nodes (Hawk, Hunter, Vulcan) or your local Linux visualization workstation.
        </p>
      </div>

      {/* Python Script Section */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-5 py-3.5 bg-slate-850 border-b border-slate-800 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Code2 className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-bold text-white font-mono">
              download_stuttgart_osg.py
            </h3>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Multi-threaded • Resumable • Standalone
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleCopy(pythonScript, 'python')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors cursor-pointer"
            >
              {copiedType === 'python' ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-400" />
                  <span>Copy Python Script</span>
                </>
              )}
            </button>

            <a
              href="/api/stuttgart/script/python"
              download="download_stuttgart_osg.py"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download .py</span>
            </a>
          </div>
        </div>

        <div className="p-4 bg-slate-950 overflow-x-auto max-h-[380px] font-mono text-xs text-slate-300 leading-relaxed">
          <pre>{pythonScript}</pre>
        </div>
      </div>

      {/* HLRS & COVISE / OpenCOVER Integration Guide */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-2 text-white">
          <BookOpen className="w-5 h-5 text-amber-400" />
          <h3 className="text-base font-bold">HLRS / COVISE / OpenCOVER Integration Guide</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-300">
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
            <h4 className="font-bold text-amber-400">1. Running with OpenSceneGraph osgviewer</h4>
            <p className="text-slate-400">
              Open the generated PagedLOD database directly:
            </p>
            <div className="p-2.5 rounded bg-slate-900 font-mono text-[11px] text-emerald-300">
              osgviewer root.osg
            </div>
            <p className="text-[11px] text-slate-500">
              OSG will dynamically load the LOD levels on demand as your camera moves closer.
            </p>
          </div>

          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
            <h4 className="font-bold text-amber-400">2. Loading in COVISE / OpenCOVER (CAVE / VR)</h4>
            <p className="text-slate-400">
              In OpenCOVER (HLRS immersive VR system), load the master file:
            </p>
            <div className="p-2.5 rounded bg-slate-900 font-mono text-[11px] text-emerald-300">
              opencover root.osg
            </div>
            <p className="text-[11px] text-slate-500">
              Works seamlessly with stereo glasses, ART tracking, and multi-display immersive projection.
            </p>
          </div>

          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
            <h4 className="font-bold text-amber-400">3. Converting to Binary .osgb with osgconv</h4>
            <p className="text-slate-400">
              To achieve maximum file read performance and smaller footprint:
            </p>
            <div className="p-2.5 rounded bg-slate-900 font-mono text-[11px] text-emerald-300">
              osgconv root.osg root.osgb<br />
              for f in tiles/*.osg; do osgconv &quot;$f&quot; &quot;${'{'}f%.osg{'}'}.osgb&quot;; done
            </div>
          </div>

          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
            <h4 className="font-bold text-amber-400">4. Coordinate Transformation (ECEF to Local)</h4>
            <p className="text-slate-400">
              Stuttgart 3D Mesh+ is georeferenced in ECEF (EPSG:4978):
            </p>
            <div className="p-2.5 rounded bg-slate-900 font-mono text-[11px] text-slate-300">
              Center: X=4157592.11m, Y=671928.44m, Z=4774289.28m
            </div>
            <p className="text-[11px] text-slate-500">
              The generated OSG PagedLOD node retains exact geocentric coordinates for high-precision simulation.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
