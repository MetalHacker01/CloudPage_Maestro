# CloudPage Maestro - Chrome Extension Deployment Plan

## Overview
Port complete Tampermonkey v5 functionality to Chrome Extension with exact look, feel, and features.

---

## ✅ STEP 1: Core Infrastructure Setup
**Goal:** Set up request queue, enrichment cache, token system, and 6-second delay

**What this includes:**
- Request queue (max 10 concurrent)
- Enrichment cache with 5-minute TTL
- Dual token system (pageHook + appcore)
- 6-second initialization delay
- Stack detection
- Token capture from DOM + network requests

**Files to modify:**
- `content_full.js` - Add infrastructure at top

**Testing checklist:**
- [ ] Extension loads after 6 seconds
- [ ] Both tokens captured and stored
- [ ] Console shows stack detected
- [ ] No errors in console

---

## ✅ STEP 2: Complete UI Structure & Styling
**Goal:** Create exact UI from Tampermonkey with all visual elements

**What this includes:**
- Full panel with header, stats dashboard, filters, table
- All Iconoir SVG icons from Tampermonkey
- Exact CSS styling (colors, fonts, spacing)
- Search bar with debounce
- Pagination controls
- Batch action buttons
- Loading states
- Toast notifications
- Tooltips

**Files to modify:**
- `content_full.js` - Replace createUI() with full Tampermonkey version

**Testing checklist:**
- [ ] Panel looks identical to Tampermonkey
- [ ] All buttons and icons visible
- [ ] Stats cards display correctly
- [ ] Filter buttons styled properly
- [ ] Table header matches Tampermonkey
- [ ] Pagination controls present

---

## ✅ STEP 3: Data Fetching Logic
**Goal:** Implement all API endpoints and data loading functions

**What this includes:**
- `fetchLandingPages()` - GET endpoint for landing pages
- `fetchAssetsWithQuery()` - POST endpoint with query building
- `buildSearchOrTree()` - Search query with boost scoring
- `loadAllDataForFiltering()` - Load all data for client-side filtering
- `performEnhancedSearch()` - Search mode pagination
- Category fetching and tree building

**Files to modify:**
- `content_full.js` - Add/update all fetch functions

**Testing checklist:**
- [ ] Landing pages fetch successfully
- [ ] Assets fetch successfully
- [ ] Total counts match Tampermonkey
- [ ] Category tree builds correctly
- [ ] Search returns results
- [ ] Console shows data loading progress

---

## ✅ STEP 4: Table Rendering & Pagination
**Goal:** Display data with all columns, sorting, and pagination

**What this includes:**
- Complete table with all 8 columns:
  - Checkbox
  - Name
  - Type (with colored icons)
  - Status (with badges)
  - Folder path
  - Modified date
  - Actions (copy, open, unpublish, download)
  - Select checkbox
- Client-side sorting by modified date
- Pagination (100 items/page normal, 20 in search)
- Page numbers with smart truncation
- Item count display

**Files to modify:**
- `content_full.js` - Update renderTable() and renderPagination()

**Testing checklist:**
- [ ] All 8 columns display correctly
- [ ] Type icons show with correct colors
- [ ] Status badges styled properly
- [ ] Folder paths display
- [ ] Modified dates show
- [ ] Pagination works (prev/next/numbers)
- [ ] Page size matches mode (100 vs 20)

---

## ✅ STEP 5: Stats Dashboard & Filters
**Goal:** Live stats and working filter buttons

**What this includes:**
- Stats cards: Total, Landing Pages, Published, Unpublished, Draft, JSON, JS, CSS
- Filter buttons: All, Published, Unpublished, Draft, Landing Pages, JSON, JS, CSS
- Active filter highlighting
- Stats update on data load
- Filter changes update table

**Files to modify:**
- `content_full.js` - Update updateStats() and filter event listeners

**Testing checklist:**
- [ ] All 8 stat cards show correct counts
- [ ] Stats update when data loads
- [ ] Filter buttons highlight when active
- [ ] Clicking filter updates table
- [ ] Counts match filtered items

---

## ✅ STEP 6: Core Actions (Unpublish, Copy, Open, Download)
**Goal:** Implement all row-level and batch actions

**What this includes:**
- Copy URL to clipboard
- Open in new tab
- Unpublish single page
- Batch unpublish selected pages
- Download HTML (for landing pages)
- Download JSON/JS/CSS (for code resources)
- Select all checkbox
- Batch action bar

**Files to modify:**
- `content_full.js` - Add action handlers and unpublish logic

**Testing checklist:**
- [ ] Copy URL works
- [ ] Open in new tab works
- [ ] Unpublish single page works
- [ ] Select multiple items works
- [ ] Batch unpublish works
- [ ] Download HTML works
- [ ] Download code resources works
- [ ] Batch action bar shows selection count

---

## ✅ STEP 7: Search Functionality
**Goal:** Full-text search with boost scoring and search-mode pagination

**What this includes:**
- Search input with debounce
- Search query building with boost scores:
  - Name: 50
  - Subject line: 50
  - Content: 5
  - Description: 3
  - Filename: 2
  - Customer key: 1
- Search mode (20 items/page)
- Preserve search relevance order (no re-sorting)
- Clear search button
- Search term highlighting

**Files to modify:**
- `content_full.js` - Add search handlers and query building

**Testing checklist:**
- [ ] Search input appears
- [ ] Typing triggers search (debounced)
- [ ] Results match search term
- [ ] Most relevant items appear first
- [ ] Pagination shows 20 items/page in search
- [ ] Clear search returns to normal mode

---

## ✅ STEP 8: Lazy Enrichment & Caching
**Goal:** Performance optimization with lazy enrichment of visible items only

**What this includes:**
- Enrichment cache (5-minute TTL)
- Request queue for max 10 concurrent requests
- Session tracking to cancel stale enrichments
- Progressive rendering (batches of 5)
- Lazy enrichment of visible items only
- Status/URL enrichment from CloudPages API
- Tooltip with enhanced metadata

**Files to modify:**
- `content_full.js` - Add enrichment logic

**Testing checklist:**
- [ ] Only visible items enriched
- [ ] Cache prevents duplicate requests
- [ ] Max 10 concurrent requests
- [ ] Progressive rendering updates table
- [ ] Tooltips show on hover
- [ ] Status badges update after enrichment

---

## ✅ STEP 9: Export CSV & Final Polish
**Goal:** CSV export and final touches

**What this includes:**
- Export all items to CSV with columns:
  - Name, Type, Status, Folder, Modified Date, Created Date, Modified By, URL
- Export visible/filtered items only option
- Refresh button
- Token status indicators
- Panel minimize/maximize
- Draggable panel
- Error handling and user feedback

**Files to modify:**
- `content_full.js` - Add CSV export and polish

**Testing checklist:**
- [ ] Export CSV works
- [ ] CSV contains all expected columns
- [ ] Refresh button reloads data
- [ ] Token indicators show status
- [ ] Panel can be minimized
- [ ] Panel is draggable
- [ ] Error messages display properly
- [ ] All features work together

---

## 🎯 Final Acceptance Testing
**Goal:** Verify exact parity with Tampermonkey v5

**Complete feature comparison:**
- [ ] Visual appearance identical
- [ ] All stats match
- [ ] All filters work the same
- [ ] Search behaves identically
- [ ] Pagination matches
- [ ] All actions work
- [ ] Performance similar (lazy loading, caching)
- [ ] No console errors
- [ ] Handles large datasets (100+ pages)

---

## Current Status
- ✅ Basic version working (50 items, basic table)
- ⏳ Ready to deploy Step 1

## Next Step
**STEP 1: Core Infrastructure Setup**

Type "deploy step 1" when ready to proceed.
