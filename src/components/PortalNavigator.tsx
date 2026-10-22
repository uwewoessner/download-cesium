import React from 'react';
import { Globe, Layers, ArrowRight, ShieldCheck, CheckCircle2, MapPin, Database, Cpu, ExternalLink, RefreshCw } from 'lucide-react';
import { PortalMetadata } from '../types/stuttgart';

interface PortalNavigatorProps {
  metadata: PortalMetadata | null;
  loading: boolean;
  onRefresh: () => void;
  onProceedToCrawler: () => void;
}

export const PortalNavigator: React.FC<PortalNavigatorProps> = ({
  metadata,
  loading,
  onRefresh,
  onProceedToCrawler,
}) => {
  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 border border-slate-800 p-6 sm:p-8 shadow-xl">
        <div className="absolute top-0 right-0 -mt-12 -mr-12 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 mb-3">
            <Globe className="w-3.5 h-3.5" />
            Official Geodata Portal • Stadtmessungsamt Stuttgart
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight leading-tight">
            Stuttgart 3D Mesh+ OpenSceneGraph Tiled Database
          </h1>
          <p className="mt-2 text-sm sm:text-base text-slate-300 leading-relaxed">
            Crawls the official photogrammetric reality mesh model of Stuttgart from{' '}
            <code className="px-1.5 py-0.5 rounded bg-slate-800 text-amber-300 text-xs font-mono">
              https://3d.stuttgart.de/
            </code>
            , extracts multi-resolution Levels of Detail (LOD 17 through LOD 6), and packages it into an{' '}
            <strong className="text-white">OpenSceneGraph PagedLOD database (.osg / .osgb)</strong> optimized for{' '}
            <strong className="text-amber-400">HLRS supercomputing, COVISE, and OpenCOVER</strong> virtual environments.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              onClick={onProceedToCrawler}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 font-bold text-sm shadow-lg shadow-amber-500/25 hover:from-amber-400 hover:to-yellow-400 transition-all cursor-pointer"
            >
              <Layers className="w-4 h-4" />
              <span>Explore LOD Hierarchy</span>
              <ArrowRight className="w-4 h-4 ml-0.5" />
            </button>

            <a
              href="https://3d.stuttgart.de/"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-sm font-medium border border-slate-700 transition-all"
            >
              <span>Open 3d.stuttgart.de in new tab</span>
              <ExternalLink className="w-4 h-4 text-slate-400" />
            </a>

            <button
              onClick={onRefresh}
              disabled={loading}
              className="inline-flex items-center gap-2 px-3 py-2.5 rounded-xl bg-slate-800/40 hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-sm transition-all border border-slate-800"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh Portal Info</span>
            </button>
          </div>
        </div>
      </div>

      {/* Grid: Portal Metadata & Architecture */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Card 1: Active Mesh Layer */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-amber-400" />
              Target 3D Layer
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
              <CheckCircle2 className="w-3 h-3" />
              Active
            </span>
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">
              {metadata?.meshLayer.name || 'Meshmodell_2025'}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">Category: Mesh+ / Photorealistic Oblique Imagery</p>
          </div>
          <div className="text-xs space-y-1.5 pt-2 border-t border-slate-800 font-mono text-slate-300">
            <div className="flex justify-between">
              <span className="text-slate-500">Layer ID:</span>
              <span className="truncate max-w-[170px]" title={metadata?.meshLayer.id}>
                {metadata?.meshLayer.id || '39000914-6732-4444...'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Source Format:</span>
              <span className="text-amber-400">Cesium 3D Tiles (b3dm)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Last Revision:</span>
              <span>{metadata?.meshLayer.revision || '2025-12-04 UTC'}</span>
            </div>
          </div>
        </div>

        {/* Card 2: Geospatial Coordinates & SRS */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-sky-400" />
              Geodetic Reference
            </span>
            <span className="text-[11px] font-medium text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded-full border border-sky-500/20">
              ECEF / WGS84
            </span>
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Stuttgart, Germany</h3>
            <p className="text-xs text-slate-400 mt-0.5">EPSG:4978 (Earth-Centered Earth-Fixed)</p>
          </div>
          <div className="text-xs space-y-1.5 pt-2 border-t border-slate-800 font-mono text-slate-300">
            <div className="flex justify-between">
              <span className="text-slate-500">Approx Lat / Lon:</span>
              <span>48.7758° N, 9.1829° E</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">ECEF Center X:</span>
              <span>4,157,592.11 m</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">ECEF Center Y/Z:</span>
              <span>671,928 / 4,774,289 m</span>
            </div>
          </div>
        </div>

        {/* Card 3: Target OSG Tiled Database Architecture */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-emerald-400" />
              OSG Tiled Database
            </span>
            <span className="text-[11px] font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
              osg::PagedLOD
            </span>
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">OpenSceneGraph (.osg / .osgb)</h3>
            <p className="text-xs text-slate-400 mt-0.5">Hierarchical Paged LOD Scene Graph</p>
          </div>
          <div className="text-xs space-y-1.5 pt-2 border-t border-slate-800 font-mono text-slate-300">
            <div className="flex justify-between">
              <span className="text-slate-500">Root Index:</span>
              <span className="text-amber-400">root.osg / root.osgb</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">LOD Range:</span>
              <span>LOD 17 (coarse) → LOD 6 (fine)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Texture Engine:</span>
              <span>osg::Texture2D (JPEG/PNG)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Live Portal Viewframe */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
        <div className="px-5 py-3.5 bg-slate-850 border-b border-slate-800 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500/80" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
            <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
            <span className="ml-2 text-xs font-mono text-slate-300">https://3d.stuttgart.de/</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Plexmap Viewer 8.0 • Stadtmessungsamt Stuttgart</span>
          </div>
        </div>

        <div className="relative w-full h-[460px] bg-slate-950">
          <iframe
            src="https://3d.stuttgart.de/"
            title="Stuttgart 3D Portal"
            className="w-full h-full border-0"
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          />
          <div className="absolute bottom-3 right-3 bg-slate-900/90 backdrop-blur-md border border-slate-700/80 px-3 py-2 rounded-xl text-xs text-slate-300 shadow-xl flex items-center gap-3">
            <div>
              <p className="font-semibold text-white">Live Stuttgart 3D Portal</p>
              <p className="text-[11px] text-slate-400">Click and drag inside to navigate Stuttgart 3D</p>
            </div>
            <button
              onClick={onProceedToCrawler}
              className="px-3 py-1.5 rounded-lg bg-amber-500 text-slate-950 font-bold hover:bg-amber-400 transition-colors text-xs cursor-pointer"
            >
              Scrape & Crawl LODs →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
