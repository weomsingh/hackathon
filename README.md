
# RingGuard — Financial Forensics Engine
![Python](https://img.shields.io/badge/Python-3.x-blue?style=flat-square) ![Flask](https://img.shields.io/badge/Flask-3.0-green?style=flat-square) ![D3.js](https://img.shields.io/badge/D3.js-v7-orange?style=flat-square)

## Live Demo
[Deployment URL Placeholder]

## Problem Statement
Money muling is a critical component of financial crime where criminals use networks of individuals ("mules") to transfer and layer illicit funds. RingGuard is a web-based forensics engine that processes transaction logs to detect and visualize sophisticated money muling networks, specifically targeting Circular Routing, Smurfing, and Shell Chains.

## System Architecture
```
[User Browser] (HTML/JS/D3)
      |
      | (POST /analyze .csv)
      v
[Flask Server] (app.py)
      |
      v
[Fraud Detection Engine] (fraud_detector.py)
      |
      +---> [CSV Parser] --> [Graph Builder]
      |
      +---> [Cycle Detection Module] (DFS)
      |
      +---> [Smurfing Detector] (Temporal Sliding Window)
      |
      +---> [Shell Chain Analyzer] (Path Tracing)
      |
      +---> [Legitimate Account Filter] (Heuristic Rules)
      |
      v
[JSON Response] --> { suspicious_accounts, fraud_rings, graph_data }
```

## Algorithm Approach

### 1. Cycle Detection (Circular Routing)
- **Algorithm**: Depth-First Search (DFS) with Path Tracking.
- **Logic**: Iterates through all nodes. Starts a DFS to find paths of length 3-5 that return to the start node.
- **Complexity**: `O(V + E)` (optimized with depth limit `d=5` effectively making it linear for sparse financial graphs, though theoretically exponential without limits).

### 2. Smurfing Detection (Structuring)
- **Algorithm**: Degree Analysis + Temporal Sliding Window.
- **Logic**: Identifies nodes with High Fan-In (>10 sources) or High Fan-Out (>10 destinations). checks if `N` transactions occur within a 72-hour sliding window.
- **Complexity**: `O(N * T log T)` where T is transactions per node (sorting timestamps).

### 3. Shell Chain Detection
- **Algorithm**: Weak-Node Path Tracing.
- **Logic**: Identifies chains of "weak" accounts (low total volume) connecting normal accounts.
- **Complexity**: `O(V + E)` single pass traversal.

### 4. Precision Filtering
- **Logic**: Heuristic filtering to exclude high-volume Payroll (High Out/Low In) and Merchant (High In/Low Out) accounts to reduce False Positives.

## Suspicion Score Methodology
Scores (0-100) are assigned based on pattern severity:

| Pattern | Score Weight | Description |
| :--- | :--- | :--- |
| **Cycle Participant** | +50 | Strongest indicator of money laundering loop. |
| **Smurfing Hub** | +30 | Indicative of structuring/layering. |
| **Shell Account** | +20 | Intermediate node used for obfuscation. |
| **High Velocity** | +10 | >50 transactions total. |
| **High Volume** | +10 | >$10k total volume moved. |

*Note: Score is capped at 100.*

## Tech Stack
| Component | Technology |
| :--- | :--- |
| **Backend** | Python 3, Flask, Gunicorn |
| **Frontend** | HTML5, CSS3, Vanilla JavaScript |
| **Visualization** | D3.js v7 (Force Directed Graph) |
| **Styling** | Custom CSS (Dark Theme, Fraunces/DM Sans fonts) |

## Installation & Setup

1. **Clone the Repository**
   ```bash
   git clone https://github.com/your-username/ringguard.git
   cd ringguard
   ```

2. **Install Dependencies**
   ```bash
   pip install -r requirements.txt
   ```

3. **Run the Application**
   ```bash
   python app.py
   ```
   Server will start at `http://localhost:5000`.

## API Documentation

### `POST /analyze`
Uploads a CSV file for analysis.
- **Content-Type**: `multipart/form-data`
- **Body**: `csv_file` (File Object)
- **Response**: JSON object containing `analysis` (results) and `graph` (nodes/links).

## CSV Format Requirements
The system strictly requires a CSV file with the following columns:

| Column | Type | Description |
| :--- | :--- | :--- |
| `transaction_id` | String | Unique ID |
| `sender_id` | String | Sender Account ID |
| `receiver_id` | String | Receiver Account ID |
| `amount` | Float | Transaction Value |
| `timestamp` | String | `YYYY-MM-DD HH:MM:SS` |

*(Column names are case-insensitive and handle whitespace)*

## Known Limitations
1. **Memory**: Large datasets (>50MB) are processed in-memory.
2. **Graph Rendering**: Visualizing 10k+ nodes via D3.js in the browser can be performance-intensive.

## Team Members
- [Name] - Lead Developer
