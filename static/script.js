
// State Management
let currentAnalysis = null;
let simulation = null;
let currentZoom = d3.zoomIdentity;

// DOM Elements
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const analyzeBtn = document.getElementById('analyzeBtn');
const viewUpload = document.getElementById('view-upload');
const viewDashboard = document.getElementById('view-dashboard');
const pageTitle = document.getElementById('page-title');
const navItems = document.querySelectorAll('.nav-item');
const errorBanner = document.getElementById('errorBanner');

// Navigation Logic
navItems.forEach(item => {
    item.addEventListener('click', function () {
        if (this.id === 'nav-dashboard' && currentAnalysis) {
            switchView('dashboard');
        } else if (this.id === 'nav-analysis') {
            // Placeholder for future specialized graph view
        }
    });
});

function switchView(viewName) {
    if (viewName === 'dashboard') {
        viewUpload.style.display = 'none';
        viewDashboard.style.display = 'block';
        pageTitle.textContent = 'Dashboard Overview';
        document.getElementById('nav-dashboard').classList.add('active');
        // Trigger graph resize
        if (simulation) simulation.restart();
    } else {
        viewUpload.style.display = 'block';
        viewDashboard.style.display = 'none';
        pageTitle.textContent = 'Upload Dataset';
    }
}

// File Upload Logic
dropZone.addEventListener('click', () => fileInput.click());

dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
});

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length) handleFile(e.target.files[0]);
});

function handleFile(file) {
    if (!file.name.endsWith('.csv')) {
        showError('Invalid Format. Please upload .csv files only.');
        return;
    }

    // Update UI State
    document.querySelector('.upload-content').style.display = 'none';
    const preview = document.getElementById('filePreview');
    preview.style.display = 'flex';
    document.getElementById('fileName').textContent = file.name;
    document.getElementById('fileSize').textContent = (file.size / 1024).toFixed(1) + ' KB';

    analyzeBtn.disabled = false;
    analyzeBtn.onclick = () => runAnalysis(file);
    errorBanner.style.display = 'none';
}

document.getElementById('removeFileBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    document.querySelector('.upload-content').style.display = 'block';
    document.getElementById('filePreview').style.display = 'none';
    analyzeBtn.disabled = true;
    fileInput.value = '';
});

function showError(msg) {
    errorBanner.style.display = 'flex';
    document.getElementById('errorText').textContent = msg;
}

// Analysis Loop
async function runAnalysis(file) {
    const btn = analyzeBtn;
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span> Processing...`;

    const formData = new FormData();
    formData.append('csv_file', file);

    try {
        const response = await fetch('/analyze', { method: 'POST', body: formData });
        const data = await response.json();

        if (!response.ok) throw new Error(data.error || 'Server Error');

        currentAnalysis = data;
        renderDashboard(data);
        switchView('dashboard');

    } catch (err) {
        showError(err.message);
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

// --- DASHBOARD RENDERERS ---
function renderDashboard(data) {
    const { analysis, graph } = data;

    // 1. KPIs
    const statsContainer = document.getElementById('summaryStats');
    statsContainer.innerHTML = `
        <div class="kpi-card">
            <span class="kpi-label">Risk Score</span>
            <span class="kpi-value" style="color:var(--color-risk-high)">${calculateAvgRisk(analysis.suspicious_accounts)}%</span>
        </div>
        <div class="kpi-card">
            <span class="kpi-label">Fraud Rings</span>
            <span class="kpi-value">${analysis.fraud_rings.length}</span>
        </div>
        <div class="kpi-card">
            <span class="kpi-label">Flagged Accounts</span>
            <span class="kpi-value">${analysis.suspicious_accounts.length}</span>
        </div>
        <div class="kpi-card">
            <span class="kpi-label">Processing Time</span>
            <span class="kpi-value">${analysis.summary.processing_time_seconds}s</span>
        </div>
    `;

    // 2. Graph
    initD3Graph(graph);

    // 3. Lists
    renderSuspiciousList(analysis.suspicious_accounts);

    // 4. Tables
    renderFraudRings(analysis.fraud_rings);
}

function calculateAvgRisk(accounts) {
    if (!accounts.length) return 0;
    const sum = accounts.reduce((acc, curr) => acc + curr.suspicion_score, 0);
    return (sum / accounts.length).toFixed(1);
}

function renderSuspiciousList(accounts) {
    const list = document.getElementById('suspiciousList');
    list.innerHTML = '';

    accounts.slice(0, 50).forEach(acc => {
        const item = document.createElement('div');
        item.className = 'list-item';
        const riskClass = acc.suspicion_score > 80 ? 'high' : 'med';

        item.innerHTML = `
            <span class="acct-id">${acc.account_id}</span>
            <span class="risk-tag ${riskClass}">Risk: ${acc.suspicion_score}</span>
        `;
        item.onclick = () => showAccountDetails(acc);
        list.appendChild(item);
    });
}

function renderFraudRings(rings) {
    const tbody = document.getElementById('ringsTableBody');
    tbody.innerHTML = '';

    rings.forEach(ring => {
        const row = document.createElement('tr');
        const patternClass = ring.pattern_type === 'cycle' ? 'pill cycle'
            : ring.pattern_type === 'smurfing' ? 'pill smurf' : 'pill shell';

        row.innerHTML = `
            <td style="font-family:var(--font-mono); color:var(--color-accent);">${ring.ring_id}</td>
            <td><span class="${patternClass}">${ring.pattern_type}</span></td>
            <td>${ring.member_accounts.length} Nodes</td>
            <td style="font-weight:bold; color:${ring.risk_score > 80 ? 'var(--color-risk-high)' : 'var(--color-risk-med)'}">${ring.risk_score}</td>
            <td style="font-size:0.85rem; color:var(--color-text-tertiary); max-width:200px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                ${ring.member_accounts.join(', ')}
            </td>
            <td>Active</td>
        `;
        tbody.appendChild(row);
    });
}

function showAccountDetails(acc) {
    const content = document.getElementById('detailContent');
    const empty = document.querySelector('.empty-state-panel');

    empty.style.display = 'none';
    content.style.display = 'block';

    content.innerHTML = `
        <div style="border-bottom:1px solid var(--color-border); padding-bottom:1rem; margin-bottom:1rem;">
            <h4 style="font-family:var(--font-mono); font-size:1.2rem; margin-bottom:0.5rem; color:#fff;">${acc.account_id}</h4>
            <div style="display:flex; justify-content:space-between; font-size:0.9rem;">
                <span>Suspicion Score:</span>
                <span style="color:${acc.suspicion_score > 80 ? 'var(--color-risk-high)' : 'var(--color-risk-med)'}; font-weight:bold;">${acc.suspicion_score}</span>
            </div>
        </div>
        
        <div style="margin-bottom:1rem;">
            <h5 style="color:var(--color-text-secondary); margin-bottom:0.5rem;">Detected Patterns</h5>
            <div style="display:flex; flex-wrap:wrap; gap:4px;">
                ${acc.detected_patterns.map(p => `<span class="risk-tag high">${p}</span>`).join('')}
            </div>
        </div>
        
        <div>
            <h5 style="color:var(--color-text-secondary); margin-bottom:0.5rem;">Ring Membership</h5>
            <div style="font-family:var(--font-mono); color:var(--color-accent); font-weight:500;">
                ${acc.ring_id !== 'NONE' ? acc.ring_id : 'No Ring Association'}
            </div>
        </div>
    `;
}

// --- D3.js Implementation ---
function initD3Graph(graphData) {
    const container = document.getElementById('graphContainer');
    container.innerHTML = ''; // Clear

    const width = container.clientWidth;
    const height = container.clientHeight || 600;

    // Zoom behavior
    const zoom = d3.zoom()
        .scaleExtent([0.1, 4])
        .on('zoom', (event) => {
            currentZoom = event.transform;
            g.attr('transform', event.transform);
        });

    const svg = d3.select(container).append('svg')
        .attr('width', '100%')
        .attr('height', '100%')
        .attr('viewBox', [0, 0, width, height])
        .call(zoom)
        .on('dblclick.zoom', null); // Disable double click zoom

    // Define Grid Pattern for Background
    const defs = svg.append('defs');
    const pattern = defs.append('pattern')
        .attr('id', 'grid')
        .attr('width', 40)
        .attr('height', 40)
        .attr('patternUnits', 'userSpaceOnUse');
    pattern.append('path')
        .attr('d', 'M 40 0 L 0 0 0 40')
        .attr('fill', 'none')
        .attr('stroke', 'rgba(255,255,255,0.03)')
        .attr('stroke-width', 1);

    svg.append('rect')
        .attr('width', '100%')
        .attr('height', '100%')
        .attr('fill', 'url(#grid)');

    const g = svg.append('g');

    // Simulation Setup
    simulation = d3.forceSimulation(graphData.nodes)
        .force('link', d3.forceLink(graphData.links).id(d => d.id).distance(60))
        .force('charge', d3.forceManyBody().strength(-150))
        .force('center', d3.forceCenter(width / 2, height / 2))
        .force('collide', d3.forceCollide(20));

    // Links
    const link = g.append('g')
        .selectAll('line')
        .data(graphData.links)
        .join('line')
        .attr('stroke', d => d.type === 'fraud' ? 'var(--color-risk-high)' : d.type === 'suspicious' ? 'var(--color-risk-med)' : '#30363d')
        .attr('stroke-opacity', 0.4)
        .attr('stroke-width', d => d.type === 'fraud' ? 2 : 1);

    // Nodes
    const node = g.append('g')
        .selectAll('circle')
        .data(graphData.nodes)
        .join('circle')
        .attr('r', d => d.type === 'fraud' ? 8 : d.type === 'suspicious' ? 6 : 4)
        .attr('fill', d => {
            if (d.type === 'fraud') return 'var(--color-risk-high)';
            if (d.type === 'suspicious') return 'var(--color-risk-med)';
            return '#4b5563';
        })
        .attr('stroke', '#161b22')
        .attr('stroke-width', 1.5)
        .call(d3.drag()
            .on('start', dragstarted)
            .on('drag', dragged)
            .on('end', dragended));

    // Node Interactions
    const tooltip = document.getElementById('nodeTooltip');

    node.on('mouseover', (event, d) => {
        const [x, y] = d3.pointer(event, document.body);
        tooltip.style.display = 'block';
        tooltip.style.left = (x + 15) + 'px';
        tooltip.style.top = (y - 10) + 'px';

        let ringHtml = d.ring_id ? `<div class="tip-row"><span>Ring ID:</span> <span style="color:var(--color-accent)">${d.ring_id}</span></div>` : '';

        tooltip.innerHTML = `
            <div class="tip-header">
                <span class="tip-id">${d.id}</span>
                <span class="tip-score">${d.risk_score || 0}</span>
            </div>
            ${ringHtml}
            <div class="tip-row"><span>Transactions:</span> <span>${d.transaction_count}</span></div>
            <div class="tip-row"><span>Type:</span> <span style="color:${d.type === 'fraud' ? 'var(--color-risk-high)' : '#fff'}">${d.type.toUpperCase()}</span></div>
        `;

        // Highlight neighbors
        link.attr('stroke-opacity', l => (l.source === d || l.target === d) ? 1 : 0.1);
        node.attr('opacity', n => {
            const isNeighbor = graphData.links.some(l =>
                (l.source === d && l.target === n) || (l.target === d && l.source === n)
            );
            return (n === d || isNeighbor) ? 1 : 0.2;
        });
    })
        .on('mouseout', () => {
            tooltip.style.display = 'none';
            link.attr('stroke-opacity', 0.4);
            node.attr('opacity', 1);
        })
        .on('click', (event, d) => {
            showAccountDetails(d);
        });

    simulation.on('tick', () => {
        link
            .attr('x1', d => d.source.x)
            .attr('y1', d => d.source.y)
            .attr('x2', d => d.target.x)
            .attr('y2', d => d.target.y);

        node
            .attr('cx', d => d.x)
            .attr('cy', d => d.y);
    });

    function dragstarted(event) {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        event.subject.fx = event.subject.x;
        event.subject.fy = event.subject.y;
    }

    function dragged(event) {
        event.subject.fx = event.x;
        event.subject.fy = event.y;
    }

    function dragended(event) {
        if (!event.active) simulation.alphaTarget(0);
        event.subject.fx = null;
        event.subject.fy = null;
    }

    // Controls Logic
    document.getElementById('zoomInBtn').onclick = () => svg.transition().call(zoom.scaleBy, 1.3);
    document.getElementById('zoomOutBtn').onclick = () => svg.transition().call(zoom.scaleBy, 0.7);
    document.getElementById('resetViewBtn').onclick = () => svg.transition().call(zoom.transform, d3.zoomIdentity);

    let highlightMode = false;
    document.getElementById('highlightFraudBtn').onclick = function () {
        highlightMode = !highlightMode;
        this.classList.toggle('active');

        if (highlightMode) {
            node.attr('opacity', d => d.type === 'fraud' ? 1 : 0.1);
            link.attr('stroke-opacity', d => d.type === 'fraud' ? 1 : 0.05);
        } else {
            node.attr('opacity', 1);
            link.attr('stroke-opacity', 0.4);
        }
    };
}
