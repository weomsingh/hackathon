# Enterprise Forensic Engine
## High-Precision Financial & Structural Analysis

### Overview
This is a professional-grade, browser-based forensic engine designed for high-volume dataset analysis (10k+ records). It features strict heuristic filtering to eliminate false positives (Payroll/Merchants) and calculates Model Precision & Recall metrics.

### Key Capabilities
- **Precision Targeting**: Filters out legitimate high-volume accounts (Payroll/Merchants) to focus only on genuine high-risk patterns.
- **Fraud Ring Detection**: advanced DFS-based cycle detection for money loops.
- **Smurfing Analysis**: Temporal fan-in/fan-out detection.
- **Risk Subgraph Rendering**: Optimized visualization that only renders the most critical nodes and connections to ensure performance on large datasets.
- **Dual Mode**: Supports both Financial CSV Logs and Source Code Structural Analysis.

### Supported File Formats
1. **Financial Logs (.csv)**:
   - `transaction_id`, `sender_id`, `receiver_id`, `amount`, `timestamp`
2. **Source Code**:
   - `.java`, `.c`, `.cpp`, `.py`, `.js`, `.ts`, `.html`, `.css`, `.json`

### Deployment
Simply open `index.html` in any modern browser. No backend required.
