import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { PortalNavigator } from './components/PortalNavigator';
import { LodCrawler } from './components/LodCrawler';
import { DownloadManager } from './components/DownloadManager';
import { ThreeViewer } from './components/ThreeViewer';
import { HpcClusterScripts } from './components/HpcClusterScripts';
import { PortalMetadata, TileNode, ConvertedTileResult } from './types/stuttgart';
import { parseB3dmAndConvertToOsg } from './utils/b3dmToOsg';

export default function App() {
  const [activeTab, setActiveTab] = useState<'portal' | 'crawler' | 'download' | 'viewer' | 'scripts'>('portal');
  const [metadata, setMetadata] = useState<PortalMetadata | null>(null);
  const [portalConnected, setPortalConnected] = useState<boolean>(false);
  const [tiles, setTiles] = useState<TileNode[]>([]);
  const [lodSummary, setLodSummary] = useState<Record<number, number>>({});
  const [selectedLods, setSelectedLods] = useState<number[]>([17, 16, 15, 14, 13]);
  const [convertedTiles, setConvertedTiles] = useState<ConvertedTileResult[]>([]);
  const [selectedTile, setSelectedTile] = useState<ConvertedTileResult | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  // Fetch Stuttgart portal config on load
  const fetchPortalConfig = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/stuttgart/config');
      if (res.ok) {
        const data = await res.json();
        setMetadata(data);
        setPortalConnected(true);
      }
    } catch (err) {
      console.error('Error fetching portal config:', err);
    } finally {
      setLoading(false);
    }
  };

  // Crawl LOD hierarchy
  const crawlLods = async (depth: number = 5, maxTiles: number = 2000, crawlAll: boolean = true) => {
    try {
      setLoading(true);
      const res = await fetch('/api/stuttgart/crawl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxDepth: depth, maxTiles, crawlAll }),
      });
      if (res.ok) {
        const data = await res.json();
        setTiles(data.tiles || []);
        setLodSummary(data.lodSummary || {});
        // Automatically select all discovered LODs
        if (data.lodSummary) {
          const lodKeys = Object.keys(data.lodSummary).map(Number).sort((a, b) => b - a);
          setSelectedLods(lodKeys);
        }
      }
    } catch (err) {
      console.error('Error crawling LODs:', err);
    } finally {
      setLoading(false);
    }
  };

  // Pre-load overview root tile for instant 3D rendering
  const preloadRootTile = async () => {
    try {
      const res = await fetch('/api/stuttgart/proxy/L17/IR/0491_5353_-001_lv17_0.b3dm');
      if (res.ok) {
        const buffer = await res.arrayBuffer();
        const converted = parseB3dmAndConvertToOsg(
          buffer,
          'tile_root_lv17',
          17,
          'L17/IR/0491_5353_-001_lv17_0.b3dm',
          'osg'
        );
        setConvertedTiles((prev) => {
          if (prev.some((t) => t.tileId === converted.tileId)) return prev;
          return [converted, ...prev];
        });
        setSelectedTile(converted);
      }
    } catch (err) {
      console.warn('Could not preload root tile:', err);
    }
  };

  useEffect(() => {
    fetchPortalConfig();
    crawlLods(20, 2500, true);
    preloadRootTile();
  }, []);

  const handleTileConverted = (result: ConvertedTileResult) => {
    setConvertedTiles((prev) => {
      const index = prev.findIndex((t) => t.tileId === result.tileId);
      if (index >= 0) {
        const copy = [...prev];
        copy[index] = result;
        return copy;
      }
      return [...prev, result];
    });
    if (!selectedTile) {
      setSelectedTile(result);
    }
  };

  const handlePreviewTile = (tile: ConvertedTileResult) => {
    setSelectedTile(tile);
    setActiveTab('viewer');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-amber-500 selection:text-slate-950">
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        portalConnected={portalConnected}
        totalTilesFound={tiles.length}
        downloadedCount={convertedTiles.length}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {activeTab === 'portal' && (
          <PortalNavigator
            metadata={metadata}
            loading={loading}
            onRefresh={fetchPortalConfig}
            onProceedToCrawler={() => setActiveTab('crawler')}
          />
        )}

        {activeTab === 'crawler' && (
          <LodCrawler
            tiles={tiles}
            lodSummary={lodSummary}
            loading={loading}
            onCrawl={crawlLods}
            onProceedToDownload={(lods) => {
              setSelectedLods(lods);
              setActiveTab('download');
            }}
          />
        )}

        {activeTab === 'download' && (
          <DownloadManager
            tiles={tiles}
            selectedLods={selectedLods}
            convertedTiles={convertedTiles}
            onTileConverted={handleTileConverted}
            onPreviewTile={handlePreviewTile}
          />
        )}

        {activeTab === 'viewer' && (
          <ThreeViewer
            tile={selectedTile}
            allTiles={convertedTiles}
            onSelectTile={setSelectedTile}
          />
        )}

        {activeTab === 'scripts' && <HpcClusterScripts />}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-900/60 py-4 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div>
            Data Source:{' '}
            <a
              href="https://3d.stuttgart.de/"
              target="_blank"
              rel="noreferrer"
              className="text-amber-400 hover:underline"
            >
              Landeshauptstadt Stuttgart (Stadtmessungsamt)
            </a>{' '}
            • OpenSceneGraph PagedLOD (.osg / .osgb) Generator
          </div>
          <div className="flex items-center gap-4">
            <span>EPSG:4978 (ECEF)</span>
            <span>•</span>
            <span className="text-amber-400/90 font-medium">HLRS / COVISE / OpenCOVER Compatible</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
