import React, { useState } from 'react';
import {
  Download,
  Database,
  CheckCircle2,
  AlertCircle,
  FileArchive,
  RefreshCw,
  Eye,
  Sliders,
  Check,
  Package,
  Layers,
  FileText,
  Boxes,
  Split,
  FolderDown,
  Info,
  Terminal
} from 'lucide-react';
import { TileNode, ConvertedTileResult, ZipChunkResult } from '../types/stuttgart';
import { parseB3dmAndConvertToOsg } from '../utils/b3dmToOsg';
import { packageOsgDatabaseChunks } from '../utils/osgDatabaseBuilder';

interface DownloadManagerProps {
  tiles: TileNode[];
  selectedLods: number[];
  convertedTiles: ConvertedTileResult[];
  onTileConverted: (result: ConvertedTileResult) => void;
  onPreviewTile: (result: ConvertedTileResult) => void;
}

export const DownloadManager: React.FC<DownloadManagerProps> = ({
  tiles,
  selectedLods,
  convertedTiles,
  onTileConverted,
  onPreviewTile,
}) => {
  const [targetFormat, setTargetFormat] = useState<'osg' | 'osgb'>('osg');
  const [concurrency, setConcurrency] = useState<number>(6);
  const [downloading, setDownloading] = useState<boolean>(false);
  const [packagingZip, setPackagingZip] = useState<boolean>(false);
  const [zipProgress, setZipProgress] = useState<{ percent: number; status: string }>({
    percent: 0,
    status: '',
  });
  const [logMessages, setLogMessages] = useState<string[]>([]);

  // Split ZIP Chunk Configuration
  const [chunkSizeMb, setChunkSizeMb] = useState<number>(50);
  const [splitByLod, setSplitByLod] = useState<boolean>(false);
  const [generatedChunks, setGeneratedChunks] = useState<ZipChunkResult[]>([]);
  const [downloadingAllChunks, setDownloadingAllChunks] = useState<boolean>(false);

  const [downloadScope, setDownloadScope] = useState<'all' | 'filtered'>('all');
  const eligibleTiles = downloadScope === 'all' ? tiles : tiles.filter((t) => selectedLods.includes(t.lod));
  const convertedCount = convertedTiles.length;
  const progressPercent = eligibleTiles.length > 0 ? Math.round((convertedCount / eligibleTiles.length) * 100) : 0;

  const addLog = (msg: string) => {
    setLogMessages((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev.slice(0, 50)]);
  };

  // Start Batch Download & OSG Conversion
  const handleStartDownload = async () => {
    if (eligibleTiles.length === 0) return;
    setDownloading(true);
    addLog(`Initiating download for ALL ${eligibleTiles.length} tiles (${downloadScope === 'all' ? 'All Discovered Tiles' : 'Filtered LODs'})...`);

    const queue = [...eligibleTiles];
    let active = 0;

    const processNext = async () => {
      if (queue.length === 0) return;
      const tile = queue.shift()!;
      active++;

      try {
        addLog(`Fetching ${tile.id} (LOD ${tile.lod}): ${tile.uri}...`);
        const res = await fetch(`/api/stuttgart/proxy/${tile.uri}`);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }
        const buffer = await res.arrayBuffer();

        // Convert b3dm to OpenSceneGraph with PrimitiveSets
        addLog(`Converting ${tile.id} b3dm to OpenSceneGraph (.${targetFormat})...`);
        const converted = parseB3dmAndConvertToOsg(
          buffer,
          tile.id,
          tile.lod,
          tile.uri,
          targetFormat
        );

        onTileConverted(converted);
        addLog(
          `✓ Converted ${tile.id} (${(converted.geometryData.positions.length / 3).toLocaleString()} verts, ${(converted.geometryData.indices.length / 3).toLocaleString()} tris)`
        );
      } catch (err: any) {
        addLog(`✗ Error processing ${tile.id}: ${err.message}`);
      } finally {
        active--;
        if (queue.length > 0) {
          processNext();
        }
      }
    };

    // Launch workers according to concurrency
    const workers = [];
    for (let i = 0; i < Math.min(concurrency, eligibleTiles.length); i++) {
      workers.push(processNext());
    }

    // Wait until queue is completely empty
    const interval = setInterval(() => {
      if (queue.length === 0 && active === 0) {
        clearInterval(interval);
        setDownloading(false);
        addLog(`✓ Batch conversion complete! ${convertedTiles.length} tiles ready for OSG split-ZIP packaging.`);
      }
    }, 400);
  };

  // Build Split ZIP Chunks
  const handleBuildZipChunks = async () => {
    if (convertedTiles.length === 0) return;
    setPackagingZip(true);
    addLog(`Partitioning ${convertedTiles.length} converted tiles into browser-friendly ZIP chunks (Max ${splitByLod ? 'by LOD Group' : `${chunkSizeMb} MB per chunk`})...`);

    try {
      const chunks = await packageOsgDatabaseChunks(
        convertedTiles,
        { maxChunkMb: chunkSizeMb, splitByLod },
        (pct, status) => {
          setZipProgress({ percent: pct, status });
        }
      );

      setGeneratedChunks(chunks);
      addLog(`✓ Successfully generated ${chunks.length} browser-friendly ZIP chunk(s)!`);
    } catch (err: any) {
      addLog(`✗ Error packaging ZIP chunks: ${err.message}`);
    } finally {
      setPackagingZip(false);
    }
  };

  // Download a single chunk
  const handleDownloadSingleChunk = (chunk: ZipChunkResult) => {
    const url = URL.createObjectURL(chunk.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = chunk.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    addLog(`✓ Downloaded ${chunk.fileName} (${(chunk.sizeBytes / (1024 * 1024)).toFixed(1)} MB).`);
  };

  // Download all chunks sequentially
  const handleDownloadAllChunksSequentially = async () => {
    if (generatedChunks.length === 0) return;
    setDownloadingAllChunks(true);
    addLog(`Downloading all ${generatedChunks.length} ZIP chunks sequentially...`);

    for (let i = 0; i < generatedChunks.length; i++) {
      const chunk = generatedChunks[i];
      handleDownloadSingleChunk(chunk);
      // Wait 750ms between downloads so browser popup blocker does not intercept
      if (i < generatedChunks.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
    }

    setDownloadingAllChunks(false);
    addLog(`✓ All ${generatedChunks.length} chunks downloaded. Extract into the same folder to merge.`);
  };

  // Total stats
  const totalVertices = convertedTiles.reduce(
    (acc, t) => acc + t.geometryData.positions.length / 3,
    0
  );
  const totalTriangles = convertedTiles.reduce(
    (acc, t) => acc + t.geometryData.indices.length / 3,
    0
  );
  const totalTextures = convertedTiles.filter((t) => !!t.textureBuffer).length;

  return (
    <div className="space-y-6">
      {/* Controls & Options Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-6 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <Database className="w-5 h-5 text-amber-400" />
              <h2 className="text-xl font-bold text-white">
                OpenSceneGraph Tiled Database Builder
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Downloads Cesium 3D Mesh+ tiles, converts with <strong className="text-amber-400">PrimitiveSets</strong>, and splits database into browser-friendly download chunks.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleStartDownload}
              disabled={downloading || eligibleTiles.length === 0}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-bold text-sm shadow-md transition-all cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${downloading ? 'animate-spin' : ''}`} />
              <span>{downloading ? `Downloading (${convertedCount}/${eligibleTiles.length})...` : `Download & Convert ALL (${eligibleTiles.length} tiles)`}</span>
            </button>

            <button
              onClick={handleBuildZipChunks}
              disabled={convertedTiles.length === 0 || packagingZip}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-md transition-all cursor-pointer disabled:opacity-50"
            >
              <Split className="w-4 h-4" />
              <span>{packagingZip ? `Packaging Chunks (${zipProgress.percent}%)...` : `Generate Split ZIP Chunks (${convertedTiles.length} tiles)`}</span>
            </button>
          </div>
        </div>

        {/* Configuration settings */}
        <div className="pt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Format selection */}
          <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2">
              OSG Format Standard
            </label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setTargetFormat('osg')}
                className={`flex-1 py-2 px-2.5 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                  targetFormat === 'osg'
                    ? 'bg-amber-500 text-slate-950 border-amber-500 shadow-sm'
                    : 'bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-800'
                }`}
              >
                .osg (ASCII)
              </button>
              <button
                onClick={() => setTargetFormat('osgb')}
                className={`flex-1 py-2 px-2.5 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                  targetFormat === 'osgb'
                    ? 'bg-amber-500 text-slate-950 border-amber-500 shadow-sm'
                    : 'bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-800'
                }`}
              >
                .osgb (Binary)
              </button>
            </div>
            <p className="text-[11px] text-slate-500 mt-2">
              Emits <strong className="text-slate-300">PrimitiveSets</strong> for 100% rendering compatibility with osgviewer.
            </p>
          </div>

          {/* Max Chunk Size */}
          <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="text-slate-400 font-semibold uppercase tracking-wider">Browser Chunk Size</span>
              <span className="text-amber-400 font-mono font-bold">{splitByLod ? 'LOD Mode' : `${chunkSizeMb} MB`}</span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {[25, 50, 100].map((size) => (
                <button
                  key={size}
                  onClick={() => {
                    setChunkSizeMb(size);
                    setSplitByLod(false);
                  }}
                  className={`py-1.5 px-2 rounded-lg text-xs font-mono font-bold border transition-colors cursor-pointer ${
                    !splitByLod && chunkSizeMb === size
                      ? 'bg-amber-500 text-slate-950 border-amber-400'
                      : 'bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-800'
                  }`}
                >
                  {size} MB
                </button>
              ))}
            </div>
            <button
              onClick={() => setSplitByLod(!splitByLod)}
              className={`mt-2 w-full py-1 px-2 rounded text-[11px] font-medium border text-center transition-colors cursor-pointer ${
                splitByLod
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
              }`}
            >
              {splitByLod ? '✓ Split by LOD Pyramid' : 'Or Split by LOD Pyramid'}
            </button>
          </div>

          {/* Download Scope */}
          <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2">
              Download Scope
            </label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setDownloadScope('all')}
                className={`flex-1 py-2 px-2.5 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                  downloadScope === 'all'
                    ? 'bg-amber-500 text-slate-950 border-amber-500 shadow-sm'
                    : 'bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-800'
                }`}
              >
                All ({tiles.length})
              </button>
              <button
                onClick={() => setDownloadScope('filtered')}
                className={`flex-1 py-2 px-2.5 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                  downloadScope === 'filtered'
                    ? 'bg-amber-500 text-slate-950 border-amber-500 shadow-sm'
                    : 'bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-800'
                }`}
              >
                Filtered
              </button>
            </div>
            <p className="text-[11px] text-slate-500 mt-2">
              {downloadScope === 'all' ? 'Downloads all discovered tiles across the city.' : 'Downloads only active LOD filters.'}
            </p>
          </div>

          {/* Concurrency */}
          <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="text-slate-400 font-semibold uppercase tracking-wider">Concurrency</span>
              <span className="text-amber-400 font-mono font-bold">{concurrency} workers</span>
            </div>
            <input
              type="range"
              min="1"
              max="12"
              value={concurrency}
              onChange={(e) => setConcurrency(parseInt(e.target.value, 10))}
              className="w-full accent-amber-500 cursor-pointer"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Parallel tile downloads from 3d.stuttgart.de.
            </p>
          </div>
        </div>

        {/* Live Progress Bar */}
        <div className="mt-6 pt-5 border-t border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${downloading ? 'bg-amber-400 animate-ping' : 'bg-slate-600'}`} />
              <span>Conversion Progress</span>
            </span>
            <span className="font-mono text-white font-bold">
              {convertedCount} / {eligibleTiles.length} tiles ({progressPercent}%)
            </span>
          </div>

          <div className="w-full h-3 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
            <div
              className="h-full bg-gradient-to-r from-amber-500 to-emerald-500 transition-all duration-300 rounded-full"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {/* Statistics summary */}
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800/80">
              <span className="text-[10px] text-slate-500 uppercase block">Converted Tiles</span>
              <span className="text-base font-bold text-white font-mono">{convertedCount}</span>
            </div>
            <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800/80">
              <span className="text-[10px] text-slate-500 uppercase block">Extracted Vertices</span>
              <span className="text-base font-bold text-sky-400 font-mono">{totalVertices.toLocaleString()}</span>
            </div>
            <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800/80">
              <span className="text-[10px] text-slate-500 uppercase block">Triangle Faces</span>
              <span className="text-base font-bold text-amber-400 font-mono">{totalTriangles.toLocaleString()}</span>
            </div>
            <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800/80">
              <span className="text-[10px] text-slate-500 uppercase block">Texture Maps</span>
              <span className="text-base font-bold text-emerald-400 font-mono">{totalTextures}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Generated Split ZIP Chunks Section */}
      {generatedChunks.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
            <div>
              <div className="flex items-center gap-2">
                <Package className="w-5 h-5 text-emerald-400" />
                <h3 className="text-lg font-bold text-white">
                  Generated Split ZIP Chunks ({generatedChunks.length} Volumes)
                </h3>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Each archive is under {chunkSizeMb} MB so regular web browsers can download safely without freezing or dropping.
              </p>
            </div>

            <button
              onClick={handleDownloadAllChunksSequentially}
              disabled={downloadingAllChunks}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md transition-colors cursor-pointer"
            >
              <FolderDown className="w-4 h-4" />
              <span>{downloadingAllChunks ? 'Downloading Parts...' : 'Download All Parts Sequentially'}</span>
            </button>
          </div>

          {/* Chunks List */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {generatedChunks.map((chunk) => (
              <div
                key={chunk.partIndex}
                className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col justify-between hover:border-slate-700 transition-colors"
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-white font-mono">
                      Part {chunk.partIndex} of {chunk.totalParts}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      {(chunk.sizeBytes / (1024 * 1024)).toFixed(1)} MB
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 font-mono truncate" title={chunk.fileName}>
                    {chunk.fileName}
                  </p>
                  <div className="mt-2 text-[11px] text-slate-400 flex items-center justify-between">
                    <span>{chunk.tileCount} mesh tiles</span>
                    <span>{chunk.lodRange}</span>
                  </div>
                  {chunk.partIndex === 1 && (
                    <div className="mt-1 text-[10px] text-amber-400">
                      Includes root.osg & all_tiles.osg index
                    </div>
                  )}
                </div>

                <button
                  onClick={() => handleDownloadSingleChunk(chunk)}
                  className="mt-3 w-full py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-amber-400" />
                  <span>Download Part {chunk.partIndex}</span>
                </button>
              </div>
            ))}
          </div>

          {/* Extraction Guide for Chunks */}
          <div className="bg-slate-950/80 p-4 rounded-xl border border-slate-800/80 text-xs text-slate-300 space-y-2">
            <div className="flex items-center gap-2 text-amber-400 font-bold">
              <Terminal className="w-4 h-4" />
              <span>How to Extract & Merge Chunks</span>
            </div>
            <p className="text-slate-400">
              Extract all downloaded <code className="text-amber-300 font-mono">stuttgart_mesh_osg_part*.zip</code> files into the <strong>same directory</strong>. All tiles and textures will automatically merge into a single database:
            </p>
            <div className="p-2.5 rounded bg-slate-900 font-mono text-[11px] text-emerald-300">
              unzip &apos;stuttgart_mesh_osg_part*.zip&apos; -d stuttgart_osg_db/<br />
              cd stuttgart_osg_db && osgviewer root.osg
            </div>
          </div>
        </div>
      )}

      {/* Two Column Layout: Converted Tiles & Console Logs */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Converted Tiles List */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-850/50">
            <div className="flex items-center gap-2">
              <Boxes className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-bold text-white">
                Converted OpenSceneGraph Tiles ({convertedTiles.length})
              </h3>
            </div>
            {convertedTiles.length > 0 && (
              <span className="text-[11px] text-slate-400 font-mono">
                Keywords: <strong className="text-amber-400">PrimitiveSets</strong>
              </span>
            )}
          </div>

          <div className="divide-y divide-slate-800/60 max-h-[420px] overflow-y-auto font-mono text-xs">
            {convertedTiles.length === 0 ? (
              <div className="p-8 text-center text-slate-500">
                No tiles converted yet. Click &quot;Download & Convert ALL&quot; above to start processing.
              </div>
            ) : (
              convertedTiles.map((tile) => (
                <div
                  key={tile.tileId}
                  className="p-3.5 hover:bg-slate-800/40 transition-colors flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white text-xs truncate">{tile.tileId}.osg</span>
                      <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        LOD {tile.lod}
                      </span>
                      {tile.textureFileName && (
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-sky-500/10 text-sky-400 border border-sky-500/20">
                          JPG Tex
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-3">
                      <span>{(tile.geometryData.positions.length / 3).toLocaleString()} vertices</span>
                      <span>•</span>
                      <span>{(tile.geometryData.indices.length / 3).toLocaleString()} triangles</span>
                      <span>•</span>
                      <span>Radius: {tile.geometryData.radius.toFixed(1)}m</span>
                    </div>
                  </div>

                  <button
                    onClick={() => onPreviewTile(tile)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-sans font-medium border border-slate-700 transition-colors cursor-pointer shrink-0"
                  >
                    <Eye className="w-3.5 h-3.5 text-amber-400" />
                    <span>View 3D</span>
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right: Real-time Conversion Log Console */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm flex flex-col h-[480px]">
          <div className="px-4 py-3 border-b border-slate-800 bg-slate-850/50 flex items-center justify-between">
            <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-amber-400" />
              Process Logger
            </span>
            <button
              onClick={() => setLogMessages([])}
              className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
            >
              Clear
            </button>
          </div>

          <div className="p-3 font-mono text-[11px] leading-relaxed overflow-y-auto flex-1 bg-slate-950 text-slate-400 space-y-1">
            {logMessages.length === 0 ? (
              <p className="text-slate-600 italic">Ready to process tiles.</p>
            ) : (
              logMessages.map((msg, i) => (
                <div
                  key={i}
                  className={
                    msg.includes('✓')
                      ? 'text-emerald-400'
                      : msg.includes('✗')
                      ? 'text-red-400'
                      : msg.includes('Initiating')
                      ? 'text-amber-300 font-bold'
                      : 'text-slate-400'
                  }
                >
                  {msg}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
