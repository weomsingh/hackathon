# Financial Forensics Engine — Money Muling Detection System

## Live Demo
[TO BE ADDED BY USER]

## Tech Stack
- **Core**: HTML5, CSS3, Vanilla JavaScript
- **Visualization**: D3.js v7
- **Data Prsing**: PapaParse
- **Architecture**: Single-page client-side application (No backend, no build step)

## System Architecture
This application runs entirely in the browser. It processes CSV transaction data client-side, builds a graph network in memory, runs complex graph algorithms to detect fraud patterns, and renders visualizations using D3.js.

## Algorithm Approach

### 1. Cycle Detection (Money Loops)
- **Method**: Depth-First Search (DFS)
- **Logic**: Detects cycles of length 3 to 5.
- **Complexity**: O(V * (V+E)) worst case, optimized with depth limits.
- **Goal**: Find money moving in loops (A->B->C->A) which is a strong indicator of layering.

### 2. Smurfing Detection (Fan-in / Fan-out)
- **Method**: Degree Analysis + Temporal Sliding Window
- **Logic**: Identifies accounts that receive funds from many sources (fan-in) or send to many destinations (fan-out) within a 72-hour window.
- **Goal**: Detect placement and integration phases of money laundering.

### 3. Shell Network Detection
- **Method**: Breadth-First Search (BFS) Chain Traversal
- **Logic**: Identifies chains of 3+ hops where intermediate nodes have very low total transaction counts (2-3 txs).
- **Goal**: Detect shell companies used solely for passing funds.

### 4. Legitimate Account Guard
- **Method**: Heuristic Degree Ratio Analysis
- **Logic**: Excludes high-volume merchants (High Fan-in, Low Fan-out) and Payroll accounts (High Fan-out, Low Fan-in) from being flagged.

## Suspicion Score Methodology
Accounts are scored (0-100) based on detected patterns:
- **Cycle Membership**: 30-40 points (depending on length)
- **Smurfing**: 25 points
- **Shell Account**: 20 points
- **High Velocity**: 15 points
- **Multi-Pattern Bonus**: 10 points

## Installation & Setup
No installation required.
1. Clone the repository.
2. Open `index.html` in any modern web browser (Chrome, Firefox, Safari, Edge).
3. OR drag the file to [Netlify Drop](https://app.netlify.com/drop) for instant hosting.

## Usage Instructions
1. **Upload**: Drag & drop a CSV file or use the "Browse File" button.
2. **CSV Format**: Must contain columns: `transaction_id`, `sender_id`, `receiver_id`, `amount`, `timestamp` (YYYY-MM-DD HH:MM:SS).
3. **Demo**: Click "Load Demo Data" to see the system in action with generated fraud patterns.
4. **Analysis**: Watch the progress bar as the engine detects patterns.
5. **Results**: valid explore the graph, view the suspect list, and download the JSON report.

## Known Limitations
- Graph rendering may become slow with >2000 nodes (the app limits rendering to top 200 nodes for performance).
- Legitimate account heuristics are tuned for general banking patterns and may need adjustment for specific datasets.

## Team Members
[TO BE ADDED BY USER]
