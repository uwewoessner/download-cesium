import { ConvertedTileResult } from '../types/stuttgart';

/**
 * Parses a Cesium Batched 3D Model (.b3dm) buffer and converts it to OpenSceneGraph (.osg)
 * and extracted texture assets.
 */
export function parseB3dmAndConvertToOsg(
  buffer: ArrayBuffer,
  tileId: string,
  lod: number,
  uri: string,
  targetFormat: 'osg' | 'osgb' = 'osg'
): ConvertedTileResult {
  const dataView = new DataView(buffer);
  const magic = String.fromCharCode(
    dataView.getUint8(0),
    dataView.getUint8(1),
    dataView.getUint8(2),
    dataView.getUint8(3)
  );

  if (magic !== 'b3dm') {
    throw new Error(`Invalid magic: expected "b3dm", received "${magic}"`);
  }

  const byteLength = dataView.getUint32(8, true);
  const ftJsonLen = dataView.getUint32(12, true);
  const ftBinLen = dataView.getUint32(16, true);
  const btJsonLen = dataView.getUint32(20, true);
  const btBinLen = dataView.getUint32(24, true);

  const glbOffset = 28 + ftJsonLen + ftBinLen + btJsonLen + btBinLen;
  const glbBuffer = buffer.slice(glbOffset, byteLength);

  // Parse GLB
  const glbView = new DataView(glbBuffer);
  const glbMagic = glbView.getUint32(0, true);
  if (glbMagic !== 0x46546c67) { // "glTF"
    throw new Error('Embedded model is not a valid GLB container');
  }

  const jsonChunkLen = glbView.getUint32(12, true);
  const jsonBytes = new Uint8Array(glbBuffer, 20, jsonChunkLen);
  const gltfJson = JSON.parse(new TextDecoder().decode(jsonBytes));

  const binChunkOffset = 20 + jsonChunkLen;
  const binChunkLen = glbView.getUint32(binChunkOffset, true);
  const binBuffer = glbBuffer.slice(binChunkOffset + 8, binChunkOffset + 8 + binChunkLen);

  // Extract texture
  let textureBuffer: ArrayBuffer | undefined;
  let textureFileName: string | undefined;

  if (gltfJson.images && gltfJson.images.length > 0) {
    const imgInfo = gltfJson.images[0];
    const bv = gltfJson.bufferViews[imgInfo.bufferView];
    const offset = bv.byteOffset || 0;
    const len = bv.byteLength;
    textureBuffer = binBuffer.slice(offset, offset + len);
    const ext = imgInfo.mimeType === 'image/png' ? 'png' : 'jpg';
    textureFileName = `tex_${tileId}.${ext}`;
  }

  // Extract mesh primitives
  const mesh = gltfJson.meshes?.[0];
  if (!mesh || !mesh.primitives || mesh.primitives.length === 0) {
    throw new Error('No mesh primitives found in tile');
  }

  const prim = mesh.primitives[0];
  const posAcc = gltfJson.accessors[prim.attributes.POSITION];
  const posBv = gltfJson.bufferViews[posAcc.bufferView];
  const posOffset = (posBv.byteOffset || 0) + (posAcc.byteOffset || 0);

  // Positions (Float32 Vec3)
  const positions = new Float32Array(binBuffer, posOffset, posAcc.count * 3);

  // Apply node matrix if present (Stuttgart meshes often use axis-swapping matrix)
  const node = gltfJson.nodes?.[0];
  const matrix = node?.matrix;
  if (matrix && matrix.length === 16) {
    // Transform positions by column-major matrix
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      const z = positions[i + 2];
      positions[i]     = matrix[0] * x + matrix[4] * y + matrix[8]  * z + matrix[12];
      positions[i + 1] = matrix[1] * x + matrix[5] * y + matrix[9]  * z + matrix[13];
      positions[i + 2] = matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14];
    }
  }

  // Indices
  const idxAcc = gltfJson.accessors[prim.indices];
  const idxBv = gltfJson.bufferViews[idxAcc.bufferView];
  const idxOffset = (idxBv.byteOffset || 0) + (idxAcc.byteOffset || 0);
  let indices: Uint16Array | Uint32Array;

  if (idxAcc.componentType === 5123) { // UNSIGNED_SHORT
    indices = new Uint16Array(binBuffer, idxOffset, idxAcc.count);
  } else if (idxAcc.componentType === 5125) { // UNSIGNED_INT
    indices = new Uint32Array(binBuffer, idxOffset, idxAcc.count);
  } else {
    indices = new Uint16Array(binBuffer, idxOffset, idxAcc.count);
  }

  // UV coordinates
  let uvs: Float32Array | undefined;
  if (prim.attributes.TEXCOORD_0 !== undefined) {
    const uvAcc = gltfJson.accessors[prim.attributes.TEXCOORD_0];
    const uvBv = gltfJson.bufferViews[uvAcc.bufferView];
    const uvOffset = (uvBv.byteOffset || 0) + (uvAcc.byteOffset || 0);
    uvs = new Float32Array(binBuffer, uvOffset, uvAcc.count * 2);
  }

  // Compute Center and Bounding Radius
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i], y = positions[i + 1], z = positions[i + 2];
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const centerZ = (minZ + maxZ) / 2;
  const radius = Math.sqrt(
    Math.pow(maxX - centerX, 2) + Math.pow(maxY - centerY, 2) + Math.pow(maxZ - centerZ, 2)
  );

  // Generate OpenSceneGraph (.osg) text
  const cleanName = tileId.replace(/[^a-zA-Z0-9_]/g, '_');
  const osgAscii = generateOsgAscii({
    name: cleanName,
    positions,
    indices,
    uvs,
    textureRelPath: textureFileName ? `../textures/${textureFileName}` : undefined,
    centerX,
    centerY,
    centerZ,
    radius,
    lod,
  });

  return {
    tileId,
    lod,
    uri,
    osgAscii,
    textureBuffer,
    textureFileName,
    geometryData: {
      positions,
      indices,
      uvs,
      center: [centerX, centerY, centerZ],
      radius,
    },
  };
}

interface GenerateOsgOptions {
  name: string;
  positions: Float32Array;
  indices: Uint16Array | Uint32Array;
  uvs?: Float32Array;
  textureRelPath?: string;
  centerX: number;
  centerY: number;
  centerZ: number;
  radius: number;
  lod: number;
}

export function generateOsgAscii(opts: GenerateOsgOptions): string {
  const { name, positions, indices, uvs, textureRelPath, centerX, centerY, centerZ, radius, lod } = opts;

  const lines: string[] = [];
  lines.push('# OpenSceneGraph ASCII File (.osg)');
  lines.push('# Generated from Stuttgart 3D Mesh+ (https://3d.stuttgart.de/)');
  lines.push(`# LOD: ${lod} | Tile: ${name}`);
  lines.push('');
  lines.push('osg::Geode {');
  lines.push(`  name "${name}"`);
  lines.push('  nodeMask 0xffffffff');
  lines.push('  cullingActive TRUE');

  // StateSet with Texture or Unlit Material
  lines.push('  StateSet {');
  lines.push('    UniqueID StateSet_0');
  lines.push('    rendering_hint DEFAULT_BIN');
  lines.push('    renderBinMode INHERIT');
  lines.push('    GL_CULL_FACE OFF');
  lines.push('    GL_LIGHTING OFF');
  if (textureRelPath) {
    lines.push('    textureUnit 0 {');
    lines.push('      GL_TEXTURE_2D ON');
    lines.push('      osg::Texture2D {');
    lines.push('        UniqueID Texture2D_0');
    lines.push(`        file "${textureRelPath}"`);
    lines.push('        wrap_s REPEAT');
    lines.push('        wrap_t REPEAT');
    lines.push('        min_filter LINEAR_MIPMAP_LINEAR');
    lines.push('        mag_filter LINEAR');
    lines.push('      }');
    lines.push('    }');
  }
  lines.push('  }');

  lines.push('  num_drawables 1');
  lines.push('  osg::Geometry {');
  lines.push('    UniqueID Geometry_0');
  lines.push('    DataVariance STATIC');
  lines.push('    useDisplayList TRUE');
  lines.push('    useVertexBufferObjects TRUE');

  // PrimitiveSets (OpenSceneGraph standard keyword)
  lines.push('    PrimitiveSets 1');
  lines.push('    {');
  lines.push(`      DrawElementsUInt TRIANGLES ${indices.length}`);
  lines.push('      {');
  for (let i = 0; i < indices.length; i += 12) {
    const end = Math.min(i + 12, indices.length);
    const chunk: number[] = [];
    for (let j = i; j < end; j++) {
      chunk.push(indices[j]);
    }
    lines.push(`        ${chunk.join(' ')}`);
  }
  lines.push('      }');
  lines.push('    }');

  // VertexArray
  const vertexCount = positions.length / 3;
  lines.push(`    VertexArray Vec3Array ${vertexCount}`);
  lines.push('    {');
  for (let i = 0; i < positions.length; i += 3) {
    lines.push(`      ${positions[i].toFixed(4)} ${positions[i + 1].toFixed(4)} ${positions[i + 2].toFixed(4)}`);
  }
  lines.push('    }');

  // NormalArray for lighting fallback
  lines.push('    NormalBinding OVERALL');
  lines.push('    NormalArray Vec3Array 1');
  lines.push('    {');
  lines.push('      0 0 1');
  lines.push('    }');

  // TexCoordArray (UVs)
  if (uvs && uvs.length > 0) {
    const uvCount = uvs.length / 2;
    lines.push(`    TexCoordArray 0 Vec2Array ${uvCount}`);
    lines.push('    {');
    for (let i = 0; i < uvs.length; i += 2) {
      // Invert V coordinate for OpenGL texture origin standard
      lines.push(`      ${uvs[i].toFixed(5)} ${(1.0 - uvs[i + 1]).toFixed(5)}`);
    }
    lines.push('    }');
  }

  lines.push('  }');
  lines.push('}');
  return lines.join('\n');
}

/**
 * Builds the master root.osg PagedLOD scene graph linking all downloaded LOD levels.
 */
export function generateMasterRootOsg(tiles: Array<{ id: string; lod: number; fileName: string; centerX: number; centerY: number; centerZ: number; radius: number }>): string {
  const lines: string[] = [];
  lines.push('# OpenSceneGraph Master Tiled Database (.osg)');
  lines.push('# Source: https://3d.stuttgart.de/ 3D Mesh+');
  lines.push('# Compatible with osgviewer, OpenCOVER, COVISE, osgconv');
  lines.push('');
  lines.push('osg::Group {');
  lines.push('  name "Stuttgart_3D_Mesh_Tiled_Database"');
  lines.push('  nodeMask 0xffffffff');
  lines.push('  cullingActive TRUE');
  lines.push(`  num_children ${tiles.length}`);

  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i];
    lines.push('  osg::PagedLOD {');
    lines.push(`    name "PagedLOD_${t.id}_L${t.lod}"`);
    lines.push(`    Center ${t.centerX.toFixed(2)} ${t.centerY.toFixed(2)} ${t.centerZ.toFixed(2)}`);
    lines.push(`    Radius ${t.radius.toFixed(2)}`);
    lines.push('    RangeMode DISTANCE_FROM_EYE_POINT');
    lines.push('    RangeList 1 {');
    lines.push('      0.0 50000000.0');
    lines.push('    }');
    lines.push('    num_children 0');
    lines.push('    FileNameList 1 {');
    lines.push(`      "tiles/${t.fileName}"`);
    lines.push('    }');
    lines.push('  }');
  }

  lines.push('}');
  return lines.join('\n');
}

/**
 * Builds all_tiles.osg which directly loads all tiles into memory simultaneously.
 */
export function generateAllTilesDirectOsg(tiles: Array<{ fileName: string }>): string {
  const lines: string[] = [];
  lines.push('# OpenSceneGraph Direct All-Tiles Loader (.osg)');
  lines.push('# Loads all downloaded tiles directly without distance cutoff');
  lines.push('');
  lines.push('osg::Group {');
  lines.push('  name "Stuttgart_All_Tiles_Direct"');
  lines.push('  nodeMask 0xffffffff');
  lines.push('  cullingActive TRUE');
  lines.push('  num_children 1');
  lines.push('  osg::ProxyNode {');
  lines.push('    name "All_Tiles_Proxy"');
  lines.push('    num_children 0');
  lines.push(`    FileNameList ${tiles.length} {`);
  for (const t of tiles) {
    lines.push(`      "tiles/${t.fileName}"`);
  }
  lines.push('    }');
  lines.push('  }');
  lines.push('}');
  return lines.join('\n');
}

