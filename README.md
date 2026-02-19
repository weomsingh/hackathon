# RingGuard - Money Muling Detection System

![Python](https://img.shields.io/badge/Python-3.10%2B-blue)
![Flask](https://img.shields.io/badge/Flask-3.0-black)
![D3.js](https://img.shields.io/badge/D3.js-7.8.5-orange)

## Live Demo URL
[to be filled]

## LinkedIn Video
[to be filled]

## Problem Statement
Financial institutions need fast, interpretable detection of money muling structures in raw transaction logs. This project identifies high-risk account clusters and visualizes suspicious fund movement patterns for analyst triage.

## System Architecture
```
CSV Upload -> Flask Parser -> Fraud Detection Engine -> Graph Builder -> D3.js Visualization
                                  |
                                  +-> [Cycle Detection (DFS)]
                                  +-> [Smurfing Detection]
                                  +-> [Shell Chain Detection]
                                  +-> [Legit Account Filter]
```

## Algorithm Approach
- Cycle detection: O(V + E) DFS traversal with bounded path length (3-5), repeated per start node.
- Smurfing detection: O(T log T) for sorted timestamp window checks plus degree checks.
- Shell chains: O(V + E) graph traversal with constrained multi-hop path checks.
- Legitimate account filter: O(V) node-level heuristic using in/out counterparties.

## Suspicion Score Methodology
| Signal | Weight |
|---|---:|
| cycle_length_3 | +40 |
| cycle_length_4 | +35 |
| cycle_length_5 | +30 |
| fan_in_smurfing | +25 |
| fan_out_smurfing | +25 |
| shell_chain | +20 |
| high_velocity | +15 |
| multi-pattern bonus | +10 |

Final score is capped at 100.0.

## Tech Stack
| Layer | Technology |
|---|---|
| Backend | Python, Flask |
| Detection Engine | Custom DFS/BFS + heuristic scoring |
| Frontend | HTML, CSS, Vanilla JavaScript |
| Visualization | D3.js v7 |
| Deploy | Gunicorn, Procfile |

## Installation & Setup
1. Clone repository.
2. Create virtual environment.
3. Install dependencies:
   `pip install -r requirements.txt`
4. Run locally:
   `python app.py`
5. Open:
   `http://127.0.0.1:5000`

## API Documentation
### POST `/analyze`
- Content-Type: `multipart/form-data`
- Field: `csv_file`
- Response:
  - `analysis.suspicious_accounts`
  - `analysis.fraud_rings`
  - `analysis.summary`
  - `graph.nodes`
  - `graph.links`

### GET `/download-json`
- Returns latest completed analysis as downloadable JSON.
- Filename: `forensics_report.json`

## CSV Format Requirements
Required canonical fields:
- `transaction_id`
- `sender_id`
- `receiver_id`
- `amount`
- `timestamp`

### Accepted aliases
| Canonical | Accepted aliases |
|---|---|
| transaction_id | txn_id, tx_id, id |
| sender_id | from, from_account, source, source_id |
| receiver_id | to, to_account, target, target_id |
| amount | value, txn_amount, transaction_amount |
| timestamp | time, datetime, txn_time, transaction_time |

## Known Limitations
- Cycle search is bounded to length 3-5.
- Extremely dense graphs can become visually noisy.
- Heuristic legitimate-account filtering may need domain tuning for institution-specific traffic.

## Team Members
[to be filled]
