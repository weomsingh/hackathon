
import csv
import io
import datetime
import time
from collections import defaultdict

class FraudDetector:
    def __init__(self):
        self.transactions = []
        self.nodes = set()
        self.adj = defaultdict(list)
        self.rev_adj = defaultdict(list)
        self.node_stats = defaultdict(lambda: {
            'sent': 0.0, 'received': 0.0, 'tx_count': 0, 'timestamps': []
        })
        self.suspicious_accounts = []
        self.fraud_rings = []
        self.graph_data = {"nodes": [], "links": []}
        
    def analyze(self, file_storage):
        start_time = time.time()
        
        # 1. Parse
        self._parse_csv(file_storage)
        
        # 2. Detect Patterns
        cycles = self._find_cycles() # [[A,B,C], ...]
        smurfs = self._find_smurfing() # {'fan_in': [id...], 'fan_out': [id...]}
        shells = self._find_shells() # [[A,B,C], ...]
        
        # 3. Filter Legitimate (Payroll/Merchants)
        self._filter_legitimate(smurfs)
        
        # 4. Build Results & Scores
        self._compile_results(cycles, smurfs, shells)
        
        # 5. Build D3 Graph Data
        self._build_graph_json()
        
        processing_time = time.time() - start_time
        
        return {
            "analysis": {
                "suspicious_accounts": self.suspicious_accounts,
                "fraud_rings": self.fraud_rings,
                "summary": {
                    "total_accounts_analyzed": len(self.nodes),
                    "suspicious_accounts_flagged": len(self.suspicious_accounts),
                    "fraud_rings_detected": len(self.fraud_rings),
                    "processing_time_seconds": round(processing_time, 2)
                }
            },
            "graph": self.graph_data
        }
        
    def _parse_csv(self, file_storage):
        stream = io.StringIO(file_storage.stream.read().decode("UTF8"), newline=None)
        reader = csv.DictReader(stream)
        
        # Normalize headers
        reader.fieldnames = [h.strip().lower() for h in reader.fieldnames]
        
        # Check requirements
        required = {'sender_id', 'receiver_id', 'amount', 'timestamp'}
        if not required.issubset(set(reader.fieldnames)):
            raise ValueError(f"Missing required columns. Found: {reader.fieldnames}")
            
        for row in reader:
            try:
                # Handle possible whitespace in values
                s = row['sender_id'].strip()
                r = row['receiver_id'].strip()
                # Handle potentially empty values
                if not s or not r: continue
                
                amt = float(row['amount'])
                ts_str = row['timestamp'].strip()
                try:
                    ts = datetime.datetime.strptime(ts_str, '%Y-%m-%d %H:%M:%S')
                except ValueError:
                    ts = datetime.datetime.fromisoformat(ts_str)

                self.nodes.add(s)
                self.nodes.add(r)
                self.adj[s].append(r)
                self.rev_adj[r].append(s)
                
                self.node_stats[s]['sent'] += amt
                self.node_stats[s]['tx_count'] += 1
                self.node_stats[s]['timestamps'].append(ts)
                
                self.node_stats[r]['received'] += amt
                self.node_stats[r]['tx_count'] += 1
                self.node_stats[r]['timestamps'].append(ts)
                
                self.graph_data['links'].append({
                    "source": s, "target": r, "amount": amt, "type": "normal"
                })
                
            except (ValueError, KeyError):
                continue

    def _find_cycles(self):
        cycles = []
        # DFS for cycles length 3-5
        # Optimization: Only check nodes with in-degree > 0 AND out-degree > 0
        candidates = [n for n in self.nodes if self.adj[n] and self.rev_adj[n]]
        
        seen_cycles = set()
        
        def dfs(start, curr, path, depth):
            if depth > 5: return
            
            for neighbor in self.adj[curr]:
                if neighbor == start and depth >= 3:
                    # Found cycle
                    cycle = tuple(sorted(path))
                    if cycle not in seen_cycles:
                        seen_cycles.add(cycle)
                        cycles.append(path[:])
                elif neighbor not in path:
                    dfs(start, neighbor, path + [neighbor], depth + 1)
        
        # Limit to 500 candidates for performance in hackathon context if needed
        # But per requirements "10k dataset", strict pruning is better.
        # We'll just run it. The logic is fine for O(N) where N is small-ish cycles.
        for node in candidates:
            # Basic pruning: don't start if node is already part of a found cycle? 
            # No, might be part of multiple.
            dfs(node, node, [node], 1)
            
        return cycles

    def _find_smurfing(self):
        fan_in = []
        fan_out = []
        
        for n in self.nodes:
            # Fan-in: 10+ distinct senders
            senders = set(self.rev_adj[n])
            if len(senders) >= 10:
                if self._check_temporal_density(n, 10, 72):
                    fan_in.append(n)
            
            # Fan-out: 10+ distinct receivers
            receivers = set(self.adj[n])
            if len(receivers) >= 10:
                 if self._check_temporal_density(n, 10, 72):
                    fan_out.append(n)
                    
        return {'fan_in': fan_in, 'fan_out': fan_out}

    def _check_temporal_density(self, node, count, hours):
        timestamps = sorted(self.node_stats[node]['timestamps'])
        if len(timestamps) < count: return False
        
        # Sliding window
        # Max number of txs within 'hours' window
        max_in_window = 0
        left = 0
        for right in range(len(timestamps)):
            while (timestamps[right] - timestamps[left]).total_seconds() / 3600 > hours:
                left += 1
            max_in_window = max(max_in_window, right - left + 1)
        
        return max_in_window >= count

    def _find_shells(self):
        # Shell: Chain A->B->C->D where B,C have total tx <= 5
        shells = []
        
        weak_nodes = {n for n in self.nodes 
                      if 1 <= self.node_stats[n]['tx_count'] <= 5}
        
        # Find paths of length >= 3 entirely within weak_nodes (surrounded by normal nodes)
        # Simplified: Just find chains of weak nodes.
        
        visited = set()
        
        for n in weak_nodes:
            if n in visited: continue
            
            # DFS to find longest chain
            chain = [n]
            stack = [(n, [n])] # node, path
            
            while stack:
                curr, path = stack.pop()
                
                # Check neighbors
                has_weak_neighbor = False
                for neighbor in self.adj[curr]:
                    if neighbor in weak_nodes and neighbor not in path:
                        stack.append((neighbor, path + [neighbor]))
                        has_weak_neighbor = True
                
                if not has_weak_neighbor and len(path) >= 2:
                    # End of chain. Check if connected to non-weak at ends?
                    # Requirement: "Money passes through... before reaching final"
                    # Implies inputs and outputs exist.
                    if self.rev_adj[path[0]] and self.adj[path[-1]]:
                        shells.append(path)
                        for x in path: visited.add(x)
                        
        return shells

    def _filter_legitimate(self, smurfs):
        # Payroll: High Fan-Out, Low In-Degree ratio
        # Merchant: High Fan-In, Low Out-Degree ratio
        
        # Filter Fan-Out Smurfs (Payroll)
        filtered_out = []
        for n in smurfs['fan_out']:
            fan_out_count = len(set(self.adj[n]))
            fan_in_count = len(set(self.rev_adj[n]))
            
            # If Fan-Out is 10x Fan-In, and total > 20 => Legit Payroll
            if fan_out_count > 20 and (fan_in_count == 0 or fan_out_count / fan_in_count > 10):
                continue # Skip (Legit)
            filtered_out.append(n)
        smurfs['fan_out'] = filtered_out

        # Filter Fan-In Smurfs (Merchants)
        filtered_in = []
        for n in smurfs['fan_in']:
            fan_in_count = len(set(self.rev_adj[n]))
            fan_out_count = len(set(self.adj[n]))
            
             # If Fan-In is 10x Fan-Out => Legit Merchant
            if fan_in_count > 20 and (fan_out_count == 0 or fan_in_count / fan_out_count > 10):
                continue
            filtered_in.append(n)
        smurfs['fan_in'] = filtered_in

    def _compile_results(self, cycles, smurfs, shells):
        node_scores = defaultdict(int)
        node_patterns = defaultdict(set)
        
        # 1. Processing Cycles
        ring_counter = 1
        for cycle in cycles:
            rid = f"RING_{ring_counter:03d}"
            ring_counter += 1
            
            risk = 90.0 + len(cycle) # Higher risk for longer cycles? or shorter? 
            # Actually shorter cycles (3) are tighter.
            
            self.fraud_rings.append({
                "ring_id": rid,
                "pattern_type": "cycle",
                "member_accounts": cycle,
                "risk_score": min(100.0, risk)
            })
            
            for member in cycle:
                node_scores[member] += 50
                node_patterns[member].add(f"cycle_length_{len(cycle)}")
                # Assign Ring ID (Priority to Cycle)
                self.node_stats[member]['ring_id'] = rid

        # 2. Processing Smurfs
        # Group smurfs? Requirement: "Ring ID"
        for group_type, nodes in smurfs.items():
            for n in nodes:
                # If already in cycle, skip creating new ring, just add pattern
                if n in node_scores: # Simple check if already flagged
                    node_scores[n] += 30
                    node_patterns[n].add(group_type + "_smurfing")
                    continue
                
                # Create Smurf Ring (1 node + neighbors)
                rid = f"RING_{ring_counter:03d}"
                ring_counter += 1
                
                members = [n]
                # Add a few connected nodes for context
                if group_type == 'fan_in':
                    members += self.rev_adj[n][:5]
                else:
                    members += self.adj[n][:5]
                
                self.fraud_rings.append({
                    "ring_id": rid,
                    "pattern_type": "smurfing",
                    "member_accounts": members,
                    "risk_score": 75.0
                })
                
                node_scores[n] += 30
                node_patterns[n].add(group_type + "_smurfing")
                self.node_stats[n]['ring_id'] = rid

        # 3. Processing Shells
        for chain in shells:
            # Check overlap
            if any(m in node_scores for m in chain):
                for m in chain:
                    node_scores[m] += 20
                    node_patterns[m].add("shell_chain")
                continue
                
            rid = f"RING_{ring_counter:03d}"
            ring_counter += 1
            
            self.fraud_rings.append({
                "ring_id": rid,
                "pattern_type": "shell",
                "member_accounts": chain,
                "risk_score": 60.0
            })
            
            for m in chain:
                node_scores[m] += 20
                node_patterns[m].add("shell_chain")
                self.node_stats[m]['ring_id'] = rid

        # 4. Final Scores
        for n, score in node_scores.items():
            # Velocity Bonus
            if self.node_stats[n]['tx_count'] > 50:
                score += 15
                node_patterns[n].add("high_velocity")
            
            final_score = min(100.0, float(score))
            
            self.suspicious_accounts.append({
                "account_id": n,
                "suspicion_score": final_score,
                "detected_patterns": list(node_patterns[n]),
                "ring_id": self.node_stats[n].get('ring_id') # Might be None
            })
            
        # Sort
        self.suspicious_accounts.sort(key=lambda x: x['suspicion_score'], reverse=True)
        self.fraud_rings.sort(key=lambda x: x['risk_score'], reverse=True)

    def _build_graph_json(self):
        # We need nodes and links
        # Nodes: include 'type' (fraud, suspicious, normal)
        # Links: include 'type' (fraud, suspicious, normal)
        
        suspicious_ids = {a['account_id'] for a in self.suspicious_accounts}
        fraud_ids = set()
        for r in self.fraud_rings:
            for m in r['member_accounts']:
                fraud_ids.add(m)
        
        # Re-build nodes list with attributes
        final_nodes = []
        for n in self.nodes:
            node_type = 'normal'
            if n in fraud_ids: node_type = 'fraud'
            elif n in suspicious_ids: node_type = 'suspicious'
            
            # Aggregator check?
            if len(self.rev_adj[n]) > 10: node_type = 'aggregator' 
            # (Override normal, but Fraud takes precedence)
            if n in fraud_ids: node_type = 'fraud'
            
            # Find score/ring
            score = 0
            ring = None
            patterns = []
            
            # O(N) lookup here is inefficient, but N (suspicious) is small
            for acc in self.suspicious_accounts:
                if acc['account_id'] == n:
                    score = acc['suspicion_score']
                    ring = acc['ring_id']
                    patterns = acc['detected_patterns']
                    break
            
            final_nodes.append({
                "id": n,
                "type": node_type,
                "risk_score": score,
                "ring_id": ring,
                "detected_patterns": patterns,
                "transaction_count": self.node_stats[n]['tx_count'],
                "total_sent": self.node_stats[n]['sent']
            })
            
        self.graph_data['nodes'] = final_nodes
        
        # Links already added in parse, but update types?
        # If both source and target are fraud -> fraud link
        for link in self.graph_data['links']:
            s, t = link['source'], link['target']
            if s in fraud_ids and t in fraud_ids:
                link['type'] = 'fraud'
            elif s in suspicious_ids or t in suspicious_ids:
                link['type'] = 'suspicious'
