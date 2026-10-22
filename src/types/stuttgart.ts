export interface PortalMetadata {
  portalUrl: string;
  viewId: string;
  meshLayer: {
    id: string;
    name: string;
    type: string;
    revision: string;
    bbox?: number[];
  };
  tilesetBaseUrl: string;
  rootTilesetUrl: string;
  attribution: string;
}

export interface TileNode {
  id: string;
  lod: number;
  lodName: string;
  uri: string;
  fullUri: string;
  geometricError: number;
  boundingVolume: {
    box?: number[];
    sphere?: number[];
    region?: number[];
  };
  hasChildren: boolean;
  childUris: string[];
  status?: 'idle' | 'downloading' | 'converting' | 'completed' | 'error';
  progress?: number;
  fileSizeBytes?: number;
  convertedOsgSize?: number;
  vertexCount?: number;
  triangleCount?: number;
  hasTexture?: boolean;
}

export interface ConvertedTileResult {
  tileId: string;
  lod: number;
  uri: string;
  osgAscii: string;
  textureBuffer?: ArrayBuffer;
  textureFileName?: string;
  geometryData: {
    positions: Float32Array;
    indices: Uint16Array | Uint32Array;
    normals?: Float32Array;
    uvs?: Float32Array;
    center: [number, number, number];
    radius: number;
  };
}

export interface RegionPreset {
  id: string;
  name: string;
  description: string;
  lat: number;
  lon: number;
  approxRadiusMeters: number;
  recommendedLods: number[];
}

export interface ZipChunkResult {
  partIndex: number;
  totalParts: number;
  fileName: string;
  tileCount: number;
  sizeBytes: number;
  blob: Blob;
  lodRange: string;
}
