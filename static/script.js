let currentAnalysis = null;
let currentGraph = null;
let selectedNode = null;
let d3Simulation = null;
let zoomBehavior = null;
let svg = null;
let graphGroup = null;
let nodeSelection = null;
let linkSelection = null;
let currentZoom = 1;
let accountsPage = 1;
const PAGE_SIZE = 25;

const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const analyzeBtn = document.getElementById('analyzeBtn');
const fileInfo = document.getElementById('fileInfo');
const errorBox = document.getElementById('errorBox');
const resultsSection = document.getElementById('resultsSection');
const emptyState = document.getElementById('emptyState');
const nodeTooltip = document.getElementById('nodeTooltip');
const nodeDetailPanel = document.getElementById('nodeDetailPanel');
const nodeDetailContent = document.getElementById('nodeDetailContent');

let selectedFile = null;

// ===== FILE UPLOAD =====
dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', e => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  handleFileSelect(file);
});
fileInput.addEventListener('change', e => handleFileSelect(e.target.files[0]));

function handleFileSelect(file) {
  if (!file) return;
  if (!file.name.toLowerCase().endsWith('.csv')) {
    showError('Please upload a .csv file. Other formats are not supported.');
    return;
  }
  selectedFile = file;
  fileInfo.innerHTML = `
    <span class="file-icon">✓</span>
    <span class="file-name">${file.name}</span>
    <span class="file-size">${(file.size / 1024).toFixed(1)} KB</span>
  `;
  fileInfo.style.display = 'flex';
}

// ===== ANALYZE =====
analyzeBtn.addEventListener('click', async () => {
  if (!selectedFile) {
    showError('Please select a CSV file first.');
    return;
  }

  setLoading(true);

  const formData = new FormData();
  formData.append('csv_file', selectedFile);

  try {
    const response = await fetch('/analyze', { method: 'POST', body: formData });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Analysis failed');

    currentAnalysis = data.analysis;
    currentGraph = data.graph;
    renderResults(data);
  } catch (err) {
    showError(err.message);
  } finally {
    setLoading(false);
  }
});

function renderResults(data) {
  const { analysis, graph } = data;
  emptyState.style.display = 'none';
  resultsSection.style.display = 'block';
  resultsSection.scrollIntoView({ behavior: 'smooth' });

  renderSummaryStats(analysis.summary);
  renderD3Graph(graph);
  renderFraudRingsTable(analysis.fraud_rings);
  accountsPage = 1;
  renderAccountsTable(analysis.suspicious_accounts);
  renderJsonPreview(analysis);
}

function renderSummaryStats(summary) {
  const grid = document.getElementById('summaryGrid');
  grid.innerHTML = '';
  const cards = [
    ['Total Accounts', summary.total_accounts_analyzed],
    ['Flagged Accounts', summary.suspicious_accounts_flagged],
    ['Fraud Rings', summary.fraud_rings_detected],
    ['Processing Time', `${summary.processing_time_seconds}s`],
  ];
  cards.forEach(([title, value]) => {
    const div = document.createElement('div');
    div.className = 'card summary-card';
    div.innerHTML = `<h4>${title}</h4><div class="value">${value}</div>`;
    grid.appendChild(div);
  });
}

// ===== D3 GRAPH =====
function renderD3Graph(graphData) {
  const container = document.getElementById('graphContainer');
  container.innerHTML = '';
  const width = container.clientWidth || 900;
  const height = 600;

  svg = d3.select(container).append('svg').attr('width', width).attr('height', height);
  graphGroup = svg.append('g');

  zoomBehavior = d3.zoom().scaleExtent([0.3, 5]).on('zoom', (event) => {
    graphGroup.attr('transform', event.transform);
    currentZoom = event.transform.k;
  });
  svg.call(zoomBehavior);

  const defs = svg.append('defs');
  ['normal', 'suspicious', 'fraud'].forEach(type => {
    defs.append('marker')
      .attr('id', `arrow-${type}`)
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 18)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', type === 'fraud' ? '#ff4757' : type === 'suspicious' ? '#ff6b35' : '#30363d');
  });

  linkSelection = graphGroup.append('g').selectAll('line')
    .data(graphData.links)
    .join('line')
    .attr('stroke', d => d.type === 'fraud' ? '#ff475788' : d.type === 'suspicious' ? '#ff6b3588' : '#30363d')
    .attr('stroke-width', d => d.type === 'fraud' ? 2.4 : d.type === 'suspicious' ? 1.7 : 1)
    .attr('marker-end', d => `url(#arrow-${d.type})`);

  nodeSelection = graphGroup.append('g').selectAll('circle')
    .data(graphData.nodes)
    .join('circle')
    .attr('r', d => d.type === 'fraud' ? 12 : d.type === 'suspicious' ? 10 : 6)
    .attr('fill', d => d.type === 'fraud' ? '#ff4757' : d.type === 'suspicious' ? '#ff6b35' : '#2dd4bf')
    .attr('stroke', d => d.type === 'fraud' ? '#f0a500' : 'none')
    .attr('stroke-width', d => d.type === 'fraud' ? 2 : 0)
    .style('cursor', 'pointer')
    .on('mouseover', showTooltip)
    .on('mousemove', moveTooltip)
    .on('mouseout', hideTooltip)
    .on('click', showNodeDetail)
    .call(d3.drag().on('start', dragstarted).on('drag', dragged).on('end', dragended));

  nodeSelection.filter(d => d.type === 'fraud').style('animation', 'fraud-pulse 1.5s ease-in-out infinite');

  d3Simulation = d3.forceSimulation(graphData.nodes)
    .force('link', d3.forceLink(graphData.links).id(d => d.id).distance(80))
    .force('charge', d3.forceManyBody().strength(-250))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collision', d3.forceCollide().radius(d => (d.type === 'fraud' ? 18 : 12)));

  d3Simulation.on('tick', () => {
    linkSelection
      .attr('x1', d => d.source.x)
      .attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x)
      .attr('y2', d => d.target.y);

    nodeSelection.attr('cx', d => d.x).attr('cy', d => d.y);
  });

  bindGraphControls();

  function dragstarted(event) {
    if (!event.active) d3Simulation.alphaTarget(0.3).restart();
    event.subject.fx = event.subject.x;
    event.subject.fy = event.subject.y;
  }
  function dragged(event) {
    event.subject.fx = event.x;
    event.subject.fy = event.y;
  }
  function dragended(event) {
    if (!event.active) d3Simulation.alphaTarget(0);
    event.subject.fx = null;
    event.subject.fy = null;
  }
}

function bindGraphControls() {
  const zoomInBtn = document.getElementById('zoomInBtn');
  const zoomOutBtn = document.getElementById('zoomOutBtn');
  const resetViewBtn = document.getElementById('resetViewBtn');
  const highlightFraudBtn = document.getElementById('highlightFraudBtn');
  const showAllConnectionsBtn = document.getElementById('showAllConnectionsBtn');

  zoomInBtn.onclick = () => svg.transition().duration(220).call(zoomBehavior.scaleBy, 1.2);
  zoomOutBtn.onclick = () => svg.transition().duration(220).call(zoomBehavior.scaleBy, 0.85);
  resetViewBtn.onclick = () => svg.transition().duration(220).call(zoomBehavior.transform, d3.zoomIdentity);

  let fraudOnly = false;
  highlightFraudBtn.onclick = () => {
    fraudOnly = !fraudOnly;
    highlightFraudBtn.classList.toggle('active', fraudOnly);
    if (fraudOnly) {
      nodeSelection.attr('opacity', d => d.type === 'fraud' ? 1 : 0.2);
      linkSelection.attr('opacity', d => d.type === 'fraud' ? 1 : 0.08);
    } else {
      nodeSelection.attr('opacity', 1);
      linkSelection.attr('opacity', 1);
    }
  };

  let showAll = true;
  showAllConnectionsBtn.onclick = () => {
    showAll = !showAll;
    showAllConnectionsBtn.classList.toggle('active', !showAll);
    if (showAll) {
      linkSelection.attr('display', 'inline');
    } else {
      linkSelection.attr('display', d => d.type === 'normal' ? 'none' : 'inline');
    }
  };
}

// ===== TOOLTIP =====
function showTooltip(event, d) {
  nodeTooltip.innerHTML = `
    <div class="tooltip-id">${d.id}</div>
    <div class="tooltip-risk">Risk Score: ${Number(d.risk_score || 0).toFixed(1)}</div>
    <div class="tooltip-ring">Ring: ${d.ring_id || 'NONE'}</div>
    <div class="tooltip-patterns">Patterns: ${(d.detected_patterns || []).join(', ') || 'none'}</div>
    <div class="tooltip-stats">Sent: $${Number(d.total_sent || 0).toLocaleString()} | Received: $${Number(d.total_received || 0).toLocaleString()} | Txns: ${d.transaction_count || 0}</div>
  `;
  nodeTooltip.style.display = 'block';
  moveTooltip(event);
}

function moveTooltip(event) {
  nodeTooltip.style.left = `${event.pageX + 12}px`;
  nodeTooltip.style.top = `${event.pageY + 12}px`;
}

function hideTooltip() {
  nodeTooltip.style.display = 'none';
}

// ===== NODE DETAIL PANEL =====
function showNodeDetail(event, d) {
  selectedNode = d;
  const score = Number(d.risk_score || 0);
  const riskBadge = score >= 80 ? 'badge-high' : score >= 50 ? 'badge-mid' : 'badge-low';
  const riskLabel = score >= 80 ? 'High Risk' : score >= 50 ? 'Moderate Risk' : 'Low Risk';
  const patterns = (d.detected_patterns || []).map(p => `<span class="inline-pill pill-yellow">${p}</span>`).join('');

  nodeDetailContent.innerHTML = `
    <div class="detail-id">${d.id}</div>
    <div class="badge ${riskBadge}">${riskLabel}</div>

    <div class="muted" style="margin-top:10px;">Suspicion Score</div>
    <div class="score-track"><div class="score-bar" style="--score-pct:${Math.max(0, Math.min(100, score))}%"></div></div>
    <div>${score.toFixed(1)}</div>

    <div class="muted" style="margin-top:10px;">Detected Patterns</div>
    <div>${patterns || '<span class="muted">None</span>'}</div>

    <div class="muted" style="margin-top:10px;">Ring Membership</div>
    <div class="mono">${d.ring_id || 'NONE'}</div>

    <div class="muted" style="margin-top:10px;">Transaction Stats</div>
    <table>
      <tr><td>Sent</td><td>$${Number(d.total_sent || 0).toLocaleString()}</td></tr>
      <tr><td>Received</td><td>$${Number(d.total_received || 0).toLocaleString()}</td></tr>
      <tr><td>Transaction Count</td><td>${d.transaction_count || 0}</td></tr>
    </table>
  `;

  nodeDetailPanel.classList.add('open');
}

document.getElementById('closePanelBtn').addEventListener('click', () => {
  nodeDetailPanel.classList.remove('open');
});

// ===== FRAUD RINGS TABLE =====
function renderFraudRingsTable(rings) {
  const tbody = document.getElementById('ringsTableBody');
  tbody.innerHTML = '';

  rings.forEach(ring => {
    const tr = document.createElement('tr');
    const typeClass = ring.pattern_type === 'cycle' ? 'pill-red' : ring.pattern_type === 'smurfing' ? 'pill-orange' : ring.pattern_type === 'shell' ? 'pill-yellow' : 'pill-mixed';
    const riskColor = ring.risk_score >= 80 ? '#ff4757' : ring.risk_score >= 50 ? '#ff6b35' : '#f0a500';

    const preview = ring.member_accounts.slice(0, 3).map(id => `<span class="mono link-inline" data-account="${id}">${id}</span>`).join(', ');
    const extra = ring.member_accounts.length > 3 ? `<span class="link-inline show-more" data-members="${ring.member_accounts.join('|')}">+${ring.member_accounts.length - 3} more</span>` : '';

    tr.innerHTML = `
      <td class="mono ring-id">${ring.ring_id}</td>
      <td><span class="inline-pill ${typeClass}">${ring.pattern_type}</span></td>
      <td class="member-count">${ring.member_accounts.length}</td>
      <td style="color:${riskColor};font-weight:700;">${Number(ring.risk_score).toFixed(1)}</td>
      <td>${preview} ${extra}</td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('.show-more').forEach(el => {
    el.addEventListener('click', () => {
      const all = el.getAttribute('data-members').split('|');
      el.parentElement.innerHTML = all.map(id => `<span class="mono link-inline" data-account="${id}">${id}</span>`).join(', ');
      bindAccountLinks();
    });
  });

  bindAccountLinks();
}

function bindAccountLinks() {
  document.querySelectorAll('[data-account]').forEach(el => {
    el.addEventListener('click', () => highlightNode(el.getAttribute('data-account')));
  });
}

document.getElementById('exportTableCsvBtn').addEventListener('click', () => {
  if (!currentAnalysis) return;
  const rows = [['ring_id', 'pattern_type', 'member_count', 'risk_score', 'member_accounts']];
  currentAnalysis.fraud_rings.forEach(r => rows.push([r.ring_id, r.pattern_type, r.member_accounts.length, r.risk_score, r.member_accounts.join(';')]));
  downloadCsv(rows, 'fraud_rings.csv');
});

// ===== SUSPICIOUS ACCOUNTS TABLE =====
function renderAccountsTable(accounts) {
  const query = document.getElementById('accountSearch').value.trim().toLowerCase();
  const filtered = accounts.filter(acc => {
    if (!query) return true;
    return acc.account_id.toLowerCase().includes(query)
      || acc.ring_id.toLowerCase().includes(query)
      || acc.detected_patterns.some(p => p.toLowerCase().includes(query));
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  if (accountsPage > totalPages) accountsPage = totalPages;
  const start = (accountsPage - 1) * PAGE_SIZE;
  const pageRows = filtered.slice(start, start + PAGE_SIZE);

  const tbody = document.getElementById('suspiciousAccountsTable');
  tbody.innerHTML = '';
  pageRows.forEach((acc, idx) => {
    const tr = document.createElement('tr');
    const rank = start + idx + 1;
    const inRing = acc.ring_id !== 'NONE';
    const patternHtml = acc.detected_patterns.map(p => `<span class="inline-pill ${patternClass(p)}">${p}</span>`).join('');

    tr.innerHTML = `
      <td>${rank}</td>
      <td class="mono" style="color:${inRing ? '#f0a500' : '#e6edf3'}">${acc.account_id}</td>
      <td>
        <div class="score-track"><div class="score-bar" style="--score-pct:${Math.max(0, Math.min(100, acc.suspicion_score))}%"></div></div>
        <div>${Number(acc.suspicion_score).toFixed(1)}</div>
      </td>
      <td>${acc.ring_id !== 'NONE' ? `<span class="inline-pill pill-red link-inline" data-ring="${acc.ring_id}">${acc.ring_id}</span>` : '-'}</td>
      <td>${patternHtml}</td>
      <td><button class="pill-btn" data-highlight="${acc.account_id}">Highlight in Graph</button></td>
    `;
    tbody.appendChild(tr);
  });

  document.getElementById('pageInfo').textContent = `Page ${accountsPage} / ${totalPages}`;
  document.getElementById('prevPageBtn').disabled = accountsPage === 1;
  document.getElementById('nextPageBtn').disabled = accountsPage === totalPages;

  tbody.querySelectorAll('[data-highlight]').forEach(btn => {
    btn.addEventListener('click', () => highlightNode(btn.getAttribute('data-highlight')));
  });

  tbody.querySelectorAll('[data-ring]').forEach(btn => {
    btn.addEventListener('click', () => {
      const ringId = btn.getAttribute('data-ring');
      const member = currentAnalysis.fraud_rings.find(r => r.ring_id === ringId)?.member_accounts?.[0];
      if (member) highlightNode(member);
    });
  });
}

function patternClass(pattern) {
  if (pattern.startsWith('cycle_length')) return 'pill-red';
  if (pattern.startsWith('fan_in') || pattern.startsWith('fan_out')) return 'pill-orange';
  if (pattern === 'high_velocity') return 'pill-yellow';
  if (pattern === 'shell_chain') return 'pill-mixed';
  return 'pill-yellow';
}

document.getElementById('accountSearch').addEventListener('input', () => {
  accountsPage = 1;
  if (currentAnalysis) renderAccountsTable(currentAnalysis.suspicious_accounts);
});

document.getElementById('prevPageBtn').addEventListener('click', () => {
  if (accountsPage > 1) accountsPage -= 1;
  renderAccountsTable(currentAnalysis.suspicious_accounts);
});

document.getElementById('nextPageBtn').addEventListener('click', () => {
  accountsPage += 1;
  renderAccountsTable(currentAnalysis.suspicious_accounts);
});

function highlightNode(accountId) {
  if (!nodeSelection) return;
  nodeSelection.attr('opacity', d => d.id === accountId ? 1 : 0.2);
  linkSelection.attr('opacity', d => d.source.id === accountId || d.target.id === accountId ? 1 : 0.08);
  const found = currentGraph.nodes.find(n => n.id === accountId);
  if (found) showNodeDetail(null, found);
  document.getElementById('graphContainer').scrollIntoView({ behavior: 'smooth' });
}

// ===== EXPORTS =====
document.getElementById('downloadJsonBtn').addEventListener('click', () => {
  if (!currentAnalysis) return;
  const blob = new Blob([JSON.stringify(currentAnalysis, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'forensics_report.json';
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById('copyJsonBtn').addEventListener('click', async () => {
  if (!currentAnalysis) return;
  const btn = document.getElementById('copyJsonBtn');
  await navigator.clipboard.writeText(JSON.stringify(currentAnalysis, null, 2));
  btn.textContent = '✓ Copied!';
  setTimeout(() => { btn.textContent = '📋 Copy JSON to Clipboard'; }, 2000);
});

document.getElementById('exportCsvBtn').addEventListener('click', () => {
  if (!currentAnalysis) return;
  const rows = [['account_id', 'suspicion_score', 'ring_id', 'detected_patterns']];
  currentAnalysis.suspicious_accounts.forEach(a => {
    rows.push([a.account_id, a.suspicion_score, a.ring_id, a.detected_patterns.join(';')]);
  });
  downloadCsv(rows, 'suspicious_accounts.csv');
});

function downloadCsv(rows, filename) {
  const csv = rows.map(r => r.map(v => {
    const s = String(v);
    return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ===== JSON PREVIEW =====
function renderJsonPreview(data) {
  const pre = document.getElementById('jsonPreview');
  const raw = JSON.stringify(data, null, 2)
    .replace(/"([^"]+)":/g, '<span class="json-key">"$1"</span>:')
    .replace(/: "([^"]*)"/g, ': <span class="json-string">"$1"</span>')
    .replace(/: (\d+\.?\d*)/g, ': <span class="json-number">$1</span>');
  pre.innerHTML = raw;
}

document.getElementById('togglePreviewBtn').addEventListener('click', () => {
  const pre = document.getElementById('jsonPreview');
  const btn = document.getElementById('togglePreviewBtn');
  const open = pre.style.display === 'block';
  pre.style.display = open ? 'none' : 'block';
  btn.textContent = open ? 'Preview JSON Output ▼' : 'Preview JSON Output ▲';
});

// ===== LOADING =====
function setLoading(loading) {
  if (loading) {
    analyzeBtn.disabled = true;
    analyzeBtn.innerHTML = '<span class="spinner"></span> Analyzing transactions...';
  } else {
    analyzeBtn.disabled = false;
    analyzeBtn.innerHTML = 'Analyze for Fraud Rings →';
  }
}

// ===== ERROR DISPLAY =====
function showError(message) {
  errorBox.innerHTML = `
    <span class="error-icon">⚠️</span>
    <div>
      <div class="error-title" style="font-family: 'Fraunces', serif;">Something went wrong</div>
      <div class="error-message">${message}</div>
      ${message.toLowerCase().includes('column') ? '<div class="error-hint">Tip: Rename CSV columns to: sender_id, receiver_id, amount, timestamp</div>' : ''}
    </div>
  `;
  errorBox.style.display = 'flex';
}
