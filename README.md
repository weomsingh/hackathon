# RiftGuard — Financial Forensics Engine

## Overview
RiftGuard is an advanced, browser-based financial forensics tool designed to detect sophisticated money muling networks, smurfing patterns, and layered shell accounts. It uses graph algorithms to analyze transaction logs (`.csv`) and visualize hidden fraud rings in real-time.

## Key Features
- **Interactive Graph Visualization**: Visualizes complex transaction networks with clear highlighting of suspicious nodes and fraud rings.
- **Pattern Detection**:
  - **Circular Routing**: Detects money loops (length 3-5).
  - **Smurfing**: Identifies fan-in/fan-out patterns within 72-hour windows.
  - **Layered Shells**: Spots chains of low-volume accounts used for obfuscation.
- **Precision Targeting**: Filters out legitimate high-volume accounts (Payroll, Merchants) to minimize false positives.
- **Privacy-First**: All processing happens client-side. No data is uploaded to any server.

## Live Demo
[Insert Live Demo URL Here]

## Tech Stack
- **Frontend**: HTML5, CSS3 (Modern Light Theme), Vanilla JavaScript
- **Visualization**: D3.js v7
- **Data Processing**: PapaParse (CSV Parsing)
- **Deployment**: Static File Hosting (Netlify/Vercel)

## System Architecture
RiftGuard operates entirely in the browser using a client-side architecture:
1.  **Ingestion Layer**: Parses CSV files using PapaParse (Streaming/Worker support ready).
2.  **Graph Construction**: Builds an Adjacency List and Reverse Adjacency List for O(1) traversal lookups.
3.  **Detection Engine**:
    *   **DFS (Depth First Search)**: Used for Cycle Detection (Recursive with path limits).
    *   **Temporal Analysis**: Sliding window algorithm for Smurfing detection.
    *   **Heuristic Scoring**: Assigns risk scores (0-100) based on pattern matching.
4.  **Visualization Layer**: D3.js Force-Directed Graph optimized for large datasets (rendering only critical subgraphs).

## Algorithm Analysis
### 1. Cycle Detection (DFS)
*   **Approach**: Depth-First Search with limited depth (max 5 hops).
*   **Complexity**: `O(V + E)` in the worst case, but optimized by pruning visited paths and limiting depth.
*   **Why**: Detecting closed loops is the most definitive proof of money muling.

### 2. Smurfing Detection
*   **Approach**: Analyzes node degree (in/out) and timestamps.
*   **Complexity**: `O(N * T log T)` where N is nodes and T is transactions (sorting timestamps).
*   **Why**: Identifies structuring (splitting large sums) used to evade reporting thresholds.

## Suspicion Score Methodology
Accounts are scored from **0 to 100** based on detected behaviors:
*   **Cycle Participant**: +40-50 points (High certainty of fraud)
*   **Smurfing Behavior**: +30 points (Strong indicator)
*   **Shell Account**: +20 points (Supporting role)
*   **High Velocity/Volume**: +10-15 points (Aggravating factor)

Scores are capped at 100. Accounts > 50 are flagged as **Suspicious**.

## Installation & Setup
1.  Clone the repository:
    ```bash
    git clone https://github.com/your-username/riftguard.git
    ```
2.  Navigate to the directory:
    ```bash
    cd riftguard
    ```
3.  Open `index.html` in your browser.
    *   *Optional*: Serve with a local server (e.g., `python3 -m http.server 8000`) for better performance.

## Usage Instructions
1.  Launch the application.
2.  Click **"Start Your Investigation"**.
3.  Select a CSV file with columns:
    *   `transaction_id`, `sender_id`, `receiver_id`, `amount`, `timestamp`
4.  View the interactive graph:
    *   **Red Nodes**: Confirmed Ring Members.
    *   **Amber Nodes**: Suspicious Accounts.
    *   **Blue Nodes**: Contextual/Safe Accounts.
5.  Scroll down to the **Fraud Ring Summary** table.
6.  Click **"Download Report"** to get the full forensic JSON export.

## Known Limitations
*   **Browser Memory**: Extremely large datasets (>100MB CSV) may cause browser slowness as all processing is in-memory.
*   **Static Graph**: To ensure performance with 10k+ nodes, the graph layout is pre-calculated and static (no real-time physics).

## Team Members
*   [Your Name] - Lead Developer
