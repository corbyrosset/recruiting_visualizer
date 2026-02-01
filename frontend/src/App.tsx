import { useState, useEffect, useCallback, useRef } from 'react';
import {
  RecruitingAPI,
  Candidate,
  CandidateSummary,
  SearchResult,
  Stats,
  parseExperience,
  parseEducation,
  parseDisplayUrls,
  formatDateRange,
} from './api';

// Highlight matching whole words in a string
function highlightMatch(text: string | null, query: string): React.ReactNode {
  if (!text || !query) return text;

  // Use word boundary matching
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`\\b(${escaped})\\b`, 'gi');
  const parts = text.split(regex);

  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase()
      ? <mark key={i} className="bg-yellow-200 px-0.5">{part}</mark>
      : part
  );
}

function App() {
  // Candidates list and navigation
  const [candidates, setCandidates] = useState<CandidateSummary[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentCandidate, setCurrentCandidate] = useState<Candidate | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);

  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  // Filter
  const [filter, setFilter] = useState<'all' | 'starred' | 'unviewed' | 'with_notes'>('all');

  // Notes editing
  const [editingNotes, setEditingNotes] = useState('');
  const notesTimeoutRef = useRef<number | null>(null);

  // Loading states
  const [loading, setLoading] = useState(true);

  // Filtered candidates based on current filter
  const filteredCandidates = candidates.filter(c => {
    if (filter === 'starred') return c.starred;
    if (filter === 'unviewed') return !c.viewed;
    if (filter === 'with_notes') return c.has_notes;
    return true;
  });

  // Load candidates list on mount
  useEffect(() => {
    loadCandidates();
    loadStats();
  }, []);

  const loadCandidates = async () => {
    const res = await RecruitingAPI.getCandidates();
    if (res.status && res.data) {
      setCandidates(res.data.candidates);
      setLoading(false);
    }
  };

  const loadStats = async () => {
    const res = await RecruitingAPI.getStats();
    if (res.status && res.data) {
      setStats(res.data);
    }
  };

  // Load current candidate when index changes
  useEffect(() => {
    if (filteredCandidates.length > 0 && !searchResults) {
      // Clamp index to filtered list bounds
      const clampedIndex = Math.min(currentIndex, filteredCandidates.length - 1);
      if (clampedIndex !== currentIndex) {
        setCurrentIndex(clampedIndex);
      } else {
        loadCandidate(filteredCandidates[clampedIndex].id);
      }
    }
  }, [currentIndex, filteredCandidates, searchResults]);

  const loadCandidate = async (id: number) => {
    const res = await RecruitingAPI.getCandidate(id);
    if (res.status && res.data) {
      setCurrentCandidate(res.data);
      setEditingNotes(res.data.notes || '');
      // Update local state to reflect viewed status
      setCandidates(prev =>
        prev.map(c => (c.id === id ? { ...c, viewed: true } : c))
      );
      loadStats();
    }
  };

  // Navigation
  const goNext = useCallback(() => {
    if (searchResults) {
      setSearchResults(null);
      setSearchQuery('');
    }
    setCurrentIndex(i => Math.min(i + 1, filteredCandidates.length - 1));
  }, [filteredCandidates.length, searchResults]);

  const goPrev = useCallback(() => {
    if (searchResults) {
      setSearchResults(null);
      setSearchQuery('');
    }
    setCurrentIndex(i => Math.max(i - 1, 0));
  }, [searchResults]);

  const goToCandidate = (id: number) => {
    const idx = filteredCandidates.findIndex(c => c.id === id);
    if (idx !== -1) {
      setCurrentIndex(idx);
      setSearchResults(null);
      setSearchQuery('');
    }
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't navigate if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.key === 'ArrowRight' || e.key === 'j') {
        goNext();
      } else if (e.key === 'ArrowLeft' || e.key === 'k') {
        goPrev();
      } else if (e.key === 's' && !e.ctrlKey && !e.metaKey) {
        toggleStar();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goNext, goPrev, currentCandidate]);

  // Star toggle
  const toggleStar = async () => {
    if (!currentCandidate) return;
    const res = await RecruitingAPI.updateCandidate(currentCandidate.id, {
      starred: !currentCandidate.starred,
    });
    if (res.status && res.data) {
      setCurrentCandidate(res.data);
      setCandidates(prev =>
        prev.map(c => (c.id === res.data!.id ? { ...c, starred: res.data!.starred } : c))
      );
      loadStats();
    }
  };

  // Notes auto-save
  const saveNotes = async (notes: string) => {
    if (!currentCandidate) return;
    const res = await RecruitingAPI.updateCandidate(currentCandidate.id, { notes });
    if (res.status && res.data) {
      setCurrentCandidate(res.data);
      setCandidates(prev =>
        prev.map(c => (c.id === res.data!.id ? { ...c, has_notes: !!notes } : c))
      );
    }
  };

  const handleNotesChange = (value: string) => {
    setEditingNotes(value);
    // Debounce save
    if (notesTimeoutRef.current) {
      clearTimeout(notesTimeoutRef.current);
    }
    notesTimeoutRef.current = window.setTimeout(() => {
      saveNotes(value);
    }, 1000);
  };

  // Search
  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (!query.trim()) {
      setSearchResults(null);
      return;
    }
    setIsSearching(true);
    const res = await RecruitingAPI.search(query);
    if (res.status && res.data) {
      setSearchResults(res.data.candidates);
    }
    setIsSearching(false);
  };

  // Render helpers
  const experience = currentCandidate ? parseExperience(currentCandidate) : [];
  const education = currentCandidate ? parseEducation(currentCandidate) : [];
  const displayUrls = currentCandidate ? parseDisplayUrls(currentCandidate) : [];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-100">
        <div className="text-xl text-gray-600">Loading candidates...</div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow-sm px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-semibold text-gray-800">Recruiting Visualizer</h1>
          {stats && (
            <div className="text-sm text-gray-500">
              <span className="text-green-600">{stats.viewed}</span> viewed /{' '}
              <span className="text-yellow-600">{stats.starred}</span> starred /{' '}
              <span>{stats.total}</span> total
            </div>
          )}
        </div>

        {/* Search and Filter */}
        <div className="flex items-center gap-4">
          {/* Filter dropdown */}
          <select
            value={filter}
            onChange={e => {
              setFilter(e.target.value as typeof filter);
              setCurrentIndex(0);
            }}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="all">All ({candidates.length})</option>
            <option value="starred">Starred ({candidates.filter(c => c.starred).length})</option>
            <option value="unviewed">Unviewed ({candidates.filter(c => !c.viewed).length})</option>
            <option value="with_notes">With Notes ({candidates.filter(c => c.has_notes).length})</option>
          </select>

          <div className="relative">
            <input
              type="text"
              placeholder="Search candidates..."
              className="w-64 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={searchQuery}
              onChange={e => handleSearch(e.target.value)}
            />
            {isSearching && (
              <div className="absolute right-3 top-2.5 text-gray-400">...</div>
            )}
          </div>

          {/* Navigation */}
          <div className="flex items-center gap-2">
            <button
              onClick={goPrev}
              disabled={currentIndex === 0 || filteredCandidates.length === 0}
              className="px-3 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              &#9664; Prev
            </button>
            <span className="text-gray-600 min-w-[80px] text-center">
              {filteredCandidates.length > 0 ? currentIndex + 1 : 0} / {filteredCandidates.length}
            </span>
            <button
              onClick={goNext}
              disabled={currentIndex === filteredCandidates.length - 1 || filteredCandidates.length === 0}
              className="px-3 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next &#9654;
            </button>
          </div>
        </div>
      </header>

      {/* Search Results Overlay */}
      {searchResults && (
        <div className="bg-white border-b shadow-sm px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">
              {searchResults.length} results for "{searchQuery}"
            </span>
            <button
              onClick={() => {
                setSearchResults(null);
                setSearchQuery('');
              }}
              className="text-sm text-blue-600 hover:underline"
            >
              Clear search
            </button>
          </div>
          <div className="max-h-60 overflow-y-auto">
            {searchResults.map(result => (
              <div
                key={result.id}
                onClick={() => goToCandidate(result.id)}
                className="p-2 hover:bg-gray-50 cursor-pointer rounded border-b last:border-b-0"
              >
                <div className="flex items-center gap-2">
                  {result.starred && <span className="text-yellow-500">&#9733;</span>}
                  {result.viewed && <span className="text-green-500 text-xs">&#10003;</span>}
                  <span className="font-medium">{highlightMatch(result.full_name, searchQuery)}</span>
                </div>
                <div className="text-sm text-gray-600">{highlightMatch(result.title, searchQuery)}</div>
                {result.experience_text && (
                  <div className="text-xs text-gray-500">{highlightMatch(result.experience_text, searchQuery)}</div>
                )}
                {result.education_text && (
                  <div className="text-xs text-gray-500">{highlightMatch(result.education_text, searchQuery)}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Content - Split View */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - PDF Viewer */}
        <div className="w-1/2 bg-gray-200 border-r">
          {currentCandidate ? (
            <object
              data={RecruitingAPI.getResumeUrl(currentCandidate.id)}
              type="application/pdf"
              className="w-full h-full"
            >
              <embed
                src={RecruitingAPI.getResumeUrl(currentCandidate.id)}
                type="application/pdf"
                className="w-full h-full"
              />
            </object>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500">
              {filteredCandidates.length === 0 ? `No ${filter} candidates` : 'Select a candidate to view resume'}
            </div>
          )}
        </div>

        {/* Right Panel - Candidate Info */}
        <div className="w-1/2 overflow-y-auto p-6">
          {currentCandidate ? (
            <div className="space-y-6">
              {/* Header with Star and Viewed */}
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-gray-800">
                    {currentCandidate.full_name}
                  </h2>
                  <p className="text-gray-600">{currentCandidate.title}</p>
                  {currentCandidate.primary_email && (
                    <a
                      href={`mailto:${currentCandidate.primary_email}`}
                      className="text-blue-600 hover:underline text-sm"
                    >
                      {currentCandidate.primary_email}
                    </a>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={toggleStar}
                    className={`text-3xl ${
                      currentCandidate.starred ? 'text-yellow-500' : 'text-gray-300'
                    } hover:text-yellow-500 transition-colors`}
                    title={currentCandidate.starred ? 'Unstar' : 'Star'}
                  >
                    {currentCandidate.starred ? '★' : '☆'}
                  </button>
                  {currentCandidate.viewed && (
                    <span className="text-green-600 text-sm font-medium">✓ Viewed</span>
                  )}
                </div>
              </div>

              {/* Links */}
              {(currentCandidate.linkedin_url || displayUrls.length > 0) && (
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-gray-500 uppercase">Links</h3>
                  <div className="flex flex-wrap gap-3">
                    {currentCandidate.linkedin_url && (
                      <a
                        href={currentCandidate.linkedin_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline flex items-center gap-1"
                      >
                        <span>LinkedIn</span>
                        <span className="text-xs">↗</span>
                      </a>
                    )}
                    {displayUrls.map((url, i) => {
                      // Skip if same as linkedin
                      if (url === currentCandidate.linkedin_url) return null;
                      // Determine label from URL
                      let label = 'Link';
                      if (url.includes('github.com')) label = 'GitHub';
                      else if (url.includes('twitter.com') || url.includes('x.com')) label = 'Twitter';
                      else if (url.includes('scholar.google')) label = 'Scholar';
                      return (
                        <a
                          key={i}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline flex items-center gap-1"
                        >
                          <span>{label}</span>
                          <span className="text-xs">↗</span>
                        </a>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Experience */}
              {experience.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">
                    Experience
                  </h3>
                  <div className="space-y-3">
                    {experience.map((exp, i) => (
                      <div key={i} className="border-l-2 border-gray-300 pl-3">
                        <div className="font-medium text-gray-800">{exp.title}</div>
                        <div className="text-gray-600">{exp.work}</div>
                        <div className="text-sm text-gray-500">
                          {formatDateRange(exp.time)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Education */}
              {education.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">
                    Education
                  </h3>
                  <div className="space-y-3">
                    {education.map((edu, i) => (
                      <div key={i} className="border-l-2 border-gray-300 pl-3">
                        <div className="font-medium text-gray-800">
                          {edu.degree} {edu.major && `in ${edu.major}`}
                        </div>
                        <div className="text-gray-600">{edu.school}</div>
                        <div className="text-sm text-gray-500">
                          {formatDateRange(edu.time)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes */}
              <div>
                <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">
                  Notes
                </h3>
                <textarea
                  value={editingNotes}
                  onChange={e => handleNotesChange(e.target.value)}
                  placeholder="Add notes about this candidate..."
                  className="w-full h-32 p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500">
              {filteredCandidates.length === 0 ? `No ${filter} candidates` : 'No candidate selected'}
            </div>
          )}
        </div>
      </div>

      {/* Footer with keyboard shortcuts hint */}
      <footer className="bg-white border-t px-4 py-2 text-xs text-gray-500 flex justify-between">
        <span>
          Keyboard: ← → or j k to navigate | s to star
        </span>
        <span>
          {currentCandidate?.folder_name}
        </span>
      </footer>
    </div>
  );
}

export default App;
