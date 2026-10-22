import JSZip from 'jszip';
import { ConvertedTileResult, ZipChunkResult } from '../types/stuttgart';
import { generateMasterRootOsg, generateAllTilesDirectOsg } from './b3dmToOsg';

export interface ChunkOptions {
  maxChunkMb?: number;
  splitByLod?: boolean;
}

/**
 * Packages converted OpenSceneGraph tiles into multiple split ZIP volumes
 * so that standard web browsers can download them without running out of RAM or hitting download timeouts.
 */
export async function packageOsgDatabaseChunks(
  convertedTiles: ConvertedTileResult[],
  options: ChunkOptions = {},
  onProgress?: (percent: number, status: string) => void
): Promise<ZipChunkResult[]> {
  const maxChunkBytes = (options.maxChunkMb || 50) * 1024 * 1024;
  const splitByLod = !!options.splitByLod;

  if (convertedTiles.length === 0) {
    return [];
  }

  // Build master root.osg metadata (contains references to all tiles across all parts)
  const allTileEntries = convertedTiles.map((t) => {
    const cleanName = t.tileId.replace(/[^a-zA-Z0-9_]/g, '_');
    return {
      id: t.tileId,
      lod: t.lod,
      fileName: `${cleanName}.osg`,
      centerX: t.geometryData.center[0],
      centerY: t.geometryData.center[1],
      centerZ: t.geometryData.center[2],
      radius: t.geometryData.radius,
    };
  });

  const masterRootOsg = generateMasterRootOsg(allTileEntries);
  const masterAllTilesOsg = generateAllTilesDirectOsg(allTileEntries);

  // Group tiles into chunks
  const tileBatches: ConvertedTileResult[][] = [];

  if (splitByLod) {
    // Group by distinct LOD groups
    const lodGroups: Record<string, ConvertedTileResult[]> = {
      'overview_L17_L14': [],
      'intermediate_L13_L10': [],
      'fine_L9_L6': [],
      'detail_L5_L0': [],
    };

    for (const t of convertedTiles) {
      if (t.lod >= 14) lodGroups['overview_L17_L14'].push(t);
      else if (t.lod >= 10) lodGroups['intermediate_L13_L10'].push(t);
      else if (t.lod >= 6) lodGroups['fine_L9_L6'].push(t);
      else lodGroups['detail_L5_L0'].push(t);
    }

    for (const key of Object.keys(lodGroups)) {
      if (lodGroups[key].length > 0) {
        tileBatches.push(lodGroups[key]);
      }
    }
  } else {
    // Group by maxChunkBytes
    let currentBatch: ConvertedTileResult[] = [];
    let currentBatchBytes = 0;

    for (const tile of convertedTiles) {
      // Estimate tile size in memory
      const osgBytes = tile.osgAscii.length;
      const texBytes = tile.textureBuffer ? tile.textureBuffer.byteLength : 0;
      const tileBytes = osgBytes + texBytes;

      if (currentBatch.length > 0 && (currentBatchBytes + tileBytes > maxChunkBytes)) {
        tileBatches.push(currentBatch);
        currentBatch = [tile];
        currentBatchBytes = tileBytes;
      } else {
        currentBatch.push(tile);
        currentBatchBytes += tileBytes;
      }
    }

    if (currentBatch.length > 0) {
      tileBatches.push(currentBatch);
    }
  }

  const totalParts = tileBatches.length;
  const results: ZipChunkResult[] = [];

  // Create each zip volume sequentially
  for (let partIdx = 0; partIdx < totalParts; partIdx++) {
    const partNum = partIdx + 1;
    const batch = tileBatches[partIdx];
    const zip = new JSZip();

    const lodsInBatch = Array.from(new Set(batch.map((t) => t.lod))).sort((a, b) => b - a);
    const lodRangeStr = lodsInBatch.length > 1
      ? `LOD ${lodsInBatch[lodsInBatch.length - 1]}–${lodsInBatch[0]}`
      : `LOD ${lodsInBatch[0]}`;

    const fileName = totalParts === 1
      ? 'stuttgart_mesh_osg_database.zip'
      : `stuttgart_mesh_osg_part${partNum}_of_${totalParts}.zip`;

    onProgress?.(
      Math.round((partIdx / totalParts) * 100),
      `Building Part ${partNum}/${totalParts} (${batch.length} tiles)...`
    );

    const tilesFolder = zip.folder('tiles');
    const texturesFolder = zip.folder('textures');

    // Part 1 includes master root.osg, all_tiles.osg, and README
    if (partNum === 1) {
      zip.file('root.osg', masterRootOsg);
      zip.file('all_tiles.osg', masterAllTilesOsg);

      const readmeContent = `# Stuttgart 3D Mesh+ OpenSceneGraph Tiled Database
=====================================================
Downloaded from: https://3d.stuttgart.de/ (Stadtmessungsamt Stuttgart)
Converted format: OpenSceneGraph (.osg / PagedLOD) with PrimitiveSets

## Multi-Part Archive Instructions
This database was split into ${totalParts} browser-friendly ZIP archive(s).
To use the complete database:
1. Extract all part*.zip archives into the SAME destination directory.
2. The extracted files will naturally merge into:
   ├── root.osg             (Master PagedLOD scene graph)
   ├── all_tiles.osg        (Direct all-tiles loader)
   ├── tiles/               (Contains all .osg geometry tiles)
   └── textures/            (Contains all photogrammetry .jpg maps)

## How to View
### 1. View Hierarchical PagedLOD in osgviewer:
\`\`\`bash
osgviewer root.osg
\`\`\`

### 2. View All Downloaded Tiles Simultaneously (no LOD distance cutoff):
\`\`\`bash
osgviewer all_tiles.osg
\`\`\`

### 3. Open in HLRS COVISE / OpenCOVER:
\`\`\`bash
opencover root.osg
\`\`\`

### 4. Convert all .osg files to binary .osgb with osgconv:
\`\`\`bash
osgconv root.osg root.osgb
for f in tiles/*.osg; do osgconv "$f" "\${f%.osg}.osgb"; done
\`\`\`
`;
      zip.file('README_OSG.md', readmeContent);
    } else {
      // Secondary parts also include a short merge note
      const partNote = `# Stuttgart 3D Mesh+ Database - Part ${partNum} of ${totalParts}
Extract this zip into the same root folder as Part 1 to merge tiles and textures.
`;
      zip.file(`PART_${partNum}_OF_${totalParts}_README.txt`, partNote);
    }

    // Add tiles and textures for this batch
    for (const tile of batch) {
      const cleanName = tile.tileId.replace(/[^a-zA-Z0-9_]/g, '_');
      tilesFolder?.file(`${cleanName}.osg`, tile.osgAscii);
      if (tile.textureBuffer && tile.textureFileName) {
        texturesFolder?.file(tile.textureFileName, tile.textureBuffer);
      }
    }

    // Compress chunk
    const blob = await zip.generateAsync(
      {
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      },
      (metadata) => {
        const chunkProgress = (metadata.percent / 100);
        const overallPercent = Math.round(((partIdx + chunkProgress) / totalParts) * 100);
        onProgress?.(overallPercent, `Compressing Part ${partNum}/${totalParts} (${Math.round(metadata.percent)}%)...`);
      }
    );

    results.push({
      partIndex: partNum,
      totalParts,
      fileName,
      tileCount: batch.length,
      sizeBytes: blob.size,
      blob,
      lodRange: lodRangeStr,
    });
  }

  onProgress?.(100, `All ${totalParts} ZIP chunk(s) generated successfully!`);
  return results;
}

/**
 * Backward-compatible single-zip packager
 */
export async function packageOsgDatabaseZip(
  convertedTiles: ConvertedTileResult[],
  onProgress?: (percent: number, status: string) => void
): Promise<Blob> {
  const chunks = await packageOsgDatabaseChunks(
    convertedTiles,
    { maxChunkMb: 10000 },
    onProgress
  );
  if (chunks.length > 0) {
    return chunks[0].blob;
  }
  return new Blob([]);
}
