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
The system assigns a risk score (0-100) to each account based on a weighted sum of detected behaviors. This multi-factor approach minimizes false positives by requiring significant evidence for a high score.

**Score Components:**
- **Cycle Membership**: 
  - **3-Cycle (A-B-C-A)**: +40 points (Hardest to detect, highly indicative of layering)
  - **4-Cycle**: +35 points
  - **5-Cycle**: +30 points
- **Smurfing (Structuring)**: +25 points. Triggered when an account receives/sends funds from 10+ distinct entities within a 72-hour window.
- **Shell Account Behavior**: +20 points. Triggered for intermediate nodes in a long chain with low total activity (2-3 transactions).
- **High Velocity**: +15 points. Triggered when transaction frequency exceeds 2/hour.
- **Multi-Pattern Bonus**: +10 points. Added if an account exhibits multiple distinct fraud types (e.g., Smurfing AND Cycling).

## Input Specification
The application strictly parses CSV files with the following columns:
- `transaction_id` (String): Unique identifier
- `sender_id` (String): Originator account
- `receiver_id` (String): Beneficiary account
- `amount` (Float): Value of transaction
- `timestamp` (DateTime): `YYYY-MM-DD HH:MM:SS` format

## Installation & Setup
No installation required.
1. Download `index.html`.
2. Open `index.html` in any modern web browser (Chrome, Firefox, Safari, Edge).
3. OR drag the file to [Netlify Drop](https://app.netlify.com/drop) for instant hosting.

## Usage Instructions
1. **Upload**: Drag & drop a CSV file or use the "Browse File" button.
2. **Demo**: Click "Load Demo Data" to see the system in action.
3. **Analysis**: Watch the progress bar as the engine detects patterns.
4. **Results**: Explore the interactive graph, view the suspect list, and download the JSON report.

## Known Limitations
- Graph rendering may become slow with >2000 nodes (limits rendering to top 200 nodes for performance).
- Legitimate account heuristics are tuned for general patterns and may need adjustment for specific datasets.

## Team Members
[TO BE ADDED BY USER]
