import csv
import io
import time
from collections import defaultdict
from datetime import datetime, timedelta


class FraudDetector:
    REQUIRED_COLUMNS = [
        "transaction_id",
        "sender_id",
        "receiver_id",
        "amount",
        "timestamp",
    ]

    ALIASES = {
        "transaction_id": ["transaction_id", "txn_id", "tx_id", "id"],
        "sender_id": ["sender_id", "from", "from_account", "source", "source_id"],
        "receiver_id": ["receiver_id", "to", "to_account", "target", "target_id"],
        "amount": ["amount", "value", "txn_amount", "transaction_amount"],
        "timestamp": ["timestamp", "time", "datetime", "txn_time", "transaction_time"],
    }

    def __init__(self):
        self.transactions = []
        self.nodes = {}
        self.edges = []
        self.adj = defaultdict(set)
        self.rev_adj = defaultdict(set)
        self.legitimate_accounts = set()

    def analyze(self, file_storage):
        start = time.time()
        self._reset_state()

        rows = self._parse_csv(file_storage)
        self._build_graph(rows)

        cycles = self._detect_cycles()
        smurfing = self._detect_smurfing()
        shell_accounts = self._detect_shell_chains()

        suspicious_accounts, fraud_rings, suspicion_map = self._compile_results(
            cycles, smurfing, shell_accounts
        )

        processing_time = round(time.time() - start, 1)

        report = {
            "suspicious_accounts": suspicious_accounts,
            "fraud_rings": fraud_rings,
            "summary": {
                "total_accounts_analyzed": len(self.nodes),
                "suspicious_accounts_flagged": len(suspicious_accounts),
                "fraud_rings_detected": len(fraud_rings),
                "processing_time_seconds": float(processing_time),
            },
        }

        graph = self._build_graph_payload(suspicion_map, suspicious_accounts, fraud_rings)
        return {"analysis": report, "graph": graph}

    def _reset_state(self):
        self.transactions = []
        self.nodes = {}
        self.edges = []
        self.adj = defaultdict(set)
        self.rev_adj = defaultdict(set)
        self.legitimate_accounts = set()

    def _normalize_header(self, header):
        return str(header).strip().lower().replace(" ", "_")

    def _canonicalize_fields(self, headers):
        normalized = {self._normalize_header(h): h for h in headers}
        mapping = {}
        for required, aliases in self.ALIASES.items():
            found = None
            for alias in aliases:
                if alias in normalized:
                    found = normalized[alias]
                    break
            if found is None:
                raise ValueError(
                    "Missing required columns. Expected: transaction_id, sender_id, receiver_id, amount, timestamp"
                )
            mapping[required] = found
        return mapping

    def _parse_timestamp(self, value):
        raw = str(value).strip()
        patterns = [
            "%Y-%m-%d %H:%M:%S",
            "%Y-%m-%dT%H:%M:%S",
            "%Y/%m/%d %H:%M:%S",
            "%Y-%m-%d %H:%M",
        ]
        for pattern in patterns:
            try:
                return datetime.strptime(raw, pattern)
            except ValueError:
                continue
        try:
            return datetime.fromisoformat(raw)
        except ValueError as exc:
            raise ValueError(f"Invalid timestamp format: {raw}") from exc

    def _parse_csv(self, file_storage):
        try:
            text = file_storage.read().decode("utf-8")
        except Exception as exc:
            raise ValueError("Could not read CSV file") from exc

        stream = io.StringIO(text)
        reader = csv.DictReader(stream)
        if not reader.fieldnames:
            raise ValueError("CSV appears empty or invalid")

        field_map = self._canonicalize_fields(reader.fieldnames)
        parsed = []
        for row in reader:
            try:
                txn = {
                    "transaction_id": str(row[field_map["transaction_id"]]).strip(),
                    "sender_id": str(row[field_map["sender_id"]]).strip(),
                    "receiver_id": str(row[field_map["receiver_id"]]).strip(),
                    "amount": float(row[field_map["amount"]]),
                    "timestamp": self._parse_timestamp(row[field_map["timestamp"]]),
                }
            except (KeyError, ValueError, TypeError):
                continue

            if not txn["sender_id"] or not txn["receiver_id"]:
                continue
            parsed.append(txn)

        if not parsed:
            raise ValueError("No valid transactions found in CSV")

        return parsed

    def _ensure_node(self, account_id):
        if account_id not in self.nodes:
            self.nodes[account_id] = {
                "id": account_id,
                "tx_count": 0,
                "sent_total": 0.0,
                "received_total": 0.0,
                "timestamps": [],
            }

    def _is_legitimate_account(self, account_id):
        node = self.nodes[account_id]
        total_tx = node["tx_count"]
        unique_senders = len(self.rev_adj.get(account_id, set()))
        unique_receivers = len(self.adj.get(account_id, set()))

        if unique_receivers >= 20 and unique_senders <= 3:
            return True
        if unique_senders >= 20 and unique_receivers <= 3:
            return True
        if total_tx >= 100 and (unique_senders + unique_receivers) >= 80:
            return True
        return False

    def _build_graph(self, rows):
        for row in rows:
            sender = row["sender_id"]
            receiver = row["receiver_id"]
            amount = float(row["amount"])
            ts = row["timestamp"]

            self._ensure_node(sender)
            self._ensure_node(receiver)

            self.nodes[sender]["tx_count"] += 1
            self.nodes[receiver]["tx_count"] += 1
            self.nodes[sender]["sent_total"] += amount
            self.nodes[receiver]["received_total"] += amount
            self.nodes[sender]["timestamps"].append(ts)
            self.nodes[receiver]["timestamps"].append(ts)

            self.edges.append(
                {
                    "source": sender,
                    "target": receiver,
                    "amount": amount,
                    "timestamp": ts,
                }
            )
            self.adj[sender].add(receiver)
            self.rev_adj[receiver].add(sender)
            self.transactions.append(row)

        for account_id in self.nodes:
            if self._is_legitimate_account(account_id):
                self.legitimate_accounts.add(account_id)

    def _detect_cycles(self):
        cycles = []

        def dfs(start, current, path, depth):
            if depth > 5:
                return
            for neighbor in self.adj.get(current, set()):
                if neighbor == start and len(path) >= 3:
                    cycles.append(list(path))
                elif neighbor not in path and depth < 5:
                    path.append(neighbor)
                    dfs(start, neighbor, path, depth + 1)
                    path.pop()

        for account_id in self.nodes:
            if account_id in self.legitimate_accounts:
                continue
            dfs(account_id, account_id, [account_id], 1)

        seen = set()
        unique = []
        for cycle in cycles:
            if len(cycle) < 3 or len(cycle) > 5:
                continue
            key = ",".join(sorted(cycle))
            if key in seen:
                continue
            seen.add(key)
            unique.append(cycle)
        return unique

    def _detect_smurfing(self):
        result = {
            "accounts": set(),
            "fan_in": set(),
            "fan_out": set(),
        }
        threshold = 10
        window_hours = 72

        account_tx_times = defaultdict(list)
        for edge in self.edges:
            account_tx_times[edge["source"]].append(edge["timestamp"])
            account_tx_times[edge["target"]].append(edge["timestamp"])

        for account_id, node in self.nodes.items():
            if account_id in self.legitimate_accounts:
                continue

            in_senders = self.rev_adj.get(account_id, set())
            out_receivers = self.adj.get(account_id, set())

            if len(in_senders) >= threshold:
                times = sorted(account_tx_times[account_id])
                if self._has_dense_window(times, 5, window_hours):
                    result["accounts"].add(account_id)
                    result["fan_in"].add(account_id)

            if len(out_receivers) >= threshold:
                result["accounts"].add(account_id)
                result["fan_out"].add(account_id)

        return result

    def _has_dense_window(self, sorted_times, min_count, window_hours):
        if len(sorted_times) < min_count:
            return False

        left = 0
        for right in range(len(sorted_times)):
            while sorted_times[right] - sorted_times[left] > timedelta(hours=window_hours):
                left += 1
            if (right - left + 1) >= min_count:
                return True
        return False

    def _detect_shell_chains(self):
        shell_accounts = set()

        potential_shells = {
            account_id
            for account_id, node in self.nodes.items()
            if account_id not in self.legitimate_accounts and 2 <= node["tx_count"] <= 3
        }

        for start in self.nodes.keys():
            if start in self.legitimate_accounts:
                continue
            queue = [(start, [start])]

            while queue:
                current, path = queue.pop(0)
                if len(path) > 5:
                    continue
                for nxt in self.adj.get(current, set()):
                    if nxt in path:
                        continue
                    new_path = path + [nxt]
                    if len(new_path) >= 4:
                        mids = new_path[1:-1]
                        if mids and all(mid in potential_shells for mid in mids):
                            for mid in mids:
                                shell_accounts.add(mid)
                    if nxt in potential_shells:
                        queue.append((nxt, new_path))

        return shell_accounts

    def _calculate_suspicion_score(self, account_id, patterns):
        score = 0.0
        node = self.nodes[account_id]
        p = list(patterns)

        if "cycle_length_3" in p:
            score += 40
        if "cycle_length_4" in p:
            score += 35
        if "cycle_length_5" in p:
            score += 30
        if "fan_in_smurfing" in p:
            score += 25
        if "fan_out_smurfing" in p:
            score += 25
        if "shell_chain" in p:
            score += 20
        if "high_velocity" in p:
            score += 15

        times = sorted(node["timestamps"])
        if len(times) >= 2:
            span_hours = max((times[-1] - times[0]).total_seconds() / 3600.0, 1.0)
            velocity = len(times) / span_hours
            if velocity > 2:
                score += 15
                if "high_velocity" not in patterns:
                    patterns.add("high_velocity")

        unique_type_roots = {item.split("_")[0] for item in patterns}
        if len(unique_type_roots) >= 2:
            score += 10

        return min(100.0, round(score, 1))

    def _calculate_ring_risk_score(self, member_accounts, ring_type, suspicion_map):
        if not member_accounts:
            return 0.0

        avg_score = sum(suspicion_map.get(acc, 0.0) for acc in member_accounts) / len(member_accounts)
        bonus = 0
        if ring_type == "cycle":
            bonus = 20
        elif ring_type == "smurfing":
            bonus = 15
        elif ring_type == "shell":
            bonus = 10

        return min(100.0, round(avg_score + bonus, 1))

    def _compile_results(self, cycles, smurfing, shell_accounts):
        pattern_map = defaultdict(set)
        suspicion_map = {}

        for cycle in cycles:
            cycle_len = len(cycle)
            if cycle_len not in (3, 4, 5):
                continue
            pattern = f"cycle_length_{cycle_len}"
            for account_id in cycle:
                if account_id not in self.legitimate_accounts:
                    pattern_map[account_id].add(pattern)

        for account_id in smurfing["fan_in"]:
            if account_id not in self.legitimate_accounts:
                pattern_map[account_id].add("fan_in_smurfing")

        for account_id in smurfing["fan_out"]:
            if account_id not in self.legitimate_accounts:
                pattern_map[account_id].add("fan_out_smurfing")

        for account_id in shell_accounts:
            if account_id not in self.legitimate_accounts:
                pattern_map[account_id].add("shell_chain")

        for account_id, patterns in pattern_map.items():
            suspicion_map[account_id] = self._calculate_suspicion_score(account_id, patterns)

        ring_map = {}
        rings = []
        ring_counter = 1

        for cycle in cycles:
            members = sorted({acc for acc in cycle if acc in pattern_map})
            if len(members) < 3:
                continue
            ring_id = f"RING_{ring_counter:03d}"
            ring_counter += 1
            for acc in members:
                ring_map[acc] = ring_id

            rings.append(
                {
                    "ring_id": ring_id,
                    "member_accounts": members,
                    "pattern_type": "cycle",
                    "risk_score": 0.0,
                }
            )

        smurf_only = sorted([acc for acc in smurfing["accounts"] if acc in pattern_map and acc not in ring_map])
        if smurf_only:
            ring_id = f"RING_{ring_counter:03d}"
            ring_counter += 1
            for acc in smurf_only:
                ring_map[acc] = ring_id
            rings.append(
                {
                    "ring_id": ring_id,
                    "member_accounts": smurf_only,
                    "pattern_type": "smurfing",
                    "risk_score": 0.0,
                }
            )

        shell_only = sorted([acc for acc in shell_accounts if acc in pattern_map and acc not in ring_map])
        if shell_only:
            ring_id = f"RING_{ring_counter:03d}"
            for acc in shell_only:
                ring_map[acc] = ring_id
            rings.append(
                {
                    "ring_id": ring_id,
                    "member_accounts": shell_only,
                    "pattern_type": "shell",
                    "risk_score": 0.0,
                }
            )

        suspicious = []
        for account_id in pattern_map:
            score = float(round(suspicion_map.get(account_id, 0.0), 1))
            suspicious.append(
                {
                    "account_id": account_id,
                    "suspicion_score": score,
                    "detected_patterns": sorted(pattern_map[account_id]),
                    "ring_id": ring_map.get(account_id, "NONE"),
                }
            )

        suspicious.sort(key=lambda x: x["suspicion_score"], reverse=True)

        for ring in rings:
            ring["risk_score"] = float(
                self._calculate_ring_risk_score(ring["member_accounts"], ring["pattern_type"], suspicion_map)
            )

        rings.sort(key=lambda x: x["risk_score"], reverse=True)
        return suspicious, rings, suspicion_map

    def _build_graph_payload(self, suspicion_map, suspicious_accounts, fraud_rings):
        suspicious_set = {item["account_id"] for item in suspicious_accounts}
        ring_members = set()
        ring_by_account = {}
        for ring in fraud_rings:
            for acc in ring["member_accounts"]:
                ring_members.add(acc)
                ring_by_account[acc] = ring["ring_id"]

        nodes = []
        for account_id, node in self.nodes.items():
            ntype = "safe"
            if account_id in ring_members:
                ntype = "fraud"
            elif account_id in suspicious_set:
                ntype = "suspicious"

            nodes.append(
                {
                    "id": account_id,
                    "type": ntype,
                    "risk_score": float(round(suspicion_map.get(account_id, 0.0), 1)),
                    "ring_id": ring_by_account.get(account_id, "NONE"),
                    "detected_patterns": next(
                        (s["detected_patterns"] for s in suspicious_accounts if s["account_id"] == account_id),
                        [],
                    ),
                    "transaction_count": node["tx_count"],
                    "total_sent": float(round(node["sent_total"], 2)),
                    "total_received": float(round(node["received_total"], 2)),
                }
            )

        links = []
        for edge in self.edges:
            etype = "normal"
            if edge["source"] in ring_members and edge["target"] in ring_members:
                etype = "fraud"
            elif edge["source"] in suspicious_set or edge["target"] in suspicious_set:
                etype = "suspicious"
            links.append(
                {
                    "source": edge["source"],
                    "target": edge["target"],
                    "amount": float(round(edge["amount"], 2)),
                    "type": etype,
                }
            )

        return {"nodes": nodes, "links": links}
