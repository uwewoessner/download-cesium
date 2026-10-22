import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const STUTTGART_BASE = 'https://3d.stuttgart.de';
const MESH_TILESET_URL = `${STUTTGART_BASE}/static/tiles/39000914-6732-4444-b162-360472820c81_1`;

app.use(express.json({ limit: '50mb' }));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'stuttgart-osg-downloader' });
});

// Fetch portal config
app.get('/api/stuttgart/config', async (req, res) => {
  try {
    const configUrl = `${STUTTGART_BASE}/api/v2/viewer/view/9370ae24-2f03-4921-9ad8-4fc0bc79326f/config`;
    const response = await fetch(configUrl);
    if (!response.ok) {
      return res.status(response.status).json({ error: `Failed to fetch Stuttgart config: ${response.statusText}` });
    }
    const data = await response.json();
    
    // Extract mesh layer details
    let meshLayer = null;
    try {
      const meshGroup = data.layergroup?.layergroups?.[0]?.layergroups?.[1];
      meshLayer = meshGroup?.layergroups?.[0]?.layers?.[0];
    } catch {
      // fallback
    }

    res.json({
      portalUrl: STUTTGART_BASE,
      viewId: '9370ae24-2f03-4921-9ad8-4fc0bc79326f',
      meshLayer: meshLayer || {
        id: '39000914-6732-4444-b162-360472820c81_1',
        name: 'Meshmodell_2025',
        type: 'cesium_tiles',
        revision: '2025-12-04 14:54:16 UTC',
      },
      tilesetBaseUrl: MESH_TILESET_URL,
      rootTilesetUrl: `${MESH_TILESET_URL}/tileset.json`,
      attribution: 'Landeshauptstadt Stuttgart - Stadtmessungsamt',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Proxy root tileset
app.get('/api/stuttgart/tileset', async (req, res) => {
  try {
    const response = await fetch(`${MESH_TILESET_URL}/tileset.json`);
    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to fetch tileset.json' });
    }
    const data = await response.json();
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// General proxy for sub-tilesets and b3dm
app.get('/api/stuttgart/proxy/*', async (req, res) => {
  try {
    const relativePath = (req.params as any)[0];
    if (!relativePath) {
      return res.status(400).json({ error: 'Path is required' });
    }

    const targetUrl = `${MESH_TILESET_URL}/${relativePath}`;
    const response = await fetch(targetUrl);
    if (!response.ok) {
      return res.status(response.status).send(`Failed to fetch from ${targetUrl}: ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=86400');

    const arrayBuffer = await response.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Crawl tileset hierarchy up to target LOD
interface TileManifestItem {
  id: string;
  lod: number;
  lodName: string;
  uri: string;
  fullUri: string;
  geometricError: number;
  boundingVolume: any;
  hasChildren: boolean;
  childUris: string[];
}

app.post('/api/stuttgart/crawl', async (req, res) => {
  const { maxDepth = 25, maxTiles = 3000, crawlAll = false } = req.body;

  try {
    const tiles: TileManifestItem[] = [];
    const visitedUris = new Set<string>();
    const visitedJsons = new Set<string>();

    function extractLod(uri: string, fallback: number): number {
      const match = uri.match(/lv(\d+)/i) || uri.match(/L(\d+)/i);
      return match ? parseInt(match[1], 10) : fallback;
    }

    function resolveRelative(jsonPath: string, relative: string): string {
      if (!jsonPath) return relative;
      const parts = jsonPath.split('/');
      parts.pop(); // remove json file name
      for (const segment of relative.split('/')) {
        if (segment === '.' || segment === '') continue;
        if (segment === '..') {
          parts.pop();
        } else {
          parts.push(segment);
        }
      }
      return parts.join('/');
    }

    // 1. Fetch root tileset
    const rootRes = await fetch(`${MESH_TILESET_URL}/tileset.json`);
    const rootJson = await rootRes.json();

    const subJsonQueue: string[] = [];

    // Helper to walk a JSON's root node in-memory
    function walkNode(node: any, jsonPath: string, depth: number) {
      if (!node) return;
      const uri = node.content?.uri || '';
      if (uri) {
        const resolvedUri = resolveRelative(jsonPath, uri);
        if (resolvedUri.endsWith('.json')) {
          if (!visitedJsons.has(resolvedUri)) {
            visitedJsons.add(resolvedUri);
            subJsonQueue.push(resolvedUri);
          }
        } else if (resolvedUri.endsWith('.b3dm')) {
          if (!visitedUris.has(resolvedUri)) {
            visitedUris.add(resolvedUri);
            const lodNum = extractLod(resolvedUri, 17 - depth);
            tiles.push({
              id: `tile_${tiles.length + 1}`,
              lod: lodNum,
              lodName: `LOD ${lodNum}`,
              uri: resolvedUri,
              fullUri: `${MESH_TILESET_URL}/${resolvedUri}`,
              geometricError: node.geometricError || 0,
              boundingVolume: node.boundingVolume,
              hasChildren: Array.isArray(node.children) && node.children.length > 0,
              childUris: (node.children || [])
                .map((c: any) => c.content?.uri ? resolveRelative(jsonPath, c.content.uri) : '')
                .filter(Boolean),
            });
          }
        }
      }

      if (Array.isArray(node.children) && depth < maxDepth) {
        for (const child of node.children) {
          walkNode(child, jsonPath, depth + 1);
        }
      }
    }

    // Walk the root tileset
    walkNode(rootJson.root, 'tileset.json', 0);

    // Fetch and walk discovered sub-JSONs in concurrent batches
    const effectiveLimit = crawlAll ? 10000 : maxTiles;
    const concurrency = 12;

    while (subJsonQueue.length > 0 && tiles.length < effectiveLimit) {
      const batch = subJsonQueue.splice(0, concurrency);
      await Promise.all(
        batch.map(async (subUri) => {
          try {
            const subRes = await fetch(`${MESH_TILESET_URL}/${subUri}`);
            if (subRes.ok) {
              const subJson = await subRes.json();
              if (subJson.root) {
                walkNode(subJson.root, subUri, 1);
              }
            }
          } catch {
            // ignore network transient failures
          }
        })
      );
    }

    // Group summary by LOD
    const lodCounts: Record<number, number> = {};
    for (const t of tiles) {
      lodCounts[t.lod] = (lodCounts[t.lod] || 0) + 1;
    }

    res.json({
      success: true,
      totalDiscovered: tiles.length,
      lodSummary: lodCounts,
      tiles,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Standalone Python download script with PrimitiveSets and robust resolution
app.get('/api/stuttgart/script/python', (req, res) => {
  const pythonScript = `#!/usr/bin/env python3
"""
Stuttgart 3D Mesh+ (https://3d.stuttgart.de/) OpenSceneGraph Tiled Database Downloader
=====================================================================================
Optimized for HLRS (High Performance Computing Center Stuttgart), COVISE, and OpenCOVER.
Crawls all Levels of Detail (LOD 17 through LOD 1), downloads .b3dm tiles, parses GLB geometry,
and builds an OpenSceneGraph PagedLOD database (root.osg / all_tiles.osg / tiles/*.osg / textures/*.jpg).

Usage:
  pip install requests tqdm
  python3 download_stuttgart_osg.py --out-dir ./stuttgart_osg_db --workers 8
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

def resolve_rel(json_file, rel_path):
    base_dir = os.path.dirname(json_file)
    return os.path.normpath(os.path.join(base_dir, rel_path)).replace("\\\\", "/")

def parse_b3dm(b3dm_bytes):
    if len(b3dm_bytes) < 28 or b3dm_bytes[:4] != b'b3dm':
        raise ValueError("Invalid b3dm header")
    magic, version, byte_length, ft_json_len, ft_bin_len, bt_json_len, bt_bin_len = struct.unpack_from('<4sIIIIII', b3dm_bytes, 0)
    glb_offset = 28 + ft_json_len + ft_bin_len + bt_json_len + bt_bin_len
    return b3dm_bytes[glb_offset:byte_length]

def convert_glb_to_osg(glb_bytes, tile_name, texture_rel_path):
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

    # Read positions
    positions = []
    for i in range(pos_count):
        x, y, z = struct.unpack_from('<fff', bin_data, pos_start + i * 12)
        positions.append((x, y, z))

    # Read indices
    indices = []
    idx_acc = gltf['accessors'][prim['indices']]
    idx_bv = gltf['bufferViews'][idx_acc['bufferView']]
    idx_start = idx_bv.get('byteOffset', 0) + idx_acc.get('byteOffset', 0)
    idx_count = idx_acc['count']
    idx_fmt = '<H' if idx_acc['componentType'] == 5123 else '<I'
    stride = 2 if idx_acc['componentType'] == 5123 else 4
    for i in range(idx_count):
        idx_val = struct.unpack_from(idx_fmt, bin_data, idx_start + i * stride)[0]
        indices.append(idx_val)

    # Read UV texcoords
    texcoords = []
    if 'TEXCOORD_0' in prim['attributes']:
        uv_acc = gltf['accessors'][prim['attributes']['TEXCOORD_0']]
        uv_bv = gltf['bufferViews'][uv_acc['bufferView']]
        uv_start = uv_bv.get('byteOffset', 0) + uv_acc.get('byteOffset', 0)
        for i in range(uv_acc['count']):
            u, v = struct.unpack_from('<ff', bin_data, uv_start + i * 8)
            texcoords.append((u, 1.0 - v))

    # Build OpenSceneGraph (.osg) ASCII text with PrimitiveSets
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
            f"        file \\"{texture_rel_path}\\"",
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
        chunk = " ".join(str(idx) for idx in indices[i:i+12])
        lines.append(f"        {chunk}")
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
    parser = argparse.ArgumentParser(description="Download Stuttgart 3D Mesh+ into OpenSceneGraph Tiled Database")
    parser.add_argument("--out-dir", default="./stuttgart_osg_db", help="Target directory")
    parser.add_argument("--workers", type=int, default=8, help="Number of concurrent download threads")
    parser.add_argument("--limit", type=int, default=0, help="Optional max tiles limit (0 for unlimited / all tiles)")
    args = parser.parse_args()

    out_path = Path(args.out_dir)
    tiles_dir = out_path / "tiles"
    tex_dir = out_path / "textures"
    tiles_dir.mkdir(parents=True, exist_ok=True)
    tex_dir.mkdir(parents=True, exist_ok=True)

    print("Fetching Stuttgart 3D Mesh+ root tileset...")
    root = requests.get(TILESET_URL).json()

    print("Crawling quadtree LOD hierarchy across all tiles...")
    tiles_to_download = []
    queue = [(root['root'], "tileset.json")]
    visited = set()

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
                        print(f"Error fetching sub-tileset {resolved}: {e}")
                elif resolved.endswith('.b3dm'):
                    tiles_to_download.append(resolved)
                    if args.limit > 0 and len(tiles_to_download) >= args.limit:
                        break

        for child in node.get('children', []):
            queue.append((child, json_file))

    print(f"Discovered {len(tiles_to_download)} mesh tiles.")

    def process_tile(uri):
        clean_name = os.path.basename(uri).replace('.b3dm', '')
        osg_file = tiles_dir / f"{clean_name}.osg"
        tex_file = tex_dir / f"{clean_name}.jpg"
        if osg_file.exists():
            return True

        resp = requests.get(f"{BASE_URL}/{uri}")
        if resp.status_code == 200:
            glb = parse_b3dm(resp.content)
            osg_text, img = convert_glb_to_osg(glb, clean_name, f"../textures/{clean_name}.jpg")
            with open(osg_file, 'w', encoding='utf-8') as f:
                f.write(osg_text)
            if img:
                with open(tex_file, 'wb') as f:
                    f.write(img)
            return True
        return False

    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = [executor.submit(process_tile, t) for t in tiles_to_download]
        for f in tqdm(as_completed(futures), total=len(futures), desc="Processing tiles"):
            f.result()

    # Master root.osg (PagedLOD)
    root_osg_path = out_path / "root.osg"
    with open(root_osg_path, "w", encoding="utf-8") as f:
        f.write(f"""# OpenSceneGraph Master Tiled Database
osg::Group {{
  name "Stuttgart_3D_Mesh_Tiled_Database"
  nodeMask 0xffffffff
  cullingActive TRUE
  num_children {len(tiles_to_download)}
""")
        for uri in tiles_to_download:
            clean = os.path.basename(uri).replace('.b3dm', '')
            f.write(f"""  osg::PagedLOD {{
    name "PagedLOD_{clean}"
    Center 4157592.0 671928.0 4774289.0
    Radius 25000.0
    RangeMode DISTANCE_FROM_EYE_POINT
    RangeList 1 {{
      0.0 50000000.0
    }}
    num_children 0
    FileNameList 1 {{
      "tiles/{clean}.osg"
    }}
  }}
""")
        f.write("}\n")

    # Direct all_tiles.osg
    all_tiles_path = out_path / "all_tiles.osg"
    with open(all_tiles_path, "w", encoding="utf-8") as f:
        f.write(f"""# OpenSceneGraph Direct All-Tiles Loader
osg::Group {{
  name "Stuttgart_All_Tiles_Direct"
  nodeMask 0xffffffff
  cullingActive TRUE
  num_children 1
  osg::ProxyNode {{
    name "All_Tiles_Proxy"
    num_children 0
    FileNameList {len(tiles_to_download)} {{
""")
        for uri in tiles_to_download:
            clean = os.path.basename(uri).replace('.b3dm', '')
            f.write(f'      "tiles/{clean}.osg"\n')
        f.write("""    }
  }
}
""")

    print(f"Done! OpenSceneGraph tiled database created at {out_path.resolve()}.")
    print(f"View with osgviewer: osgviewer {root_osg_path} OR osgviewer {all_tiles_path}")

if __name__ == '__main__':
    main()
`;
  res.setHeader('Content-Type', 'text/x-python');
  res.setHeader('Content-Disposition', 'attachment; filename="download_stuttgart_osg.py"');
  res.send(pythonScript);
});

// Start server
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
