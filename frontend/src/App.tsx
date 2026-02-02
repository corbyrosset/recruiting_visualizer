import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
      ? <mark key={i} className="bg-yellow-200 dark:bg-yellow-600 px-0.5">{part}</mark>
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

  // Dark mode
  const [darkMode, setDarkMode] = useState(false);

  // Initialize dark mode from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('darkMode');
    if (saved === 'true') {
      setDarkMode(true);
    }
  }, []);

  // Sync dark mode class and localStorage
  useEffect(() => {
    localStorage.setItem('darkMode', String(darkMode));
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // Filtered candidates based on current filter (memoized to prevent infinite loops)
  const filteredCandidates = useMemo(() => {
    return candidates.filter(c => {
      if (filter === 'starred') return c.starred;
      if (filter === 'unviewed') return !c.viewed;
      if (filter === 'with_notes') return c.has_notes;
      return true;
    });
  }, [candidates, filter]);

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

  // Track if we're currently viewing a candidate (to prevent auto-advance)
  const isViewingRef = useRef(false);

  // Compute the current candidate ID to load
  const currentCandidateId = useMemo(() => {
    if (filteredCandidates.length === 0) return null;
    const clampedIndex = Math.min(currentIndex, filteredCandidates.length - 1);
    return filteredCandidates[clampedIndex]?.id ?? null;
  }, [currentIndex, filteredCandidates.length, filteredCandidates]);

  // Load current candidate when the ID changes (but not due to viewed status change)
  useEffect(() => {
    // Skip if we're in the middle of viewing (which causes the candidate to disappear from unviewed filter)
    if (isViewingRef.current) {
      isViewingRef.current = false;
      return;
    }
    if (currentCandidateId !== null && currentCandidateId !== currentCandidate?.id) {
      loadCandidate(currentCandidateId);
    }
  }, [currentCandidateId]);

  const loadCandidate = async (id: number) => {
    const res = await RecruitingAPI.getCandidate(id);
    if (res.status && res.data) {
      setCurrentCandidate(res.data);
      setEditingNotes(res.data.notes || '');
      // Update local state to reflect viewed status (only if changed)
      setCandidates(prev => {
        const candidate = prev.find(c => c.id === id);
        if (candidate && !candidate.viewed) {
          // Mark that we're updating viewed status - prevents auto-advance in unviewed filter
          isViewingRef.current = true;
          loadStats(); // Only reload stats if viewed status changed
          return prev.map(c => (c.id === id ? { ...c, viewed: true } : c));
        }
        return prev;
      });
    }
  };

  // Navigation
  const goNext = useCallback(() => {
    setCurrentIndex(i => Math.min(i + 1, filteredCandidates.length - 1));
  }, [filteredCandidates.length]);

  const goPrev = useCallback(() => {
    setCurrentIndex(i => Math.max(i - 1, 0));
  }, []);

  const goToCandidate = (id: number) => {
    // When coming from search, reset filter to 'all' and directly load the candidate
    if (searchResults) {
      setFilter('all');
      // Find index in full candidates list
      const idx = candidates.findIndex(c => c.id === id);
      if (idx !== -1) {
        setCurrentIndex(idx);
      }
      // Directly load the candidate to ensure it shows immediately
      loadCandidate(id);
    } else {
      const idx = filteredCandidates.findIndex(c => c.id === id);
      if (idx !== -1) {
        setCurrentIndex(idx);
      }
    }
  };

  const clearSearch = () => {
    setSearchResults(null);
    setSearchQuery('');
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

  // Star toggle with optimistic update
  const toggleStar = async () => {
    if (!currentCandidate) return;
    const newStarred = !currentCandidate.starred;

    // Optimistic update - update UI immediately
    setCurrentCandidate(prev => prev ? { ...prev, starred: newStarred } : null);
    setCandidates(prev =>
      prev.map(c => (c.id === currentCandidate.id ? { ...c, starred: newStarred } : c))
    );

    // Then sync with server
    const res = await RecruitingAPI.updateCandidate(currentCandidate.id, {
      starred: newStarred,
    });
    if (!res.status) {
      // Revert on failure
      setCurrentCandidate(prev => prev ? { ...prev, starred: !newStarred } : null);
      setCandidates(prev =>
        prev.map(c => (c.id === currentCandidate.id ? { ...c, starred: !newStarred } : c))
      );
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
      <div className={`flex items-center justify-center h-screen bg-gray-100 dark:bg-gray-900 ${darkMode ? 'dark' : ''}`}>
        <div className="text-xl text-gray-600 dark:text-gray-300">Loading candidates...</div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-100 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-semibold text-gray-800 dark:text-gray-100">Recruiting Visualizer</h1>
          {stats && (
            <div className="text-sm text-gray-500 dark:text-gray-400">
              <span className="text-green-600 dark:text-green-400">{stats.viewed}</span> viewed /{' '}
              <span className="text-yellow-600 dark:text-yellow-400">{stats.starred}</span> starred /{' '}
              <span>{stats.total}</span> total
            </div>
          )}
        </div>

        {/* Search and Filter */}
        <div className="flex items-center gap-4">
          {/* Dark mode toggle */}
          <button
            onClick={() => setDarkMode(!darkMode)}
            className="p-2 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {darkMode ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-600" viewBox="0 0 20 20" fill="currentColor">
                <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
              </svg>
            )}
          </button>

          {/* Filter dropdown */}
          <select
            value={filter}
            onChange={e => {
              setFilter(e.target.value as typeof filter);
              setCurrentIndex(0);
            }}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-gray-100"
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
              className="w-64 px-3 py-2 pr-8 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400"
              value={searchQuery}
              onChange={e => handleSearch(e.target.value)}
            />
            {isSearching && (
              <div className="absolute right-3 top-2.5 text-gray-400">...</div>
            )}
            {searchQuery && !isSearching && (
              <button
                onClick={clearSearch}
                className="absolute right-2 top-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                title="Clear search"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            )}
          </div>

          {/* Navigation */}
          <div className="flex items-center gap-2">
            <button
              onClick={goPrev}
              disabled={currentIndex === 0 || filteredCandidates.length === 0}
              className="px-3 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed dark:text-gray-100"
            >
              &#9664; Prev
            </button>
            <span className="text-gray-600 dark:text-gray-300 min-w-[80px] text-center">
              {filteredCandidates.length > 0 ? currentIndex + 1 : 0} / {filteredCandidates.length}
            </span>
            <button
              onClick={goNext}
              disabled={currentIndex === filteredCandidates.length - 1 || filteredCandidates.length === 0}
              className="px-3 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed dark:text-gray-100"
            >
              Next &#9654;
            </button>
          </div>
        </div>
      </header>

      {/* Search Results Overlay */}
      {searchResults && (
        <div className="bg-white dark:bg-gray-800 border-b dark:border-gray-700 shadow-sm px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600 dark:text-gray-300">
              {searchResults.length} results for "{searchQuery}"
            </span>
            <button
              onClick={clearSearch}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full p-1 transition-colors"
              title="Close search results"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
          <div className="max-h-60 overflow-y-auto">
            {searchResults.map(result => (
              <div
                key={result.id}
                onClick={() => goToCandidate(result.id)}
                className={`p-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer rounded border-b dark:border-gray-700 last:border-b-0 ${
                  currentCandidate?.id === result.id ? 'bg-blue-50 dark:bg-blue-900/30 border-l-2 border-l-blue-500' : ''
                }`}
              >
                <div className="flex items-center gap-2">
                  {result.starred && <span className="text-yellow-500">&#9733;</span>}
                  {result.viewed && <span className="text-green-500 text-xs">&#10003;</span>}
                  <span className="font-medium dark:text-gray-100">{highlightMatch(result.full_name, searchQuery)}</span>
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-300">{highlightMatch(result.title, searchQuery)}</div>
                {result.experience_text && (
                  <div className="text-xs text-gray-500 dark:text-gray-400">{highlightMatch(result.experience_text, searchQuery)}</div>
                )}
                {result.education_text && (
                  <div className="text-xs text-gray-500 dark:text-gray-400">{highlightMatch(result.education_text, searchQuery)}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Content - Split View */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - PDF Viewer */}
        <div className="w-1/2 bg-gray-200 dark:bg-gray-800 border-r dark:border-gray-700">
          {currentCandidate ? (
            <object
              key={currentCandidate.id}
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
            <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
              {filteredCandidates.length === 0 ? `No ${filter} candidates` : 'Select a candidate to view resume'}
            </div>
          )}
        </div>

        {/* Right Panel - Candidate Info */}
        <div className="w-1/2 overflow-y-auto p-6 bg-white dark:bg-gray-900">
          {currentCandidate ? (
            <div className="space-y-6">
              {/* Header with Star and Viewed */}
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-gray-800 dark:text-white">
                    {currentCandidate.full_name}
                  </h2>
                  <p className="text-gray-600 dark:text-gray-300">{currentCandidate.title}</p>
                  {currentCandidate.primary_email && (
                    <a
                      href={`mailto:${currentCandidate.primary_email}`}
                      title={`Send email to ${currentCandidate.primary_email}`}
                      className="text-blue-600 dark:text-blue-400 hover:underline text-sm relative group"
                    >
                      {currentCandidate.primary_email}
                      <span className="absolute bottom-full left-0 mb-2 px-2 py-1 bg-gray-800 dark:bg-gray-600 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                        Click to send email
                      </span>
                    </a>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={toggleStar}
                    className={`text-3xl ${
                      currentCandidate.starred ? 'text-yellow-500' : 'text-gray-300 dark:text-gray-600'
                    } hover:text-yellow-500 transition-colors`}
                    title={currentCandidate.starred ? 'Unstar' : 'Star'}
                  >
                    {currentCandidate.starred ? '★' : '☆'}
                  </button>
                  {currentCandidate.viewed && (
                    <span className="text-green-600 dark:text-green-400 text-sm font-medium">✓ Viewed</span>
                  )}
                </div>
              </div>

              {/* Links */}
              {(currentCandidate.linkedin_url || displayUrls.length > 0) && (
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase">Links</h3>
                  <div className="flex flex-wrap gap-3">
                    {currentCandidate.linkedin_url && (
                      <a
                        href={currentCandidate.linkedin_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={currentCandidate.linkedin_url}
                        className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 relative group"
                      >
                        <span>LinkedIn</span>
                        <span className="text-xs">↗</span>
                        <span className="absolute top-full left-0 mt-1 px-2 py-1 bg-gray-800 dark:bg-gray-600 text-white text-xs rounded hidden group-hover:block whitespace-nowrap max-w-xs truncate z-50 shadow-lg">
                          {currentCandidate.linkedin_url}
                        </span>
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
                          title={url}
                          className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 relative group"
                        >
                          <span>{label}</span>
                          <span className="text-xs">↗</span>
                          <span className="absolute top-full left-0 mt-1 px-2 py-1 bg-gray-800 dark:bg-gray-600 text-white text-xs rounded hidden group-hover:block whitespace-nowrap max-w-xs truncate z-50 shadow-lg">
                            {url}
                          </span>
                        </a>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Experience */}
              {experience.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">
                    Experience
                  </h3>
                  <div className="space-y-3">
                    {experience.map((exp, i) => (
                      <div key={i} className="border-l-2 border-gray-300 dark:border-gray-600 pl-3">
                        <div className="font-medium text-gray-800 dark:text-white">{exp.title}</div>
                        <div className="text-gray-600 dark:text-gray-300">{exp.work}</div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">
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
                  <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">
                    Education
                  </h3>
                  <div className="space-y-3">
                    {education.map((edu, i) => (
                      <div key={i} className="border-l-2 border-gray-300 dark:border-gray-600 pl-3">
                        <div className="font-medium text-gray-800 dark:text-white">
                          {edu.degree} {edu.major && `in ${edu.major}`}
                        </div>
                        <div className="text-gray-600 dark:text-gray-300">{edu.school}</div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          {formatDateRange(edu.time)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes */}
              <div>
                <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">
                  Notes
                </h3>
                <textarea
                  value={editingNotes}
                  onChange={e => handleNotesChange(e.target.value)}
                  placeholder="Add notes about this candidate..."
                  className="w-full h-32 p-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none bg-white dark:bg-gray-800 dark:text-white dark:placeholder-gray-500"
                />
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
              {filteredCandidates.length === 0 ? `No ${filter} candidates` : 'No candidate selected'}
            </div>
          )}
        </div>
      </div>

      {/* Footer with keyboard shortcuts hint */}
      <footer className="bg-white dark:bg-gray-800 border-t dark:border-gray-700 px-4 py-2 text-xs text-gray-500 dark:text-gray-400 flex justify-between">
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
