import React, { useState } from 'react';
import {
  Layers,
  Search,
  Sliders,
  FolderTree,
  ArrowRight,
  Database,
  MapPin,
  Check,
  AlertCircle,
  FileCode,
  HardDrive
} from 'lucide-react';
import { TileNode, RegionPreset } from '../types/stuttgart';

interface LodCrawlerProps {
  tiles: TileNode[];
  lodSummary: Record<number, number>;
  loading: boolean;
  onCrawl: (depth: number, maxTiles: number) => void;
  onProceedToDownload: (selectedLods: number[]) => void;
}

export const REGION_PRESETS: RegionPreset[] = [
  {
    id: 'hlrs-vaihingen',
    name: 'HLRS & Uni Stuttgart (Campus Vaihingen)',
    description: 'Nobelstraße, High Performance Computing Center, CAVE/VR labs & Campus',
    lat: 48.7397,
    lon: 9.0975,
    approxRadiusMeters: 1800,
    recommendedLods: [17, 16, 15, 14, 13, 12],
  },
  {
    id: 'city-center',
    name: 'Stuttgart Mitte (Schlossplatz & Königsstraße)',
    description: 'Neues Schloss, Altes Schloss, Königstraße, Rathaus & Schillerplatz',
    lat: 48.7786,
    lon: 9.1798,
    approxRadiusMeters: 1500,
    recommendedLods: [17, 16, 15, 14, 13, 12],
  },
  {
    id: 'hauptbahnhof',
    name: 'Hauptbahnhof & Europaviertel',
    description: 'Central Station, Bonatzbau tower, Milaneo & new railway node',
    lat: 48.7838,
    lon: 9.1818,
    approxRadiusMeters: 1200,
    recommendedLods: [17, 16, 15, 14, 13, 12],
  },
  {
    id: 'fernsehturm',
    name: 'Fernsehturm Stuttgart (Degerloch)',
    description: 'First TV tower worldwide, Hoher Bopser & Waldau recreation area',
    lat: 48.7558,
    lon: 9.1902,
    approxRadiusMeters: 1200,
    recommendedLods: [17, 16, 15, 14, 13],
  },
  {
    id: 'cannstatt',
    name: 'Mercedes-Benz Museum & NeckarPark',
    description: 'Museum, MHPArena stadium, Wasen festival grounds & Untertürkheim',
    lat: 48.7900,
    lon: 9.2333,
    approxRadiusMeters: 2000,
    recommendedLods: [17, 16, 15, 14, 13, 12],
  },
  {
    id: 'all-stuttgart',
    name: 'Full Metropolitan Stuttgart (All LODs)',
    description: 'Complete city coverage from outer ring to center across all pyramid levels',
    lat: 48.7758,
    lon: 9.1829,
    approxRadiusMeters: 12000,
    recommendedLods: [17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6],
  },
];

export const LodCrawler: React.FC<LodCrawlerProps & { onCrawl: (depth: number, maxTiles: number, crawlAll?: boolean) => void }> = ({
  tiles,
  lodSummary,
  loading,
  onCrawl,
  onProceedToDownload,
}) => {
  const [crawlDepth, setCrawlDepth] = useState<number>(20);
  const [maxTilesLimit, setMaxTilesLimit] = useState<number>(2000);
  const [unlimitedTiles, setUnlimitedTiles] = useState<boolean>(true);
  const [selectedPreset, setSelectedPreset] = useState<string>('all-stuttgart');
  const [selectedLods, setSelectedLods] = useState<number[]>([17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
  const [filterQuery, setFilterQuery] = useState<string>('');

  const toggleLod = (lod: number) => {
    setSelectedLods((prev) =>
      prev.includes(lod) ? prev.filter((l) => l !== lod) : [...prev, lod].sort((a, b) => b - a)
    );
  };

  const selectAllLods = () => {
    setSelectedLods([17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
  };

  const handleApplyPreset = (preset: RegionPreset) => {
    setSelectedPreset(preset.id);
    setSelectedLods(preset.recommendedLods);
    if (preset.id === 'all-stuttgart') {
      setCrawlDepth(20);
      setUnlimitedTiles(true);
    } else {
      setCrawlDepth(15);
    }
  };

  // Filter tiles by search query
  const filteredTiles = tiles.filter((t) => {
    if (!filterQuery) return true;
    const q = filterQuery.toLowerCase();
    return (
      t.id.toLowerCase().includes(q) ||
      t.uri.toLowerCase().includes(q) ||
      t.lodName.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Top Header & Presets */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-6 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <FolderTree className="w-5 h-5 text-amber-400" />
              <h2 className="text-xl font-bold text-white">LOD Hierarchy Crawler & Discovery Engine</h2>
            </div>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Navigates the quadtree structure of 3d.stuttgart.de Mesh+ and discovers all tile layers from overview LOD 17 down to finest building level LOD 1.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => onCrawl(crawlDepth, unlimitedTiles ? 10000 : maxTilesLimit, unlimitedTiles)}
              disabled={loading}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-bold text-sm shadow-md transition-all cursor-pointer disabled:opacity-50"
            >
              <Search className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span>{loading ? 'Crawling All Tiles...' : 'Crawl ALL Available Tiles'}</span>
            </button>

            <button
              onClick={() => onProceedToDownload(selectedLods)}
              disabled={tiles.length === 0}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-md transition-all cursor-pointer disabled:opacity-50"
            >
              <Database className="w-4 h-4" />
              <span>Download & Convert Tiles ({tiles.length})</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Presets Selection */}
        <div className="pt-5">
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2.5 block flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-amber-400" />
            Focus Region Presets
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {REGION_PRESETS.map((p) => {
              const active = selectedPreset === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => handleApplyPreset(p)}
                  className={`text-left p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                    active
                      ? 'bg-amber-500/10 border-amber-500/50 shadow-sm'
                      : 'bg-slate-850/60 border-slate-800 hover:bg-slate-800/80 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-bold text-white text-xs sm:text-sm">{p.name}</span>
                    {active && <Check className="w-4 h-4 text-amber-400 shrink-0" />}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">{p.description}</p>
                  <div className="mt-2.5 flex items-center justify-between text-[10px] text-slate-500 font-mono">
                    <span>LODs: {p.recommendedLods.join(', ')}</span>
                    <span>~{p.approxRadiusMeters}m</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Crawl Parameters Slider / Inputs */}
        <div className="mt-6 pt-5 border-t border-slate-800 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-slate-300 font-medium">Traversal Quadtree Depth</span>
              <span className="text-amber-400 font-bold font-mono">Level {crawlDepth} (LOD 17 down to LOD {Math.max(1, 17 - crawlDepth * 3)})</span>
            </div>
            <input
              type="range"
              min="1"
              max="25"
              value={crawlDepth}
              onChange={(e) => setCrawlDepth(parseInt(e.target.value, 10))}
              className="w-full accent-amber-500 cursor-pointer"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Higher depth recursively follows sub-tileset JSONs to collect all street and building LODs.
            </p>
          </div>

          <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-slate-300 font-medium">Tile Discovery Limit</span>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={unlimitedTiles}
                  onChange={(e) => setUnlimitedTiles(e.target.checked)}
                  className="accent-amber-500 rounded"
                />
                <span className="text-xs text-amber-400 font-bold">No Limit (All Tiles)</span>
              </label>
            </div>
            {!unlimitedTiles && (
              <input
                type="range"
                min="50"
                max="5000"
                step="50"
                value={maxTilesLimit}
                onChange={(e) => setMaxTilesLimit(parseInt(e.target.value, 10))}
                className="w-full accent-amber-500 cursor-pointer"
              />
            )}
            <p className="text-[11px] text-slate-500 mt-1">
              {unlimitedTiles ? 'Extracts all available mesh tiles in the selected LOD levels.' : `Capped at ${maxTilesLimit} tiles.`}
            </p>
          </div>
        </div>
      </div>

      {/* LOD Pyramid Status & Distribution */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-amber-400" />
              <span>Available Levels of Detail (LOD Pyramid)</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Click individual LOD chips to filter which levels to convert into the OpenSceneGraph database.
            </p>
          </div>
          <button
            onClick={selectAllLods}
            className="text-xs text-amber-400 hover:text-amber-300 font-semibold px-2.5 py-1 rounded bg-amber-500/10 border border-amber-500/20 transition-colors"
          >
            Select All Available LODs
          </button>
        </div>

        {/* LOD Levels Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2.5">
          {[17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6].map((lod) => {
            const count = lodSummary[lod] || (tiles.filter((t) => t.lod === lod).length);
            const isSelected = selectedLods.includes(lod);
            const isAvailable = count > 0;

            return (
              <button
                key={lod}
                onClick={() => toggleLod(lod)}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer relative overflow-hidden ${
                  isSelected
                    ? 'bg-amber-500/15 border-amber-500/60 shadow-sm'
                    : isAvailable
                    ? 'bg-slate-850 border-slate-700 hover:bg-slate-800'
                    : 'bg-slate-950/40 border-slate-800/80 opacity-60'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white">LOD {lod}</span>
                  {isSelected && (
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                  )}
                </div>
                <div className="mt-1 text-xs font-mono text-slate-300">
                  {count > 0 ? `${count} tiles` : 'Discovered in tree'}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5 truncate">
                  {lod >= 15 ? 'Coarse overview' : lod >= 11 ? 'Intermediate' : 'Street-level fine'}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Discovered Tiles Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between flex-wrap gap-3 bg-slate-850/50">
          <div className="flex items-center gap-2">
            <FileCode className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-bold text-white">
              Discovered Mesh Tiles ({filteredTiles.length} of {tiles.length})
            </h3>
          </div>

          <div className="w-full sm:w-64">
            <input
              type="text"
              placeholder="Search tile or URI..."
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>
        </div>

        <div className="overflow-x-auto max-h-[380px]">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950 text-slate-400 uppercase font-mono text-[10px] sticky top-0 z-10 border-b border-slate-800">
              <tr>
                <th className="px-4 py-2.5">Tile ID</th>
                <th className="px-4 py-2.5">LOD</th>
                <th className="px-4 py-2.5">Relative Path (3d.stuttgart.de)</th>
                <th className="px-4 py-2.5">Geometric Error</th>
                <th className="px-4 py-2.5">Sub-tiles</th>
                <th className="px-4 py-2.5 text-right">Target OSG Node</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {filteredTiles.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    {loading ? 'Crawling Stuttgart 3D quadtree...' : 'No tiles discovered yet. Click "Scan / Refresh LODs" above.'}
                  </td>
                </tr>
              ) : (
                filteredTiles.map((tile) => (
                  <tr key={tile.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-2 text-white font-medium">{tile.id}</td>
                    <td className="px-4 py-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        {tile.lodName}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-slate-400 truncate max-w-[280px]" title={tile.uri}>
                      {tile.uri}
                    </td>
                    <td className="px-4 py-2 text-slate-400">
                      {tile.geometricError ? tile.geometricError.toFixed(1) : 'Root'}
                    </td>
                    <td className="px-4 py-2 text-slate-400">
                      {tile.hasChildren ? (
                        <span className="text-emerald-400 text-[11px]">Yes ({tile.childUris.length})</span>
                      ) : (
                        <span className="text-slate-600 text-[11px]">Leaf</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right text-amber-300">
                      osg::PagedLOD
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
