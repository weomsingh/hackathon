
// State Management
let currentData = null;
let simulation = null;
let graphData = { nodes: [], links: [] };

// DOM Elements
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const analyzeBtn = document.getElementById('analyzeBtn');

// Upload View -> Dashboard Logic
const uploadView = document.getElementById('view-upload');
const dashView = document.getElementById('view-dashboard');

// === 1. File Upload Handling ===
if (dropZone) {
  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.style.borderColor = 'var(--accent)'; });
  dropZone.addEventListener('dragleave', e => { dropZone.style.borderColor = 'var(--border)'; });
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.style.borderColor = 'var(--border)';
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  });
}

if (fileInput) {
  fileInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) handleFile(file);
  });
}

function handleFile(file) {
  if (!file.name.endsWith('.csv')) {
    alert('Please upload a valid CSV file.');
    return;
  }

  // Show 'Selected' state
  const originalText = dropZone.innerHTML;
  dropZone.innerHTML = `
        <i data-lucide="file-check" style="width:48px; height:48px; color:var(--accent); margin-bottom:1rem"></i>
        <h3>${file.name}</h3>
        <p style="font-size:0.9rem; color:var(--text-secondary)">${(file.size / 1024).toFixed(1)} KB</p>
    `;
  if (window.lucide) lucide.createIcons();

  if (analyzeBtn) {
    analyzeBtn.disabled = false;
    analyzeBtn.onclick = () => processCSV(file);
  }
}

// === 2. Client-Side Processing (Core Engine) ===
function processCSV(file) {
  if (analyzeBtn) {
    analyzeBtn.disabled = true;
    analyzeBtn.innerHTML = `<span class="spinner"></span> Analyzing...`;
  }

  const startTime = performance.now();

  Papa.parse(file, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
    complete: function (results) {
      try {
        if (!results.data || results.data.length === 0) {
          throw new Error("CSV file is empty or invalid.");
        }

        const engine = new FraudEngine(results.data);
        const analysis = engine.runAnalysis();

        const processingTime = ((performance.now() - startTime) / 1000).toFixed(2);

        // Ensure summary object exists
        if (!analysis.analysis.summary) {
          analysis.analysis.summary = {};
        }
        analysis.analysis.summary.processing_time_seconds = processingTime;

        renderDashboard(analysis);

        // Switch View
        if (uploadView) uploadView.classList.remove('active');
        if (dashView) dashView.classList.add('active');
        const navDash = document.getElementById('nav-dash');
        if (navDash) navDash.classList.add('active');

      } catch (err) {
        console.error(err);
        alert("Error analyzing file: " + err.message);
        if (analyzeBtn) {
          analyzeBtn.disabled = false;
          analyzeBtn.textContent = 'Analyze for Fraud Rings →';
        }
      }
    },
    error: function (err) {
      console.error(err);
      alert("CSV Parse Error: " + err.message);
      if (analyzeBtn) {
        analyzeBtn.disabled = false;
        analyzeBtn.textContent = 'Analyze for Fraud Rings →';
      }
    }
  });
}

// === 3. Fraud Engine Logic (The Brain) ===
class FraudEngine {
  constructor(transactions) {
    this.txs = transactions;
    this.nodes = new Map(); // id -> { sent, received, count, timestamps[], outDegree, inDegree }
    this.adj = new Map();   // id -> [neighbors]
    this.revAdj = new Map(); // id -> [sources]
    this.links = [];

    this.suspicious = [];
    this.rings = [];
    // patterns is now a property of individual nodes, initialized in _initNode

    this._buildGraph();
  }

  _buildGraph() {
    this.txs.forEach(tx => {
      // Flexible column matching
      const src = String(tx.sender_id || tx.Sender_ID || tx.Sender || '').trim();
      const dst = String(tx.receiver_id || tx.Receiver_ID || tx.Receiver || '').trim();
      let amt = parseFloat(tx.amount || tx.Amount || 0);
      if (isNaN(amt)) amt = 0;

      let timeStr = tx.timestamp || tx.Timestamp || tx.Time;
      let time = new Date();
      if (timeStr) time = new Date(timeStr);

      if (!src || !dst) return; // Skip invalid rows

      // Add Nodes
      if (!this.nodes.has(src)) this._initNode(src);
      if (!this.nodes.has(dst)) this._initNode(dst);

      // Update Stats
      const srcNode = this.nodes.get(src);
      srcNode.sent += amt;
      srcNode.count++;
      srcNode.timestamps.push(time);

      const dstNode = this.nodes.get(dst);
      dstNode.received += amt;
      dstNode.count++;
      dstNode.timestamps.push(time);

      // Edges
      if (!this.adj.has(src)) this.adj.set(src, []);
      this.adj.get(src).push(dst);

      if (!this.revAdj.has(dst)) this.revAdj.set(dst, []);
      this.revAdj.get(dst).push(src);

      this.links.push({ source: src, target: dst, amount: amt, type: 'normal' });
    });
  }

  _initNode(id) {
    this.nodes.set(id, {
      id, sent: 0, received: 0, count: 0, timestamps: [], patterns: new Set(), score: 0
    });
  }

  runAnalysis() {
    // Detect Patterns
    const cycles = this._findCycles();
    const smurfs = this._findSmurfing();
    const shells = this._findShells();

    // Filter Legitimate
    this._filterLegitimate(smurfs);

    // Compile Rings & Scores
    this._compileResults(cycles, smurfs, shells);

    // Build Graph Data
    const d3Nodes = Array.from(this.nodes.values()).map(n => ({
      id: n.id,
      type: this._getNodeType(n.id),
      risk_score: n.score,
      transaction_count: n.count,
      ring_id: n.ring_id
    }));

    // Map links to objects or IDs depending on what d3 expects (d3 modifies objects in place)
    // We return plain objects here
    const d3Links = this.links.map(l => ({
      source: l.source,
      target: l.target,
      type: this._getLinkType(l.source, l.target)
    }));

    return {
      analysis: {
        suspicious_accounts: this.suspicious,
        fraud_rings: this.rings,
        summary: { processing_time_seconds: 0 } // Initialize summary object
      },
      graph: { nodes: d3Nodes, links: d3Links }
    };
  }

  _findCycles() {
    const cycles = [];
    const visitedCycles = new Set();

    // Only verify nodes with In & Out degree > 0
    const candidates = Array.from(this.nodes.keys()).filter(id =>
      (this.adj.get(id)?.length > 0) && (this.revAdj.get(id)?.length > 0)
    );

    const dfs = (start, curr, path, depth) => {
      if (depth > 5) return;
      const neighbors = this.adj.get(curr) || [];

      for (const neighbor of neighbors) {
        if (neighbor === start && depth >= 3) {
          const cycleKey = [...path].sort().join('-');
          if (!visitedCycles.has(cycleKey)) {
            visitedCycles.add(cycleKey);
            cycles.push([...path]);
          }
        } else if (!path.includes(neighbor)) {
          dfs(start, neighbor, [...path, neighbor], depth + 1);
        }
      }
    };

    // Limit to first 1000 candidates for performance to prevent browser freeze
    candidates.slice(0, 1000).forEach(node => dfs(node, node, [node], 1));
    return cycles;
  }

  _findSmurfing() {
    const fanIn = [];
    const fanOut = [];

    this.nodes.forEach((stats, id) => {
      // Fan In > 10
      const senders = new Set(this.revAdj.get(id));
      if (senders.size >= 10 && this._checkTimeWindow(stats.timestamps, 10, 72)) {
        fanIn.push(id);
      }

      // Fan Out > 10
      const receivers = new Set(this.adj.get(id));
      if (receivers.size >= 10 && this._checkTimeWindow(stats.timestamps, 10, 72)) {
        fanOut.push(id);
      }
    });

    return { fanIn, fanOut };
  }

  _checkTimeWindow(timestamps, count, hours) {
    if (timestamps.length < count) return false;
    // Sort in place is fine here as we don't reuse original order
    timestamps.sort((a, b) => a - b);

    for (let i = 0; i <= timestamps.length - count; i++) {
      const diffMs = timestamps[i + count - 1] - timestamps[i];
      const diffHours = diffMs / (1000 * 60 * 60);
      if (diffHours <= hours) return true;
    }
    return false;
  }

  _findShells() {
    // Chain of low volume nodes (count <= 5)
    const shells = [];
    const weakNodes = new Set();

    this.nodes.forEach((stats, id) => {
      if (stats.count > 0 && stats.count <= 5) weakNodes.add(id);
    });

    const visited = new Set();

    weakNodes.forEach(startNode => {
      // visited check logic needs to be careful not to skip valid paths,
      // but for simple shell finding, ensuring we don't re-start from same node is good.
      if (visited.has(startNode)) return;

      // Trace chain
      let chain = [startNode];
      let curr = startNode;
      let pathVisited = new Set([startNode]);

      // Only look forward
      while (true) {
        const neighbors = this.adj.get(curr) || [];
        // Find a neighbor that is also a weak node and not already in this chain
        const nextWeak = neighbors.find(n => weakNodes.has(n) && !pathVisited.has(n));

        if (nextWeak) {
          chain.push(nextWeak);
          visited.add(nextWeak);
          pathVisited.add(nextWeak);
          curr = nextWeak;
        } else {
          break;
        }
      }

      if (chain.length >= 2) shells.push(chain);
    });

    return shells;
  }

  _filterLegitimate(smurfs) {
    // Payroll: Fan Out > 20, Fan In < 5
    smurfs.fanOut = smurfs.fanOut.filter(id => {
      const outD = (this.adj.get(id) || []).length;
      const inD = (this.revAdj.get(id) || []).length;
      return !(outD > 20 && inD < 5);
    });

    // Merchant: Fan In > 20, Fan Out < 5
    smurfs.fanIn = smurfs.fanIn.filter(id => {
      const outD = (this.adj.get(id) || []).length;
      const inD = (this.revAdj.get(id) || []).length;
      return !(inD > 20 && outD < 5);
    });
  }

  _compileResults(cycles, smurfs, shells) {
    let ringIdCounter = 1;

    // Helper
    const addRing = (members, type, score) => {
      const rid = `RING_${String(ringIdCounter++).padStart(3, '0')}`;
      this.rings.push({
        ring_id: rid, pattern_type: type, member_accounts: members, risk_score: score
      });
      members.forEach(m => {
        if (this.nodes.has(m)) {
          const n = this.nodes.get(m);
          n.ring_id = rid;
          n.patterns.add(type);
          n.score += (type === 'cycle' ? 50 : type === 'smurfing' ? 30 : 20);
        }
      });
    };

    cycles.forEach(c => addRing(c, 'cycle', 95));

    [...smurfs.fanIn, ...smurfs.fanOut].forEach(id => {
      if (this.nodes.get(id).patterns.has('cycle')) return;
      // Group with some neighbors
      const neighbors = (this.adj.get(id) || []).slice(0, 5);
      addRing([id, ...neighbors], 'smurfing', 75);
    });

    shells.forEach(chain => {
      // If any node in chain is already in a cycle, skip to avoid noise
      if (chain.some(n => this.nodes.get(n).patterns.has('cycle'))) return;
      addRing(chain, 'shell', 60);
    });

    // Finalize Suspicious List
    this.nodes.forEach(n => {
      if (n.count > 50) {
        n.score += 10;
        n.patterns.add('high_velocity');
      }
      if (n.score > 0) {
        this.suspicious.push({
          account_id: n.id,
          suspicion_score: Math.min(100, n.score),
          detected_patterns: Array.from(n.patterns),
          ring_id: n.ring_id || 'NONE'
        });
      }
    });

    this.suspicious.sort((a, b) => b.suspicion_score - a.suspicion_score);
    this.rings.sort((a, b) => b.risk_score - a.risk_score);
  }

  _getNodeType(id) {
    const n = this.nodes.get(id);
    if (n.patterns.has('cycle')) return 'fraud';
    if (n.score > 50) return 'suspicious';
    return 'normal';
  }

  _getLinkType(src, dst) {
    const sType = this._getNodeType(src);
    const dType = this._getNodeType(dst);
    if (sType === 'fraud' && dType === 'fraud') return 'fraud';
    if (sType === 'suspicious' || dType === 'suspicious') return 'suspicious';
    return 'normal';
  }
}

// === 4. rendering Logic ===
function renderDashboard(data) {
  currentData = data; // Update global state for export
  const { analysis, graph } = data;

  // KPIs
  const kpiRisk = document.getElementById('kpi-risk');
  if (kpiRisk) kpiRisk.textContent = calculateAvgRisk(analysis.suspicious_accounts) + '%';

  const kpiRings = document.getElementById('kpi-rings');
  if (kpiRings) kpiRings.textContent = analysis.fraud_rings.length;

  const kpiFlagged = document.getElementById('kpi-flagged');
  if (kpiFlagged) kpiFlagged.textContent = analysis.suspicious_accounts.length;

  const kpiTime = document.getElementById('kpi-time');
  if (kpiTime) {
    const timeVal = analysis.analysis?.summary?.processing_time_seconds || analysis.summary?.processing_time_seconds || 0;
    kpiTime.textContent = timeVal + 's';
  }

  // Graph
  initGraph(graph);

  // List
  const list = document.getElementById('suspiciousList');
  if (list) {
    list.innerHTML = '';
    analysis.suspicious_accounts.slice(0, 50).forEach(acc => {
      const div = document.createElement('div');
      div.className = 'list-item';
      div.innerHTML = `
                <span style="font-family:var(--font-mono)">${acc.account_id}</span>
                <span class="risk-tag ${acc.suspicion_score > 80 ? 'high' : 'med'}">${acc.suspicion_score}%</span>
            `;
      div.onclick = () => highlightNode(acc.account_id);
      list.appendChild(div);
    });
  }

  // Table
  const tbody = document.getElementById('ringsTableBody');
  if (tbody) {
    tbody.innerHTML = '';
    analysis.fraud_rings.forEach(ring => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
                <td style="font-family:var(--font-mono); color:var(--accent)">${ring.ring_id}</td>
                <td><span class="risk-tag ${ring.risk_score > 80 ? 'high' : 'med'}">${ring.pattern_type}</span></td>
                <td>${ring.member_accounts.length}</td>
                <td style="font-weight:bold">${ring.risk_score}</td>
            `;
      tbody.appendChild(tr);
    });
  }

  // Export Handler
  const exportBtn = document.getElementById('exportBtn');
  if (exportBtn) {
    exportBtn.onclick = () => {
      if (!currentData || !currentData.analysis) {
        alert("No analysis data available to export.");
        return;
      }

      // Populate summary details before export
      const exportData = {
        suspicious_accounts: currentData.analysis.suspicious_accounts,
        fraud_rings: currentData.analysis.fraud_rings,
        summary: {
          total_accounts_analyzed: currentData.graph.nodes.length,
          suspicious_accounts_flagged: currentData.analysis.suspicious_accounts.length,
          fraud_rings_detected: currentData.analysis.fraud_rings.length,
          processing_time_seconds: currentData.analysis.summary.processing_time_seconds
        }
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'fraud_analysis_report.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    };
  }
}

function calculateAvgRisk(accounts) {
  if (!accounts || !accounts.length) return 0;
  return (accounts.reduce((a, b) => a + b.suspicion_score, 0) / accounts.length).toFixed(1);
}

// D3 Graph Initialization
function initGraph(data) {
  const container = document.getElementById('graphContainer');
  if (!container) return;

  container.innerHTML = '';
  const width = container.clientWidth || 800;
  const height = container.clientHeight || 600;

  const svg = d3.select(container).append('svg')
    .attr('width', '100%').attr('height', '100%')
    .attr('viewBox', [0, 0, width, height])
    .call(d3.zoom().on('zoom', (e) => g.attr('transform', e.transform)));

  const g = svg.append('g');

  // Simulation
  simulation = d3.forceSimulation(data.nodes)
    .force('link', d3.forceLink(data.links).id(d => d.id).distance(60))
    .force('charge', d3.forceManyBody().strength(-150))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collide', d3.forceCollide(20)); // Increased collision radius

  // Links - IMPROVED VISIBILITY
  const link = g.append('g').selectAll('line')
    .data(data.links).join('line')
    .attr('stroke', d => d.type === 'fraud' ? 'var(--risk-high)' : d.type === 'suspicious' ? 'var(--risk-med)' : '#30363d')
    .attr('stroke-width', d => d.type === 'fraud' ? 3 : d.type === 'suspicious' ? 2 : 1) // Thicker fraud links
    .attr('stroke-opacity', d => d.type === 'fraud' || d.type === 'suspicious' ? 1.0 : 0.4); // More opaque

  // Nodes - IMPROVED VISIBILITY
  const node = g.append('g').selectAll('circle')
    .data(data.nodes).join('circle')
    .attr('r', d => d.type === 'fraud' ? 8 : d.type === 'suspicious' ? 6 : 4) // Bigger nodes
    .attr('fill', d => d.type === 'fraud' ? 'var(--risk-high)' : d.type === 'suspicious' ? 'var(--risk-med)' : '#4b5563')
    .attr('stroke', '#161b22').attr('stroke-width', 1.5)
    .call(d3.drag().on('start', dragstart).on('drag', dragged).on('end', dragend));

  // Tooltip
  const tooltip = document.getElementById('tooltip');

  if (tooltip) {
    node.on('mouseover', (e, d) => {
      tooltip.style.display = 'block';
      tooltip.style.left = (e.pageX + 10) + 'px';
      tooltip.style.top = (e.pageY + 10) + 'px';
      tooltip.innerHTML = `
                <div style="font-weight:bold; color:var(--text-primary); margin-bottom:6px">${d.id}</div>
                <div class="tip-row"><span>Risk Score</span> <span class="tip-val" style="color:${d.risk_score > 80 ? 'var(--risk-high)' : 'var(--risk-med)'}">${d.risk_score || 0}</span></div>
                <div class="tip-row"><span>Type</span> <span class="tip-val">${d.type}</span></div>
                ${d.ring_id ? `<div class="tip-row"><span>Ring ID</span> <span class="tip-val" style="color:var(--accent)">${d.ring_id}</span></div>` : ''}
            `;

      link.attr('stroke-opacity', l => (l.source === d || l.target === d) ? 1 : 0.1);
      node.attr('opacity', n => {
        const isNeighbor = data.links.some(l => (l.source === d && l.target === n) || (l.target === d && l.source === n));
        return (n === d || isNeighbor) ? 1 : 0.2;
      });
    }).on('mouseout', () => {
      tooltip.style.display = 'none';
      // Restore visibility logic - checking types
      link.attr('stroke-opacity', d => d.type === 'fraud' || d.type === 'suspicious' ? 1.0 : 0.4);
      node.attr('opacity', 1);
    });
  }

  simulation.on('tick', () => {
    link.attr('x1', d => d.source.x).attr('y1', d => d.source.y).attr('x2', d => d.target.x).attr('y2', d => d.target.y);
    node.attr('cx', d => d.x).attr('cy', d => d.y);
  });

  // Zoom Controls
  const zoomIn = document.getElementById('zoomIn');
  if (zoomIn) zoomIn.onclick = () => svg.transition().call(d3.zoom().scaleBy, 1.2);

  const zoomOut = document.getElementById('zoomOut');
  if (zoomOut) zoomOut.onclick = () => svg.transition().call(d3.zoom().scaleBy, 0.8);

  const fitView = document.getElementById('fitView');
  if (fitView) fitView.onclick = () => svg.transition().call(d3.zoom().transform, d3.zoomIdentity);

  function dragstart(e) { if (!e.active) simulation.alphaTarget(0.3).restart(); e.subject.fx = e.subject.x; e.subject.fy = e.subject.y; }
  function dragged(e) { e.subject.fx = e.x; e.subject.fy = e.y; }
  function dragend(e) { if (!e.active) simulation.alphaTarget(0); e.subject.fx = null; e.subject.fy = null; }
}

function highlightNode(id) {
  // Placeholder
}
