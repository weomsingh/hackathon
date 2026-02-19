
// State
let currentAnalysis = null;
let simulation = null;

// DOM Elements
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const fileInfo = document.getElementById('fileInfo');
const analyzeBtn = document.getElementById('analyzeBtn');
const resultsSection = document.getElementById('resultsSection');
const errorBox = document.getElementById('errorBox');
const jsonPreview = document.getElementById('jsonPreview');

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
    const files = e.dataTransfer.files;
    if (files.length) handleFile(files[0]);
});

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length) handleFile(e.target.files[0]);
});

function handleFile(file) {
    if (!file.name.endsWith('.csv')) {
        showError('Please upload a valid .csv file');
        return;
    }

    fileInfo.style.display = 'block';
    fileInfo.innerHTML = `<strong>Selected:</strong> ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
    analyzeBtn.disabled = false;
    analyzeBtn.onclick = () => runAnalysis(file);

    // Hide error if present
    errorBox.style.display = 'none';
}

async function runAnalysis(file) {
    analyzeBtn.disabled = true;
    analyzeBtn.textContent = 'Processing...';
    errorBox.style.display = 'none';

    const formData = new FormData();
    formData.append('csv_file', file);

    try {
        const response = await fetch('/analyze', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (!response.ok) throw new Error(data.error || 'Analysis failed');

        currentAnalysis = data;
        renderResults(data);

    } catch (err) {
        showError(err.message);
    } finally {
        analyzeBtn.disabled = false;
        analyzeBtn.textContent = 'Analyze for Fraud Rings →';
    }
}

function showError(msg) {
    errorBox.style.display = 'block';
    errorBox.textContent = `⚠️ Error: ${msg}`;
}

function renderResults(data) {
    resultsSection.style.display = 'block';
    resultsSection.scrollIntoView({ behavior: 'smooth' });

    const { analysis, graph } = data;

    // 1. Summary Stats
    // Not explicitly in prompt design HTML but good to have

    // 2. Graph
    renderGraph(graph);

    // 3. Rings Table
    renderRingsTable(analysis.fraud_rings);

    // 4. Suspicious Table
    renderSuspiciousTable(analysis.suspicious_accounts);

    // 5. JSON Preview
    jsonPreview.textContent = JSON.stringify(analysis, null, 2);

    setupExportButtons(analysis);
}

// --- D3 Graph ---
function renderGraph(graphData) {
    const container = document.getElementById('graphContainer');
    container.innerHTML = '';
    const width = container.clientWidth;
    const height = 600;

    const svg = d3.select('#graphContainer').append('svg')
        .attr('width', width)
        .attr('height', height)
        .call(d3.zoom().on('zoom', (event) => {
            g.attr('transform', event.transform);
        }));

    // Markers
    const defs = svg.append('defs');
    ['normal', 'suspicious', 'fraud'].forEach(type => {
        const color = type === 'fraud' ? '#ef4444' : type === 'suspicious' ? '#f59e0b' : '#30363d';
        defs.append('marker')
            .attr('id', `arrow-${type}`)
            .attr('viewBox', '0 -5 10 10')
            .attr('refX', 20)
            .attr('refY', 0)
            .attr('markerWidth', 6)
            .attr('markerHeight', 6)
            .attr('orient', 'auto')
            .append('path')
            .attr('d', 'M0,-5L10,0L0,5')
            .attr('fill', color);
    });

    const g = svg.append('g');

    // Simulation
    simulation = d3.forceSimulation(graphData.nodes)
        .force('link', d3.forceLink(graphData.links).id(d => d.id).distance(80))
        .force('charge', d3.forceManyBody().strength(-200))
        .force('center', d3.forceCenter(width / 2, height / 2))
        .force('collide', d3.forceCollide(15));

    // Links
    const link = g.append('g')
        .selectAll('line')
        .data(graphData.links)
        .join('line')
        .attr('stroke', d => {
            if (d.type === 'fraud') return '#ef4444';
            if (d.type === 'suspicious') return '#f59e0b';
            return '#30363d';
        })
        .attr('stroke-width', d => d.type === 'normal' ? 1 : 2)
        .attr('stroke-opacity', 0.6)
        .attr('marker-end', d => `url(#arrow-${d.type})`);

    // Nodes
    const node = g.append('g')
        .selectAll('circle')
        .data(graphData.nodes)
        .join('circle')
        .attr('r', d => d.type === 'fraud' ? 8 : d.type === 'suspicious' ? 6 : 4)
        .attr('fill', d => {
            if (d.type === 'fraud') return '#ef4444';
            if (d.type === 'suspicious') return '#f59e0b'; // Amber
            if (d.type === 'aggregator') return '#14b8a6'; // Teal
            return '#30363d';
        })
        .attr('stroke', '#fff')
        .attr('stroke-width', d => d.type === 'fraud' ? 2 : 0)
        .call(d3.drag()
            .on('start', dragstarted)
            .on('drag', dragged)
            .on('end', dragended));

    // Tooltip interaction
    const tooltip = document.getElementById('nodeTooltip');

    node.on('mouseover', (event, d) => {
        tooltip.style.display = 'block';
        tooltip.style.left = (event.pageX + 10) + 'px';
        tooltip.style.top = (event.pageY + 10) + 'px';

        let ringHtml = d.ring_id ? `<div class="tooltip-row"><strong>Ring:</strong> <span style="color:#ef4444">${d.ring_id}</span></div>` : '';
        let scoreHtml = d.risk_score ? `<div class="tooltip-row"><strong>Risk:</strong> ${d.risk_score}</div>` : '';

        tooltip.innerHTML = `
            <div class="tooltip-id">${d.id}</div>
            ${scoreHtml}
            ${ringHtml}
            <div class="tooltip-row">Tx Count: ${d.transaction_count}</div>
        `;
    }).on('mouseout', () => {
        tooltip.style.display = 'none';
    });

    // Fraud Pulse Animation via CSS
    node.filter(d => d.type === 'fraud')
        .style('animation', 'fraud-pulse 1.5s infinite');

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

    // Controls
    document.getElementById('zoomInBtn').onclick = () => {
        svg.transition().call(d3.zoom().transform, d3.zoomIdentity.scale(1.2));
    };
    document.getElementById('zoomOutBtn').onclick = () => {
        svg.transition().call(d3.zoom().transform, d3.zoomIdentity.scale(0.8));
    };
    document.getElementById('resetViewBtn').onclick = () => {
        svg.transition().call(d3.zoom().transform, d3.zoomIdentity);
    };

    let highlight = false;
    document.getElementById('highlightFraudBtn').onclick = function () {
        highlight = !highlight;
        this.classList.toggle('active');

        if (highlight) {
            node.attr('opacity', d => d.type === 'fraud' ? 1 : 0.1);
            link.attr('opacity', d => d.type === 'fraud' ? 1 : 0.05);
        } else {
            node.attr('opacity', 1);
            link.attr('opacity', 0.6);
        }
    };
}

function renderRingsTable(rings) {
    const tbody = document.getElementById('fraudRingsTable');
    tbody.innerHTML = '';

    rings.forEach(ring => {
        const row = document.createElement('tr');

        let badgeClass = 'pill-amber'; // Default
        if (ring.pattern_type === 'cycle') badgeClass = 'pill-red';

        row.innerHTML = `
            <td style="color:var(--accent-amber); font-weight:bold;">${ring.ring_id}</td>
            <td><span class="pill ${badgeClass}">${ring.pattern_type}</span></td>
            <td style="color:var(--accent-teal); font-weight:bold;">${ring.member_accounts.length}</td>
            <td><strong>${ring.risk_score}</strong></td>
            <td style="font-size:0.8em; color:var(--text-secondary);">
                ${ring.member_accounts.slice(0, 3).join(', ')} 
                ${ring.member_accounts.length > 3 ? `+${ring.member_accounts.length - 3} more` : ''}
            </td>
        `;
        tbody.appendChild(row);
    });
}

function renderSuspiciousTable(accounts) {
    const tbody = document.getElementById('suspiciousAccountsTable');
    tbody.innerHTML = '';

    accounts.forEach((acc, index) => {
        const row = document.createElement('tr');

        // Progress bar width
        const width = acc.suspicion_score + '%';

        // Patterns badges
        const patternsHtml = acc.detected_patterns.map(p =>
            `<span class="pill pill-amber" style="margin-right:4px; font-size:0.7em;">${p}</span>`
        ).join('');

        row.innerHTML = `
            <td style="color:var(--text-secondary);">#${index + 1}</td>
            <td style="font-family:var(--font-mono); font-weight:500;">${acc.account_id}</td>
            <td>
                <div style="display:flex; align-items:center;">
                    <div class="score-container"><div class="score-bar" style="width:${width}"></div></div>
                    <span>${acc.suspicion_score}</span>
                </div>
            </td>
            <td>${acc.ring_id !== 'NONE' ? `<span class="pill pill-red">${acc.ring_id}</span>` : '-'}</td>
            <td>${patternsHtml}</td>
            <td><button class="btn-outline-teal" style="padding:4px 8px; font-size:0.75rem;">View</button></td>
        `;
        tbody.appendChild(row);
    });
}

function setupExportButtons(analysis) {
    document.getElementById('downloadJsonBtn').onclick = () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(analysis, null, 2));
        const a = document.createElement('a');
        a.href = dataStr;
        a.download = "forensic_report.json";
        a.click();
    };

    document.getElementById('copyJsonBtn').onclick = () => {
        navigator.clipboard.writeText(JSON.stringify(analysis, null, 2));
        const btn = document.getElementById('copyJsonBtn');
        const origText = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => btn.textContent = origText, 2000);
    };

    document.getElementById('exportCsvBtn').onclick = () => {
        // Simple CSV export of suspicious accounts
        let csvContent = "data:text/csv;charset=utf-8,Rank,AccountID,Score,RingID,Patterns\n";
        analysis.suspicious_accounts.forEach((acc, i) => {
            const patterns = acc.detected_patterns.join('|');
            csvContent += `${i + 1},${acc.account_id},${acc.suspicion_score},${acc.ring_id},${patterns}\n`;
        });
        const a = document.createElement('a');
        a.href = encodeURI(csvContent);
        a.download = "suspicious_accounts.csv";
        a.click();
    };
}
