
// State
let dashboardData = null;
let simulation = null;

// Views
const uploadView = document.getElementById('view-upload');
const dashView = document.getElementById('view-dashboard');

// Upload Logic
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');

dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.style.borderColor = 'var(--accent)'; });
dropZone.addEventListener('dragleave', e => { dropZone.style.borderColor = 'var(--border)'; });
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.style.borderColor = 'var(--border)';
  const file = e.dataTransfer.files[0];
  if (file && file.name.endsWith('.csv')) processFile(file);
});

fileInput.addEventListener('change', e => {
  const file = e.target.files[0];
  if (file) processFile(file);
});

async function processFile(file) {
  const btn = document.getElementById('analyzeBtn');
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span> Processing...`;

  const formData = new FormData();
  formData.append('csv_file', file);

  try {
    const response = await fetch('/analyze', {
      method: 'POST',
      body: formData
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error);

    dashboardData = data;
    renderDashboard(data);

    // Swtich View
    uploadView.classList.remove('active');
    dashView.classList.add('active');
    document.getElementById('nav-dash').classList.add('active');

  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Analyze for Fraud Rings →';
  }
}

// Render Dashboard
function renderDashboard(data) {
  const { analysis, graph } = data;

  // KPIs
  document.getElementById('kpi-risk').textContent = calculateAvgRisk(analysis.suspicious_accounts) + '%';
  document.getElementById('kpi-rings').textContent = analysis.fraud_rings.length;
  document.getElementById('kpi-flagged').textContent = analysis.suspicious_accounts.length;
  document.getElementById('kpi-time').textContent = analysis.summary.processing_time_seconds + 's';

  // Graph
  initGraph(graph);

  // List
  const list = document.getElementById('suspiciousList');
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

  // Table
  const tbody = document.getElementById('ringsTableBody');
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

function calculateAvgRisk(accounts) {
  if (!accounts.length) return 0;
  return (accounts.reduce((a, b) => a + b.suspicion_score, 0) / accounts.length).toFixed(1);
}

// D3 Graph
function initGraph(data) {
  const container = document.getElementById('graphContainer');
  container.innerHTML = '';
  const width = container.clientWidth;
  const height = container.clientHeight;

  const svg = d3.select(container).append('svg')
    .attr('width', '100%').attr('height', '100%')
    .call(d3.zoom().on('zoom', (e) => g.attr('transform', e.transform)));

  const g = svg.append('g');

  simulation = d3.forceSimulation(data.nodes)
    .force('link', d3.forceLink(data.links).id(d => d.id).distance(60))
    .force('charge', d3.forceManyBody().strength(-200))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collide', d3.forceCollide(15));

  const link = g.append('g').selectAll('line')
    .data(data.links).join('line')
    .attr('stroke', d => d.type === 'fraud' ? 'var(--risk-high)' : d.type === 'suspicious' ? 'var(--risk-med)' : '#30363d')
    .attr('stroke-width', d => d.type === 'fraud' ? 2 : 1)
    .attr('stroke-opacity', 0.5);

  const node = g.append('g').selectAll('circle')
    .data(data.nodes).join('circle')
    .attr('r', d => d.type === 'fraud' ? 6 : 4)
    .attr('fill', d => d.type === 'fraud' ? 'var(--risk-high)' : d.type === 'suspicious' ? 'var(--risk-med)' : '#4b5563')
    .attr('stroke', '#161b22').attr('stroke-width', 1.5)
    .call(d3.drag().on('start', dragstart).on('drag', dragged).on('end', dragend));

  // Tooltip
  const tooltip = document.getElementById('tooltip');
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

    // Highlight logic
    link.attr('stroke-opacity', l => (l.source === d || l.target === d) ? 1 : 0.1);
    node.attr('opacity', n => {
      const isNeighbor = data.links.some(l => (l.source === d && l.target === n) || (l.target === d && l.source === n));
      return (n === d || isNeighbor) ? 1 : 0.2;
    });
  }).on('mouseout', () => {
    tooltip.style.display = 'none';
    link.attr('stroke-opacity', 0.5);
    node.attr('opacity', 1);
  });

  simulation.on('tick', () => {
    link.attr('x1', d => d.source.x).attr('y1', d => d.source.y).attr('x2', d => d.target.x).attr('y2', d => d.target.y);
    node.attr('cx', d => d.x).attr('cy', d => d.y);
  });

  function dragstart(e) { if (!e.active) simulation.alphaTarget(0.3).restart(); e.subject.fx = e.subject.x; e.subject.fy = e.subject.y; }
  function dragged(e) { e.subject.fx = e.x; e.subject.fy = e.y; }
  function dragend(e) { if (!e.active) simulation.alphaTarget(0); e.subject.fx = null; e.subject.fy = null; }

  // Zoom Controls
  document.getElementById('zoomIn').onclick = () => svg.transition().call(d3.zoom().scaleBy, 1.2);
  document.getElementById('zoomOut').onclick = () => svg.transition().call(d3.zoom().scaleBy, 0.8);
  document.getElementById('fitView').onclick = () => svg.transition().call(d3.zoom().transform, d3.zoomIdentity);
}

function highlightNode(id) {
  // Scroll to graph?
  // Find node and simulate logic? simple version for now
}
