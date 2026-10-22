import React from 'react';
import { Globe, Layers, Download, Eye, Terminal, CheckCircle2, ExternalLink } from 'lucide-react';

interface HeaderProps {
  activeTab: 'portal' | 'crawler' | 'download' | 'viewer' | 'scripts';
  setActiveTab: (tab: 'portal' | 'crawler' | 'download' | 'viewer' | 'scripts') => void;
  portalConnected: boolean;
  totalTilesFound: number;
  downloadedCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  portalConnected,
  totalTilesFound,
  downloadedCount,
}) => {
  return (
    <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-30 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Brand */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-yellow-600 flex items-center justify-center shadow-lg shadow-amber-500/20 text-slate-950 font-bold text-lg">
              3D
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-white text-base tracking-tight">Stuttgart 3D Mesh+</span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                  OSG Database
                </span>
                <span className="hidden md:inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  HLRS / COVISE Ready
                </span>
              </div>
              <p className="text-xs text-slate-400 flex items-center gap-1.5">
                <span>Source:</span>
                <a
                  href="https://3d.stuttgart.de/"
                  target="_blank"
                  rel="noreferrer"
                  className="text-amber-400 hover:text-amber-300 inline-flex items-center gap-0.5 transition-colors"
                >
                  3d.stuttgart.de
                  <ExternalLink className="w-3 h-3" />
                </a>
                <span className="text-slate-600">•</span>
                <span className="inline-flex items-center gap-1">
                  <span className={`w-2 h-2 rounded-full ${portalConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                  <span className="text-[11px] text-slate-400">{portalConnected ? 'Portal Online' : 'Connecting...'}</span>
                </span>
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex items-center gap-1 bg-slate-950/70 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setActiveTab('portal')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'portal'
                  ? 'bg-amber-500 text-slate-950 font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>Portal</span>
            </button>

            <button
              onClick={() => setActiveTab('crawler')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'crawler'
                  ? 'bg-amber-500 text-slate-950 font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>LOD Crawler</span>
              {totalTilesFound > 0 && (
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  activeTab === 'crawler' ? 'bg-slate-950 text-amber-400' : 'bg-slate-800 text-slate-300'
                }`}>
                  {totalTilesFound}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('download')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'download'
                  ? 'bg-amber-500 text-slate-950 font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download & OSG DB</span>
              {downloadedCount > 0 && (
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  activeTab === 'download' ? 'bg-slate-950 text-emerald-400' : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                }`}>
                  {downloadedCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('viewer')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'viewer'
                  ? 'bg-amber-500 text-slate-950 font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>3D Preview</span>
            </button>

            <button
              onClick={() => setActiveTab('scripts')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'scripts'
                  ? 'bg-amber-500 text-slate-950 font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">HPC Scripts</span>
              <span className="sm:hidden">HPC</span>
            </button>
          </nav>
        </div>
      </div>
    </header>
  );
};
