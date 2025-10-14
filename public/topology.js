(() => {
  const stage = document.querySelector('.workspace-stage');
  const canvas = document.getElementById('topology-canvas');
  const linkLayer = document.getElementById('link-layer');
  if (!stage || !canvas || !linkLayer) return;

  const emptyHint = canvas.querySelector('.empty-hint');
  const paletteButtons = document.querySelectorAll('.palette-buttons button');
  const linkModeBtn = document.getElementById('link-mode');
  const cancelLinkBtn = document.getElementById('cancel-link');
  const bondModeBtn = document.getElementById('bond-mode');
  const cancelBondBtn = document.getElementById('cancel-bond');
  const clearBtn = document.getElementById('clear-canvas');
  const exportBtn = document.getElementById('export-topology');
  const exportJpgBtn = document.getElementById('export-topology-jpg');
  const toggleSnapBtn = document.getElementById('toggle-snap');
  const fitViewBtn = document.getElementById('fit-view');
  const importInput = document.getElementById('import-topology');
  const SVG_NS = 'http://www.w3.org/2000/svg';

  const GRID_SIZE = 20;
  const MIN_ARTBOARD_WIDTH = 2400;
  const MIN_ARTBOARD_HEIGHT = 1600;
  const ARTBOARD_MARGIN = 240;

  let bondsSvgLayer = document.getElementById('bond-layer');
  if (!bondsSvgLayer) {
    bondsSvgLayer = document.createElementNS(SVG_NS, 'g');
    bondsSvgLayer.setAttribute('id', 'bond-layer');
    linkLayer.appendChild(bondsSvgLayer);
  } else if (bondsSvgLayer.parentNode !== linkLayer) {
    linkLayer.appendChild(bondsSvgLayer);
  }

  const nodeForm = document.getElementById('node-form');
  const nodeFormId = nodeForm?.querySelector('input[name="node-id"]');
  const nodeLabelInput = document.getElementById('node-label');
  const nodeTypeSelect = document.getElementById('node-type');
  const nodeNotesInput = document.getElementById('node-notes');
  const deleteNodeBtn = document.getElementById('delete-node');

  const linkForm = document.getElementById('link-form');
  const linkFormId = linkForm?.querySelector('input[name="link-id"]');
  const linkLabelInput = document.getElementById('link-label');
  const linkAInput = document.getElementById('link-a');
  const linkBInput = document.getElementById('link-b');
  const linkNotesInput = document.getElementById('link-notes');
  const deleteLinkBtn = document.getElementById('delete-link');

  const bondForm = document.getElementById('bond-form');
  const bondFormId = bondForm?.querySelector('input[name="bond-id"]');
  const bondLabelInput = document.getElementById('bond-label');
  const bondLinksList = document.getElementById('bond-links');
  const bondCountLabel = document.getElementById('bond-count');
  const deleteBondBtn = document.getElementById('delete-bond');

  const typeIcons = {
    router: 'R',
    switch: 'S',
    firewall: 'FW',
    server: 'SRV',
    cloud: 'CLD',
    workstation: 'WS',
  };
  const nodeStrokeColors = {
    router: '#60a5fa',
    switch: '#34d399',
    firewall: '#f87171',
    server: '#facc15',
    cloud: '#a855f7',
    workstation: '#f97316',
  };
  const validTypes = new Set(['router', 'switch', 'firewall', 'server', 'cloud', 'workstation']);

  const state = {
    nodes: new Map(),
    links: new Map(),
    bonds: new Map(),
    nodeCounter: 1,
    linkCounter: 1,
    bondCounter: 1,
    typeCounters: Object.create(null),
    selected: null,
    linkMode: false,
    linkStart: null,
    bondMode: false,
    bondSelection: new Set(),
    activeBondId: null,
    snapToGrid: false,
    artboardWidth: MIN_ARTBOARD_WIDTH,
    artboardHeight: MIN_ARTBOARD_HEIGHT,
  };

  function applyArtboardSize() {
    linkLayer.setAttribute('width', state.artboardWidth);
    linkLayer.setAttribute('height', state.artboardHeight);
    linkLayer.setAttribute('viewBox', `0 0 ${state.artboardWidth} ${state.artboardHeight}`);
    linkLayer.style.width = `${state.artboardWidth}px`;
    linkLayer.style.height = `${state.artboardHeight}px`;
    canvas.style.width = `${state.artboardWidth}px`;
    canvas.style.height = `${state.artboardHeight}px`;
  }

  function capitalize(str) {
    return (str || '').charAt(0).toUpperCase() + (str || '').slice(1);
  }

  function nextLabel(type) {
    if (!state.typeCounters[type]) state.typeCounters[type] = 0;
    state.typeCounters[type] += 1;
    return `${capitalize(type)} ${state.typeCounters[type]}`;
  }

  function clamp(val, min, max) {
    return Math.min(Math.max(val, min), max);
  }

  function getNodeMetrics(node) {
    const width = node.el.offsetWidth || 0;
    const height = node.el.offsetHeight || 0;
    const centerX = node.x + width / 2;
    const centerY = node.y + height / 2;
    return { width, height, centerX, centerY };
  }

  function projectToRectEdge(metrics, targetX, targetY) {
    const dx = targetX - metrics.centerX;
    const dy = targetY - metrics.centerY;
    if (dx === 0 && dy === 0) {
      return { x: metrics.centerX, y: metrics.centerY };
    }
    const halfW = metrics.width / 2;
    const halfH = metrics.height / 2;
    const scale = Math.min(
      dx !== 0 ? halfW / Math.abs(dx) : Infinity,
      dy !== 0 ? halfH / Math.abs(dy) : Infinity
    );
    const safeScale = Number.isFinite(scale) ? Math.min(scale, 1) : 1;
    return {
      x: metrics.centerX + dx * safeScale,
      y: metrics.centerY + dy * safeScale,
    };
  }

  function computeLinkGeometry(link) {
    const from = state.nodes.get(link.from);
    const to = state.nodes.get(link.to);
    if (!from || !to) return null;
    const fromMetrics = getNodeMetrics(from);
    const toMetrics = getNodeMetrics(to);
    const fromPoint = projectToRectEdge(fromMetrics, toMetrics.centerX, toMetrics.centerY);
    const toPoint = projectToRectEdge(toMetrics, fromMetrics.centerX, fromMetrics.centerY);
    const dx = toPoint.x - fromPoint.x;
    const dy = toPoint.y - fromPoint.y;
    const length = Math.hypot(dx, dy) || 1;
    const angle = Math.atan2(dy, dx);
    const perpX = -dy / length;
    const perpY = dx / length;
    const midX = (fromPoint.x + toPoint.x) / 2;
    const midY = (fromPoint.y + toPoint.y) / 2;
    const dirX = dx / length;
    const dirY = dy / length;
    return {
      fromMetrics,
      toMetrics,
      fromPoint,
      toPoint,
      dx,
      dy,
      length,
      angle,
      perpX,
      perpY,
      dirX,
      dirY,
      midX,
      midY,
    };
  }

  function computeBondGeometry(bond) {
    if (!bond || !Array.isArray(bond.links) || bond.links.length < 2) return null;
    const nodeEntries = new Map();
    for (const linkId of bond.links) {
      const link = state.links.get(linkId);
      if (!link) continue;
      const geom = link._geom || computeLinkGeometry(link);
      if (!geom) continue;
      const nodes = [
        { nodeId: link.from, metrics: geom.fromMetrics, anchor: geom.fromPoint },
        { nodeId: link.to, metrics: geom.toMetrics, anchor: geom.toPoint },
      ];
      nodes.forEach(({ nodeId, metrics, anchor }) => {
        if (!nodeId || !metrics || !anchor) return;
        let entry = nodeEntries.get(nodeId);
        if (!entry) {
          entry = { nodeId, metrics, anchors: [] };
          nodeEntries.set(nodeId, entry);
        }
        entry.anchors.push(anchor);
      });
    }
    const sharedSet = new Set(bond.sharedNodes || []);
    const markers = [];
    nodeEntries.forEach((entry) => {
      const count = entry.anchors.length;
      const include = sharedSet.size > 0 ? sharedSet.has(entry.nodeId) : count >= 2;
      if (!include) return;
      let sumX = 0;
      let sumY = 0;
      entry.anchors.forEach((anchor) => {
        const dx = anchor.x - entry.metrics.centerX;
        const dy = anchor.y - entry.metrics.centerY;
        const len = Math.hypot(dx, dy) || 1;
        const ext = 18;
        sumX += anchor.x + (dx / len) * ext;
        sumY += anchor.y + (dy / len) * ext;
      });
      const avgX = sumX / entry.anchors.length;
      const avgY = sumY / entry.anchors.length;
      const radius = 14 + Math.min(entry.anchors.length - 1, 3) * 2;
      markers.push({
        nodeId: entry.nodeId,
        center: { x: avgX, y: avgY },
        radius,
        count,
      });
    });
    if (!markers.length) return null;
    let labelPoint;
    if (markers.length === 1) {
      const marker = markers[0];
      labelPoint = {
        x: marker.center.x,
        y: marker.center.y - (marker.radius + 14),
      };
    } else {
      const avgX = markers.reduce((sum, marker) => sum + marker.center.x, 0) / markers.length;
      let labelY = Math.min(...markers.map((marker) => marker.center.y - marker.radius)) - 14;
      if (labelY < 24) {
        labelY = Math.max(...markers.map((marker) => marker.center.y + marker.radius)) + 16;
      }
      labelPoint = { x: avgX, y: labelY };
    }
    return { markers, labelPoint };
  }

  function getParallelLinks(link) {
    const result = [];
    state.links.forEach((candidate) => {
      if (!candidate) return;
      const samePair =
        (candidate.from === link.from && candidate.to === link.to) ||
        (candidate.from === link.to && candidate.to === link.from);
      if (samePair) result.push(candidate);
    });
    return result;
  }

  function drawRoundedRectPath(ctx, x, y, width, height, radius) {
    const r = Math.max(Math.min(radius, width / 2, height / 2), 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function splitNoteLines(notes) {
    return String(notes || '')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
      .slice(0, 4);
  }

  function getSharedNodes(linkIds) {
    const unique = Array.from(new Set(linkIds));
    if (unique.length === 0) return new Set();
    let shared = null;
    for (const linkId of unique) {
      const link = state.links.get(linkId);
      if (!link) return new Set();
      const nodes = new Set([link.from, link.to].filter(Boolean));
      if (!shared) {
        shared = nodes;
      } else {
        shared = new Set([...shared].filter((nodeId) => nodes.has(nodeId)));
      }
      if (!shared.size) return shared;
    }
    return shared || new Set();
  }

  function ensureCountersFromId(id, type) {
    const match = String(id || '').match(/(\d+)$/);
    if (!match) return;
    const num = parseInt(match[1], 10);
    if (Number.isNaN(num)) return;
    if (type === 'link') {
      state.linkCounter = Math.max(state.linkCounter, num + 1);
    } else if (type === 'bond') {
      state.bondCounter = Math.max(state.bondCounter, num + 1);
    } else {
      state.nodeCounter = Math.max(state.nodeCounter, num + 1);
    }
  }

  function refreshSvgSize() {
    const rect = stage.getBoundingClientRect();
    applyArtboardSize();
  }

  function refreshAllPositions() {
    applyArtboardSize();
    state.links.forEach((link) => updateLinkGraphics(link));
    state.bonds.forEach((bond) => updateBondGraphics(bond));
  }

  function computeContentBounds() {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    state.nodes.forEach((node) => {
      const width = node.el.offsetWidth || 0;
      const height = node.el.offsetHeight || 0;
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + width);
      maxY = Math.max(maxY, node.y + height);
    });
    state.links.forEach((link) => {
      const geom = link._geom || computeLinkGeometry(link);
      if (!geom) return;
      const points = [geom.fromPoint, geom.toPoint];
      points.forEach((pt) => {
        if (!pt) return;
        minX = Math.min(minX, pt.x);
        minY = Math.min(minY, pt.y);
        maxX = Math.max(maxX, pt.x);
        maxY = Math.max(maxY, pt.y);
      });
    });
    state.bonds.forEach((bond) => {
      const geom = computeBondGeometry(bond);
      if (!geom) return;
      geom.markers.forEach((marker) => {
        const r = marker.radius;
        const cx = marker.center.x;
        const cy = marker.center.y;
        minX = Math.min(minX, cx - r);
        minY = Math.min(minY, cy - r);
        maxX = Math.max(maxX, cx + r);
        maxY = Math.max(maxY, cy + r);
      });
    });
    if (minX === Infinity) {
      minX = 0;
      minY = 0;
      maxX = MIN_ARTBOARD_WIDTH - ARTBOARD_MARGIN;
      maxY = MIN_ARTBOARD_HEIGHT - ARTBOARD_MARGIN;
    }
    return { minX, minY, maxX, maxY };
  }

  function updateArtboardExtents() {
    const bounds = computeContentBounds();
    const neededWidth = Math.max(MIN_ARTBOARD_WIDTH, bounds.maxX + ARTBOARD_MARGIN);
    const neededHeight = Math.max(MIN_ARTBOARD_HEIGHT, bounds.maxY + ARTBOARD_MARGIN);
    let changed = false;
    if (neededWidth !== state.artboardWidth) {
      state.artboardWidth = neededWidth;
      changed = true;
    }
    if (neededHeight !== state.artboardHeight) {
      state.artboardHeight = neededHeight;
      changed = true;
    }
    if (changed) applyArtboardSize();
  }

  function centerViewOnContent(behavior = 'smooth') {
    const bounds = computeContentBounds();
    const contentWidth = bounds.maxX - bounds.minX;
    const contentHeight = bounds.maxY - bounds.minY;
    const targetCenterX = bounds.minX + contentWidth / 2;
    const targetCenterY = bounds.minY + contentHeight / 2;
    const maxScrollLeft = Math.max(state.artboardWidth - stage.clientWidth, 0);
    const maxScrollTop = Math.max(state.artboardHeight - stage.clientHeight, 0);
    const scrollLeft = clamp(targetCenterX - stage.clientWidth / 2, 0, maxScrollLeft);
    const scrollTop = clamp(targetCenterY - stage.clientHeight / 2, 0, maxScrollTop);
    if (typeof stage.scrollTo === 'function') {
      stage.scrollTo({ left: scrollLeft, top: scrollTop, behavior });
    } else {
      stage.scrollLeft = scrollLeft;
      stage.scrollTop = scrollTop;
    }
  }

  let pendingFullRefresh = false;
  function requestFullRefresh() {
    if (pendingFullRefresh) return;
    pendingFullRefresh = true;
    requestAnimationFrame(() => {
      pendingFullRefresh = false;
      refreshAllPositions();
    });
  }

  function updateEmptyState() {
    if (!emptyHint) return;
    emptyHint.classList.toggle('hidden', state.nodes.size > 0);
  }

  function highlightSelection() {
    state.nodes.forEach((node) => {
      const isSelected = state.selected && state.selected.type === 'node' && state.selected.id === node.id;
      const isSource = state.linkMode && state.linkStart === node.id;
      node.el.classList.toggle('selected', !!isSelected);
      node.el.classList.toggle('link-source', !!isSource);
    });
    state.links.forEach((link) => {
      const isSelected = state.selected && state.selected.type === 'link' && state.selected.id === link.id;
      const isPending = state.bondMode && state.bondSelection.has(link.id);
      link.group.classList.toggle('selected', !!isSelected);
      link.group.classList.toggle('pending', !!isPending);
    });
    state.bonds.forEach((bond) => {
      const isSelected = state.selected && state.selected.type === 'bond' && state.selected.id === bond.id;
      bond.group.classList.toggle('selected', !!isSelected);
    });
    if (cancelLinkBtn) cancelLinkBtn.disabled = !state.linkMode || !state.linkStart;
    if (linkModeBtn) linkModeBtn.classList.toggle('active', !!state.linkMode);
    if (cancelBondBtn) cancelBondBtn.disabled = !state.bondMode || state.bondSelection.size === 0;
    if (bondModeBtn) bondModeBtn.classList.toggle('active', !!state.bondMode);
    if (toggleSnapBtn) {
      toggleSnapBtn.classList.toggle('active', state.snapToGrid);
      toggleSnapBtn.textContent = state.snapToGrid ? 'Snap Grid: On' : 'Snap Grid: Off';
    }
  }

  function clearInspector() {
    if (nodeForm) nodeForm.classList.add('hidden');
    if (linkForm) linkForm.classList.add('hidden');
    if (bondForm) bondForm.classList.add('hidden');
    if (bondCountLabel) bondCountLabel.textContent = 'Linked circuits';
  }

  function selectNone() {
    state.selected = null;
    clearInspector();
    highlightSelection();
  }

  function populateNodeForm(node) {
    if (!nodeForm) return;
    nodeForm.classList.remove('hidden');
    if (linkForm) linkForm.classList.add('hidden');
    if (nodeFormId) nodeFormId.value = node.id;
    if (nodeLabelInput) nodeLabelInput.value = node.label || '';
    if (nodeTypeSelect) nodeTypeSelect.value = node.type;
    if (nodeNotesInput) nodeNotesInput.value = node.notes || '';
  }

  function populateLinkForm(link) {
    if (!linkForm) return;
    linkForm.classList.remove('hidden');
    if (nodeForm) nodeForm.classList.add('hidden');
    if (bondForm) bondForm.classList.add('hidden');
    if (linkFormId) linkFormId.value = link.id;
    if (linkLabelInput) linkLabelInput.value = link.label || '';
    if (linkAInput) linkAInput.value = link.aDetails || '';
    if (linkBInput) linkBInput.value = link.bDetails || '';
    if (linkNotesInput) linkNotesInput.value = link.notes || '';
  }

  function populateBondForm(bond) {
    if (!bondForm) return;
    bondForm.classList.remove('hidden');
    if (nodeForm) nodeForm.classList.add('hidden');
    if (linkForm) linkForm.classList.add('hidden');
    if (bondFormId) bondFormId.value = bond.id;
    if (bondLabelInput) bondLabelInput.value = bond.label || '';
    if (bondLinksList) {
      bondLinksList.innerHTML = '';
      bond.links.forEach((linkId) => {
        const link = state.links.get(linkId);
        if (!link) return;
        const fromNode = state.nodes.get(link.from);
        const toNode = state.nodes.get(link.to);
        const li = document.createElement('li');
        const fromLabel = fromNode ? (fromNode.label || fromNode.id) : link.from;
        const toLabel = toNode ? (toNode.label || toNode.id) : link.to;
        const label = link.label ? ` (${link.label})` : '';
        li.textContent = `${fromLabel} ↔ ${toLabel}${label}`;
        bondLinksList.appendChild(li);
      });
    }
    if (bondCountLabel) {
      bondCountLabel.textContent = `Linked circuits (${bond.links.length})`;
    }
  }

  function selectNode(id) {
    const node = state.nodes.get(id);
    if (!node) return;
    state.selected = { type: 'node', id };
    populateNodeForm(node);
    highlightSelection();
  }

  function selectLink(id) {
    const link = state.links.get(id);
    if (!link) return;
    state.selected = { type: 'link', id };
    populateLinkForm(link);
    highlightSelection();
  }

  function selectBond(id) {
    const bond = state.bonds.get(id);
    if (!bond) return;
    state.selected = { type: 'bond', id };
    populateBondForm(bond);
    highlightSelection();
  }

  function updateLinkGraphics(link) {
    const geom = computeLinkGeometry(link);
    if (!geom) return;
    const siblings = getParallelLinks(link);
    let { fromPoint, toPoint, midX, midY, perpX, perpY, dirX, dirY } = geom;
    if (siblings.length > 1) {
      const sorted = siblings.slice().sort((a, b) => a.id.localeCompare(b.id));
      const index = sorted.findIndex((candidate) => candidate.id === link.id);
      const step = 24;
      const offset = (index - (sorted.length - 1) / 2) * step;
      const shiftX = perpX * offset;
      const shiftY = perpY * offset;
      const targetForFrom = {
        x: geom.toMetrics.centerX + shiftX,
        y: geom.toMetrics.centerY + shiftY,
      };
      const targetForTo = {
        x: geom.fromMetrics.centerX + shiftX,
        y: geom.fromMetrics.centerY + shiftY,
      };
      fromPoint = projectToRectEdge(geom.fromMetrics, targetForFrom.x, targetForFrom.y);
      toPoint = projectToRectEdge(geom.toMetrics, targetForTo.x, targetForTo.y);
      const dx = toPoint.x - fromPoint.x;
      const dy = toPoint.y - fromPoint.y;
      const length = Math.hypot(dx, dy) || 1;
      dirX = dx / length;
      dirY = dy / length;
      perpX = -dirY;
      perpY = dirX;
      midX = (fromPoint.x + toPoint.x) / 2;
      midY = (fromPoint.y + toPoint.y) / 2;
    }
    link.line.setAttribute('x1', String(fromPoint.x));
    link.line.setAttribute('y1', String(fromPoint.y));
    link.line.setAttribute('x2', String(toPoint.x));
    link.line.setAttribute('y2', String(toPoint.y));

    link.labelText.textContent = link.label || '';
    link.labelText.setAttribute('x', String(midX));
    link.labelText.setAttribute('y', String(midY - 6));
    link.labelText.style.display = link.label ? 'block' : 'none';

    link.aText.textContent = link.aDetails || '';
    link.bText.textContent = link.bDetails || '';
    link.aText.style.display = link.aDetails ? 'block' : 'none';
    link.bText.style.display = link.bDetails ? 'block' : 'none';
    link.notesText.textContent = link.notes || '';
    link.notesText.setAttribute('x', String(midX));
    link.notesText.setAttribute('y', String(midY + 12));
    link.notesText.style.display = link.notes ? 'block' : 'none';

    const endpointOffset = 20;
    const alongOffset = 16;
    link.aText.setAttribute('x', String(fromPoint.x + perpX * endpointOffset + dirX * alongOffset));
    link.aText.setAttribute('y', String(fromPoint.y + perpY * endpointOffset + dirY * alongOffset));
    link.bText.setAttribute('x', String(toPoint.x - perpX * endpointOffset - dirX * alongOffset));
    link.bText.setAttribute('y', String(toPoint.y - perpY * endpointOffset - dirY * alongOffset));
    link._geom = {
      fromPoint,
      toPoint,
      midX,
      midY,
      perpX,
      perpY,
      dirX,
      dirY,
      fromMetrics: geom.fromMetrics,
      toMetrics: geom.toMetrics,
    };
    updateBondsForLink(link.id);
  }

  function updateLinksForNode(nodeId) {
    state.links.forEach((link) => {
      if (link.from === nodeId || link.to === nodeId) updateLinkGraphics(link);
    });
  }

  function updateBondsForLink(linkId) {
    state.bonds.forEach((bond) => {
      if (bond.links.includes(linkId)) updateBondGraphics(bond);
    });
  }

  function updateBondsForNode(nodeId) {
    state.bonds.forEach((bond) => {
      const involves = bond.links.some((linkId) => {
        const link = state.links.get(linkId);
        return link && (link.from === nodeId || link.to === nodeId);
      });
      if (involves) updateBondGraphics(bond);
    });
  }

  function createBondElement(id) {
    const group = document.createElementNS(SVG_NS, 'g');
    group.classList.add('bond-group');
    group.dataset.bondId = id;
    const labelText = document.createElementNS(SVG_NS, 'text');
    labelText.classList.add('bond-label');
    labelText.setAttribute('text-anchor', 'middle');
    labelText.setAttribute('dominant-baseline', 'middle');
    group.appendChild(labelText);
    group.addEventListener('click', (e) => {
      e.stopPropagation();
      if (state.bondMode) {
        state.bondSelection.clear();
        const target = state.bonds.get(id);
        if (target) {
          state.activeBondId = id;
          target.links.forEach((linkId) => state.bondSelection.add(linkId));
          highlightSelection();
        }
      }
      selectBond(id);
    });
    bondsSvgLayer.appendChild(group);
    return { group, labelText, markerElements: new Map() };
  }

  function updateBondGraphics(bond) {
    if (!bond) return;
    const geom = computeBondGeometry(bond);
    if (!geom) {
      bond.group.style.display = 'none';
      if (bond.markerElements) {
        bond.markerElements.forEach((entry) => entry.circle?.remove());
        bond.markerElements.clear();
      }
      return;
    }
    bond.group.style.display = 'block';
    if (!bond.markerElements) bond.markerElements = new Map();
    const used = new Set();
    geom.markers.forEach((marker) => {
      let entry = bond.markerElements.get(marker.nodeId);
      if (!entry) {
        const circle = document.createElementNS(SVG_NS, 'circle');
        circle.classList.add('bond-circle');
        bond.group.insertBefore(circle, bond.labelText);
        entry = { circle };
        bond.markerElements.set(marker.nodeId, entry);
      }
      entry.circle.setAttribute('cx', String(marker.center.x));
      entry.circle.setAttribute('cy', String(marker.center.y));
      entry.circle.setAttribute('r', String(marker.radius));
      used.add(marker.nodeId);
    });
    bond.markerElements.forEach((entry, nodeId) => {
      if (!used.has(nodeId)) {
        entry.circle.remove();
        bond.markerElements.delete(nodeId);
      }
    });
    const labelText = String(bond.label || '').trim();
    bond.labelText.textContent = labelText;
    bond.labelText.setAttribute('x', String(geom.labelPoint.x));
    bond.labelText.setAttribute('y', String(geom.labelPoint.y));
    bond.labelText.style.display = labelText ? 'block' : 'none';
  }

  function createBond(linkIds, options = {}) {
    const unique = Array.from(new Set(Array.isArray(linkIds) ? linkIds : [linkIds])).filter(Boolean);
    if (unique.length < 2) return null;
    const sharedNodes = options.sharedNodes ? new Set(options.sharedNodes) : getSharedNodes(unique);
    if (!sharedNodes.size) {
      window.alert('These links do not share a common node and cannot be bonded.');
      return null;
    }
    const sortedLinks = unique.slice().sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const key = sortedLinks.join('|');
    const existing = Array.from(state.bonds.values()).find((bond) => bond.links.slice().sort().join('|') === key);
    if (existing) return existing;
    let id = options.id || `b${state.bondCounter++}`;
    ensureCountersFromId(id, 'bond');
    if (state.bonds.has(id)) {
      id = `b${state.bondCounter++}`;
    }
    const visuals = createBondElement(id);
    const label = typeof options.label === 'string' ? options.label : '';
    const bond = {
      id,
      links: sortedLinks,
      sharedNodes: Array.from(sharedNodes),
      label,
      ...visuals,
    };
    state.bonds.set(id, bond);
    updateBondGraphics(bond);
    return bond;
  }

  function removeBond(id) {
    const bond = state.bonds.get(id);
    if (!bond) return;
    if (bond.markerElements) {
      bond.markerElements.forEach((entry) => {
        entry.circle?.remove();
      });
      bond.markerElements.clear();
    }
    bond.links?.forEach((linkId) => state.bondSelection.delete(linkId));
    if (state.activeBondId === id) state.activeBondId = null;
    if (bond.group) bond.group.remove();
    state.bonds.delete(id);
    if (state.selected && state.selected.type === 'bond' && state.selected.id === id) {
      selectNone();
    } else {
      highlightSelection();
    }
    updateArtboardExtents();
  }

  function updateNodeAppearance(node) {
    node.el.className = `node node--${node.type}`;
    node.el.dataset.type = node.type;
    node.iconEl.textContent = typeIcons[node.type] || node.type.slice(0, 2).toUpperCase();
    node.titleEl.textContent = node.label || '';
    if (node.notes) {
      node.metaEl.textContent = node.notes;
      node.metaEl.classList.remove('hidden');
    } else {
      node.metaEl.textContent = '';
      node.metaEl.classList.add('hidden');
    }
    updateArtboardExtents();
  }

  function setNodePosition(node, x, y) {
    const nodeWidth = node.el.offsetWidth || 0;
    const nodeHeight = node.el.offsetHeight || 0;
    let targetX = x;
    let targetY = y;
    if (state.snapToGrid) {
      targetX = Math.round(targetX / GRID_SIZE) * GRID_SIZE;
      targetY = Math.round(targetY / GRID_SIZE) * GRID_SIZE;
    }
    const neededWidth = targetX + nodeWidth + ARTBOARD_MARGIN;
    const neededHeight = targetY + nodeHeight + ARTBOARD_MARGIN;
    let changed = false;
    if (neededWidth > state.artboardWidth) {
      state.artboardWidth = Math.max(neededWidth, MIN_ARTBOARD_WIDTH);
      changed = true;
    }
    if (neededHeight > state.artboardHeight) {
      state.artboardHeight = Math.max(neededHeight, MIN_ARTBOARD_HEIGHT);
      changed = true;
    }
    if (changed) applyArtboardSize();
    targetX = clamp(targetX, 8, state.artboardWidth - nodeWidth - 8);
    targetY = clamp(targetY, 8, state.artboardHeight - nodeHeight - 8);
    node.x = clamp(targetX, 8, state.artboardWidth - nodeWidth - 8);
    node.y = clamp(targetY, 8, state.artboardHeight - nodeHeight - 8);
    node.el.style.transform = `translate(${node.x}px, ${node.y}px)`;
    updateLinksForNode(node.id);
    updateBondsForNode(node.id);
    updateArtboardExtents();
  }

  function startNodeDrag(id, event) {
    const node = state.nodes.get(id);
    if (!node) return;
    selectNode(id);
    const rect = stage.getBoundingClientRect();
    const scrollLeft = stage.scrollLeft;
    const scrollTop = stage.scrollTop;
    node.dragStageRect = rect;
    node.dragOffset = {
      x: event.clientX - rect.left + scrollLeft - node.x,
      y: event.clientY - rect.top + scrollTop - node.y,
    };
    node.el.classList.add('dragging');
  }

  function dragNode(id, event) {
    const node = state.nodes.get(id);
    if (!node || !node.dragOffset) return;
    const rect = node.dragStageRect || stage.getBoundingClientRect();
    const scrollLeft = stage.scrollLeft;
    const scrollTop = stage.scrollTop;
    const x = event.clientX - rect.left + scrollLeft - node.dragOffset.x;
    const y = event.clientY - rect.top + scrollTop - node.dragOffset.y;
    setNodePosition(node, x, y);
  }

  function finishNodeDrag(id) {
    const node = state.nodes.get(id);
    if (!node) return;
    node.dragOffset = null;
    delete node.dragStageRect;
    node.el.classList.remove('dragging');
  }

  function createLinkElement(id) {
    const group = document.createElementNS(SVG_NS, 'g');
    group.classList.add('link-group');
    group.dataset.linkId = id;

    const line = document.createElementNS(SVG_NS, 'line');
    line.classList.add('link-line');
    line.setAttribute('stroke-linecap', 'round');
    group.appendChild(line);

    const labelText = document.createElementNS(SVG_NS, 'text');
    labelText.classList.add('link-label');
    labelText.setAttribute('text-anchor', 'middle');
    group.appendChild(labelText);

    const notesText = document.createElementNS(SVG_NS, 'text');
    notesText.classList.add('link-notes');
    notesText.setAttribute('text-anchor', 'middle');
    group.appendChild(notesText);

    const aText = document.createElementNS(SVG_NS, 'text');
    aText.classList.add('link-endpoint', 'endpoint-a');
    aText.setAttribute('text-anchor', 'start');
    group.appendChild(aText);

    const bText = document.createElementNS(SVG_NS, 'text');
    bText.classList.add('link-endpoint', 'endpoint-b');
    bText.setAttribute('text-anchor', 'end');
    group.appendChild(bText);

    const handleClick = (e) => {
      e.stopPropagation();
      if (state.bondMode) {
        handleBondLinkClick(id);
      } else {
        selectLink(id);
      }
    };
    group.addEventListener('click', handleClick);
    line.addEventListener('click', handleClick);

    linkLayer.appendChild(group);
    return { group, line, labelText, aText, bText, notesText };
  }

  function createLink(fromId, toId, options = {}) {
    if (!state.nodes.has(fromId) || !state.nodes.has(toId)) return null;
    let id = options.id || `l${state.linkCounter++}`;
    ensureCountersFromId(id, 'link');
    if (state.links.has(id)) {
      id = `l${state.linkCounter++}`;
    }

    const visuals = createLinkElement(id);
    const link = {
      id,
      from: fromId,
      to: toId,
      label: options.label || '',
      aDetails: options.aDetails || '',
      bDetails: options.bDetails || '',
      notes: options.notes || '',
      ...visuals,
    };
    state.links.set(id, link);
    updateLinkGraphics(link);
    return link;
  }

  function removeLink(id) {
    const link = state.links.get(id);
    if (!link) return;
    link.group.remove();
    state.links.delete(id);
    state.bondSelection.delete(id);
    const affectedBonds = [];
    state.bonds.forEach((bond) => {
      if (bond.links.includes(id)) affectedBonds.push(bond);
    });
    affectedBonds.forEach((bond) => {
      bond.links = bond.links.filter((linkId) => linkId !== id);
      if (bond.links.length < 2) {
        removeBond(bond.id);
      } else {
        bond.sharedNodes = Array.from(getSharedNodes(bond.links));
        updateBondGraphics(bond);
      }
    });
    if (state.selected && state.selected.type === 'link' && state.selected.id === id) {
      selectNone();
    } else {
      highlightSelection();
    }
    updateArtboardExtents();
  }

  function removeNode(id) {
    const node = state.nodes.get(id);
    if (!node) return;
    node.el.remove();
    state.nodes.delete(id);
    const toRemove = [];
    state.links.forEach((link) => {
      if (link.from === id || link.to === id) toRemove.push(link.id);
    });
    toRemove.forEach(removeLink);
    if (state.selected && state.selected.type === 'node' && state.selected.id === id) {
      selectNone();
    } else {
      highlightSelection();
    }
    updateEmptyState();
    updateArtboardExtents();
  }

  function spawnNode(type, opts = {}) {
    const nodeType = validTypes.has(type) ? type : 'router';
    let id = opts.id || `n${state.nodeCounter++}`;
    ensureCountersFromId(id, 'node');
    if (state.nodes.has(id)) {
      id = `n${state.nodeCounter++}`;
    }
    let label;
    if (typeof opts.label === 'string') {
      label = opts.label;
      if (!state.typeCounters[nodeType]) state.typeCounters[nodeType] = 0;
      state.typeCounters[nodeType] += 1;
    } else {
      label = nextLabel(nodeType);
    }
    const notes = typeof opts.notes === 'string' ? opts.notes : '';

    const nodeEl = document.createElement('div');
    nodeEl.className = `node node--${nodeType}`;
    nodeEl.dataset.id = id;
    nodeEl.dataset.type = nodeType;
    nodeEl.style.transform = 'translate(0px, 0px)';
    nodeEl.style.left = '0px';
    nodeEl.style.top = '0px';
    nodeEl.setAttribute('role', 'button');

    const iconEl = document.createElement('div');
    iconEl.className = 'node-icon';
    iconEl.textContent = typeIcons[nodeType] || nodeType.slice(0, 2).toUpperCase();

    const titleEl = document.createElement('div');
    titleEl.className = 'node-title';
    titleEl.textContent = label;

    const metaEl = document.createElement('div');
    metaEl.className = 'node-meta';
    if (notes) {
      metaEl.textContent = notes;
    } else {
      metaEl.classList.add('hidden');
    }

    nodeEl.appendChild(iconEl);
    nodeEl.appendChild(titleEl);
    nodeEl.appendChild(metaEl);
    canvas.appendChild(nodeEl);

    const viewportWidth = stage.clientWidth;
    const viewportHeight = stage.clientHeight;
    const viewportCenterX = stage.scrollLeft + viewportWidth / 2;
    const viewportCenterY = stage.scrollTop + viewportHeight / 2;
    const fallbackX = viewportCenterX - (nodeEl.offsetWidth || 160) / 2;
    const fallbackY = viewportCenterY - (nodeEl.offsetHeight || 80) / 2;
    const node = {
      id,
      type: nodeType,
      label,
      notes,
      x: typeof opts.x === 'number' ? opts.x : fallbackX,
      y: typeof opts.y === 'number' ? opts.y : fallbackY,
      el: nodeEl,
      iconEl,
      titleEl,
      metaEl,
      dragOffset: null,
    };

    setNodePosition(node, node.x, node.y);
    state.nodes.set(id, node);
    updateNodeAppearance(node);
    updateEmptyState();
    refreshAllPositions();

    nodeEl.addEventListener('click', (e) => {
      e.stopPropagation();
      if (state.linkMode) {
        handleLinkNodeClick(id);
      } else {
        selectNode(id);
      }
    });

    nodeEl.addEventListener('pointerdown', (e) => {
      if (state.linkMode) return;
      e.preventDefault();
      nodeEl.setPointerCapture(e.pointerId);
      startNodeDrag(id, e);
    });

    nodeEl.addEventListener('pointermove', (e) => {
      if (!nodeEl.hasPointerCapture(e.pointerId)) return;
      dragNode(id, e);
    });

    const endDrag = (e) => {
      if (nodeEl.hasPointerCapture(e.pointerId)) {
        nodeEl.releasePointerCapture(e.pointerId);
        finishNodeDrag(id);
      }
    };
    nodeEl.addEventListener('pointerup', endDrag);
    nodeEl.addEventListener('pointercancel', endDrag);

    return node;
  }

  function handleLinkNodeClick(nodeId) {
    if (!state.linkMode) {
      selectNode(nodeId);
      return;
    }
    if (!state.linkStart) {
      state.linkStart = nodeId;
      highlightSelection();
      return;
    }
    if (state.linkStart === nodeId) {
      state.linkStart = null;
      highlightSelection();
      return;
    }
    createLink(state.linkStart, nodeId);
    state.linkStart = null;
    highlightSelection();
  }

  function setLinkMode(active) {
    state.linkMode = !!active;
    if (!state.linkMode) {
      state.linkStart = null;
    }
    if (state.linkMode && state.bondMode) {
      setBondMode(false);
    }
    stage.classList.toggle('link-mode', state.linkMode);
    if (linkModeBtn) linkModeBtn.textContent = state.linkMode ? 'Exit Link Mode' : 'Start Link Mode';
    highlightSelection();
  }

  function handleBondLinkClick(linkId) {
    if (!state.bondMode) {
      if (linkId) selectLink(linkId);
      return;
    }
    if (!linkId) {
      state.bondSelection.clear();
      state.activeBondId = null;
      highlightSelection();
      return;
    }
    if (state.bondSelection.has(linkId)) {
      state.bondSelection.delete(linkId);
      if (state.activeBondId) {
        const bond = state.bonds.get(state.activeBondId);
        if (bond) {
          bond.links = bond.links.filter((id) => id !== linkId);
          if (bond.links.length < 2) {
            removeBond(bond.id);
          } else {
            bond.sharedNodes = Array.from(getSharedNodes(bond.links));
            updateBondGraphics(bond);
            selectBond(bond.id);
          }
        }
      }
      highlightSelection();
      return;
    }
    state.bondSelection.add(linkId);
    const result = applyBondSelection();
    if (!result.success) {
      state.bondSelection.delete(linkId);
      window.alert('Selected links do not share a common node for bonding.');
    } else if (result.bond) {
      selectBond(result.bond.id);
    }
    highlightSelection();
  }

  function setBondMode(active) {
    state.bondMode = !!active;
    if (state.bondMode) {
      if (state.linkMode) setLinkMode(false);
      state.bondSelection.clear();
      if (state.selected && state.selected.type === 'bond') {
        const bond = state.bonds.get(state.selected.id);
        if (bond) {
          state.activeBondId = bond.id;
          bond.links.forEach((linkId) => state.bondSelection.add(linkId));
        } else {
          state.activeBondId = null;
        }
      } else {
        state.activeBondId = null;
      }
    } else {
      state.bondSelection.clear();
      state.activeBondId = null;
    }
    stage.classList.toggle('bond-mode', state.bondMode);
    highlightSelection();
    if (bondModeBtn) bondModeBtn.textContent = state.bondMode ? 'Exit Bond Mode' : 'Start Bond Mode';
  }

  function applyBondSelection() {
    const links = Array.from(state.bondSelection).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    if (links.length < 2) {
      if (state.activeBondId) {
        removeBond(state.activeBondId);
        state.bondSelection.clear();
      }
      return { success: true, bond: null };
    }
    const sharedNodes = getSharedNodes(links);
    if (!sharedNodes.size) return { success: false };
    if (state.activeBondId) {
      const bond = state.bonds.get(state.activeBondId);
      if (bond) {
        bond.links = links.slice();
        bond.sharedNodes = Array.from(sharedNodes);
        updateBondGraphics(bond);
        updateArtboardExtents();
        return { success: true, bond };
      }
      state.activeBondId = null;
    }
    const bond = createBond(links, { sharedNodes: Array.from(sharedNodes) });
    if (bond) {
      state.activeBondId = bond.id;
      updateArtboardExtents();
      return { success: true, bond };
    }
    return { success: false };
  }

  function clearCanvas(confirmPrompt = true) {
    if (confirmPrompt && state.nodes.size && !window.confirm('Clear the entire canvas? This removes all nodes and links.')) {
      return;
    }
    Array.from(state.links.keys()).forEach((id) => removeLink(id));
    Array.from(state.bonds.keys()).forEach((id) => removeBond(id));
    state.nodes.forEach((node) => node.el.remove());
    state.nodes.clear();
    state.bonds.clear();
    state.typeCounters = Object.create(null);
    state.nodeCounter = 1;
    state.linkCounter = 1;
    state.bondCounter = 1;
    state.selected = null;
    state.linkStart = null;
    state.bondSelection.clear();
    state.activeBondId = null;
    state.artboardWidth = MIN_ARTBOARD_WIDTH;
    state.artboardHeight = MIN_ARTBOARD_HEIGHT;
    applyArtboardSize();
    if (typeof stage.scrollTo === 'function') {
      stage.scrollTo({ left: 0, top: 0, behavior: 'auto' });
    } else {
      stage.scrollLeft = 0;
      stage.scrollTop = 0;
    }
    setLinkMode(false);
    setBondMode(false);
    clearInspector();
    updateEmptyState();
    refreshAllPositions();
  }

  function exportTopology() {
    const payload = {
      version: 1,
      generatedAt: new Date().toISOString(),
      nodes: Array.from(state.nodes.values()).map((node) => ({
        id: node.id,
        type: node.type,
        label: node.label,
        notes: node.notes,
        x: Math.round(node.x),
        y: Math.round(node.y),
      })),
      links: Array.from(state.links.values()).map((link) => ({
        id: link.id,
        from: link.from,
        to: link.to,
        label: link.label,
        aDetails: link.aDetails,
        bDetails: link.bDetails,
        notes: link.notes,
      })),
      bonds: Array.from(state.bonds.values()).map((bond) => ({
        id: bond.id,
        links: [...bond.links],
        sharedNodes: Array.isArray(bond.sharedNodes) ? bond.sharedNodes.slice() : [],
        label: bond.label,
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'topology-sandbox.json';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportTopologyImage() {
    refreshAllPositions();
    updateArtboardExtents();
    const bounds = computeContentBounds();
    const margin = 80;
    const exportMinX = Math.max(bounds.minX - margin, 0);
    const exportMinY = Math.max(bounds.minY - margin, 0);
    const exportMaxX = bounds.maxX + margin;
    const exportMaxY = bounds.maxY + margin;
    const width = Math.max(1, Math.ceil(exportMaxX - exportMinX));
    const height = Math.max(1, Math.ceil(exportMaxY - exportMinY));
    const scale = Math.min((window.devicePixelRatio || 1) * 1.5, 3);
    const canvasEl = document.createElement('canvas');
    canvasEl.width = width * scale;
    canvasEl.height = height * scale;
    const ctx = canvasEl.getContext('2d');
    if (!ctx) {
      window.alert('Canvas export is not supported in this browser.');
      return;
    }
    ctx.scale(scale, scale);

    ctx.fillStyle = '#0b1224';
    ctx.fillRect(0, 0, width, height);

    const gridSize = 48;
    const gridStartX = Math.floor(exportMinX / gridSize) * gridSize;
    const gridStartY = Math.floor(exportMinY / gridSize) * gridSize;
    const gridEndX = exportMaxX;
    const gridEndY = exportMaxY;

    ctx.save();
    ctx.translate(-exportMinX, -exportMinY);

    ctx.strokeStyle = 'rgba(30, 41, 59, 0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = gridStartX; x <= gridEndX; x += gridSize) {
      ctx.moveTo(x, exportMinY);
      ctx.lineTo(x, exportMaxY);
    }
    for (let y = gridStartY; y <= gridEndY; y += gridSize) {
      ctx.moveTo(exportMinX, y);
      ctx.lineTo(exportMaxX, y);
    }
    ctx.stroke();

    const linkStroke = 'rgba(148,163,184,0.68)';
    const labelColor = '#e5e7eb';
    const noteColor = '#9ca3af';

    state.links.forEach((link) => {
      const geom = link._geom || computeLinkGeometry(link);
      if (!geom) return;
      const { fromPoint, toPoint, midX, midY, perpX, perpY, dirX, dirY } = geom;

      ctx.strokeStyle = linkStroke;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(fromPoint.x, fromPoint.y);
      ctx.lineTo(toPoint.x, toPoint.y);
      ctx.stroke();

      ctx.fillStyle = labelColor;
      ctx.font = '600 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      if (link.label) {
        ctx.fillText(link.label, midX, midY - 8);
      }
      ctx.font = '500 11px sans-serif';
      ctx.textBaseline = 'top';
      if (link.notes) {
        ctx.fillStyle = noteColor;
        ctx.fillText(link.notes, midX, midY + 10);
        ctx.fillStyle = labelColor;
      }

      const endpointOffset = 20;
      const alongOffset = 16;
      const ax = fromPoint.x + perpX * endpointOffset + dirX * alongOffset;
      const ay = fromPoint.y + perpY * endpointOffset + dirY * alongOffset;
      const bx = toPoint.x - perpX * endpointOffset - dirX * alongOffset;
      const by = toPoint.y - perpY * endpointOffset - dirY * alongOffset;

      if (link.aDetails) {
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(link.aDetails, ax, ay);
      }
      if (link.bDetails) {
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(link.bDetails, bx, by);
      }
    });

    const bondStroke = 'rgba(56,189,248,0.85)';
    const bondFill = 'rgba(56,189,248,0.18)';
    state.bonds.forEach((bond) => {
      const geom = computeBondGeometry(bond);
      if (!geom) return;
      geom.markers.forEach((marker) => {
        ctx.save();
        ctx.strokeStyle = bondStroke;
        ctx.fillStyle = bondFill;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(marker.center.x, marker.center.y, marker.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      });
      const text = String(bond.label || '').trim();
      if (text) {
        ctx.fillStyle = labelColor;
        ctx.font = '700 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, geom.labelPoint.x, geom.labelPoint.y);
      }
    });

    state.nodes.forEach((node) => {
      const metrics = getNodeMetrics(node);
      const widthN = metrics.width;
      const heightN = metrics.height;
      const x = metrics.centerX - widthN / 2;
      const y = metrics.centerY - heightN / 2;

      const strokeColor = nodeStrokeColors[node.type] || 'rgba(148,163,184,0.75)';
      const fillColor = 'rgba(17,24,39,0.94)';
      const shadowColor = 'rgba(15,23,42,0.6)';

      ctx.save();
      ctx.shadowColor = shadowColor;
      ctx.shadowBlur = 14;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 18;
      drawRoundedRectPath(ctx, x, y, widthN, heightN, 16);
      ctx.fillStyle = fillColor;
      ctx.fill();
      ctx.restore();

      ctx.lineWidth = 2.5;
      ctx.strokeStyle = strokeColor;
      drawRoundedRectPath(ctx, x, y, widthN, heightN, 16);
      ctx.stroke();

      ctx.fillStyle = noteColor;
      ctx.font = '700 12px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(typeIcons[node.type] || node.type.slice(0, 2).toUpperCase(), x + 16, y + 16);

      ctx.fillStyle = labelColor;
      ctx.font = '600 18px sans-serif';
      ctx.textBaseline = 'top';
      ctx.fillText(node.label || node.id, x + 16, y + 38);

      const lines = splitNoteLines(node.notes);
      if (lines.length) {
        ctx.fillStyle = noteColor;
        ctx.font = '500 12px sans-serif';
        let offsetY = y + 64;
        lines.forEach((line) => {
          ctx.fillText(line, x + 16, offsetY);
          offsetY += 16;
        });
      }
    });

    ctx.restore();

    try {
      const dataUrl = canvasEl.toDataURL('image/jpeg', 0.92);
      const link = document.createElement('a');
      link.href = dataUrl;
      const date = new Date().toISOString().slice(0, 10);
      link.download = `topology-sandbox-${date}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error(err);
      window.alert('Unable to export image.');
    }
  }

  function loadTopology(data) {
    if (!data || !Array.isArray(data.nodes) || !Array.isArray(data.links)) {
      window.alert('Invalid topology file.');
      return;
    }
    clearCanvas(false);

    data.nodes.forEach((node) => {
      if (!node || !node.id || !node.type) return;
      const x = typeof node.x === 'number' ? node.x : undefined;
      const y = typeof node.y === 'number' ? node.y : undefined;
      spawnNode(node.type, {
        id: node.id,
        label: node.label,
        notes: node.notes,
        x,
        y,
      });
    });

    data.links.forEach((link) => {
      if (!link || !link.id || !state.nodes.has(link.from) || !state.nodes.has(link.to)) return;
      createLink(link.from, link.to, {
        id: link.id,
        label: link.label,
        aDetails: link.aDetails,
        bDetails: link.bDetails,
        notes: link.notes,
      });
    });

    if (Array.isArray(data.bonds)) {
      data.bonds.forEach((bond) => {
        if (!bond || !Array.isArray(bond.links) || bond.links.length < 2) return;
        const validLinks = bond.links.filter((linkId) => state.links.has(linkId));
        if (validLinks.length < 2) return;
        const sharedNodes = Array.isArray(bond.sharedNodes)
          ? bond.sharedNodes
          : (bond.sharedNode ? [bond.sharedNode] : undefined);
        createBond(validLinks, {
          id: bond.id,
          label: bond.label,
          sharedNodes,
        });
      });
    }

    updateArtboardExtents();
    highlightSelection();
    refreshAllPositions();
    centerViewOnContent('auto');
  }

  // --- Form bindings ---
  if (nodeLabelInput) {
    nodeLabelInput.addEventListener('input', () => {
      if (!state.selected || state.selected.type !== 'node') return;
      const node = state.nodes.get(state.selected.id);
      if (!node) return;
      node.label = nodeLabelInput.value;
      updateNodeAppearance(node);
    });
  }
  if (nodeTypeSelect) {
    nodeTypeSelect.addEventListener('change', () => {
      if (!state.selected || state.selected.type !== 'node') return;
      const node = state.nodes.get(state.selected.id);
      if (!node) return;
      const newType = nodeTypeSelect.value;
      node.type = validTypes.has(newType) ? newType : node.type;
      updateNodeAppearance(node);
    });
  }
  if (nodeNotesInput) {
    nodeNotesInput.addEventListener('input', () => {
      if (!state.selected || state.selected.type !== 'node') return;
      const node = state.nodes.get(state.selected.id);
      if (!node) return;
      node.notes = nodeNotesInput.value;
      updateNodeAppearance(node);
    });
  }
  if (deleteNodeBtn) {
    deleteNodeBtn.addEventListener('click', () => {
      if (!state.selected || state.selected.type !== 'node') return;
      const node = state.nodes.get(state.selected.id);
      if (!node) return;
      if (window.confirm(`Delete node "${node.label || node.id}" and its links?`)) {
        removeNode(node.id);
      }
    });
  }

  if (linkLabelInput) {
    linkLabelInput.addEventListener('input', () => {
      if (!state.selected || state.selected.type !== 'link') return;
      const link = state.links.get(state.selected.id);
      if (!link) return;
      link.label = linkLabelInput.value;
      updateLinkGraphics(link);
    });
  }
  if (linkAInput) {
    linkAInput.addEventListener('input', () => {
      if (!state.selected || state.selected.type !== 'link') return;
      const link = state.links.get(state.selected.id);
      if (!link) return;
      link.aDetails = linkAInput.value;
      updateLinkGraphics(link);
    });
  }
  if (linkBInput) {
    linkBInput.addEventListener('input', () => {
      if (!state.selected || state.selected.type !== 'link') return;
      const link = state.links.get(state.selected.id);
      if (!link) return;
      link.bDetails = linkBInput.value;
      updateLinkGraphics(link);
    });
  }
  if (linkNotesInput) {
    linkNotesInput.addEventListener('input', () => {
      if (!state.selected || state.selected.type !== 'link') return;
      const link = state.links.get(state.selected.id);
      if (!link) return;
      link.notes = linkNotesInput.value;
      updateLinkGraphics(link);
    });
  }
  if (deleteLinkBtn) {
    deleteLinkBtn.addEventListener('click', () => {
      if (!state.selected || state.selected.type !== 'link') return;
      const link = state.links.get(state.selected.id);
      if (!link) return;
      if (window.confirm(`Delete link between "${link.from}" and "${link.to}"?`)) {
        removeLink(link.id);
      }
    });
  }

  if (bondLabelInput) {
    bondLabelInput.addEventListener('input', () => {
      if (!state.selected || state.selected.type !== 'bond') return;
      const bond = state.bonds.get(state.selected.id);
      if (!bond) return;
      bond.label = bondLabelInput.value;
      updateBondGraphics(bond);
      updateArtboardExtents();
    });
  }
  if (deleteBondBtn) {
    deleteBondBtn.addEventListener('click', () => {
      if (!state.selected || state.selected.type !== 'bond') return;
      const bond = state.bonds.get(state.selected.id);
      if (!bond) return;
      if (window.confirm(`Delete bond "${bond.label || bond.id}"?`)) {
        removeBond(bond.id);
      }
    });
  }

  // --- Buttons / controls ---
  paletteButtons.forEach((btn) => {
    const type = btn.dataset.nodeType;
    if (!type) return;
    btn.setAttribute('draggable', 'true');
    btn.addEventListener('click', () => spawnNode(type));
    btn.addEventListener('dragstart', (e) => {
      e.dataTransfer?.setData('text/plain', type);
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy';
    });
  });

  stage.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  });
  stage.addEventListener('drop', (e) => {
    e.preventDefault();
    const type = e.dataTransfer?.getData('text/plain');
    if (!type) return;
    const rect = stage.getBoundingClientRect();
    const x = e.clientX - rect.left + stage.scrollLeft;
    const y = e.clientY - rect.top + stage.scrollTop;
    const node = spawnNode(type, { x: x - 80, y: y - 40 });
    if (node) selectNode(node.id);
  });

  stage.addEventListener('click', (e) => {
    if (e.target === stage || e.target === linkLayer) {
      if (state.bondMode) {
        state.bondSelection.clear();
        state.activeBondId = null;
        highlightSelection();
      }
      selectNone();
    }
  });

  linkLayer.addEventListener('click', (e) => {
    if (e.target === linkLayer) {
      if (state.bondMode) {
        state.bondSelection.clear();
        state.activeBondId = null;
        highlightSelection();
      }
      selectNone();
    }
  });

  linkModeBtn?.addEventListener('click', () => setLinkMode(!state.linkMode));
  cancelLinkBtn?.addEventListener('click', () => {
    state.linkStart = null;
    highlightSelection();
  });
  bondModeBtn?.addEventListener('click', () => setBondMode(!state.bondMode));
  cancelBondBtn?.addEventListener('click', () => {
    state.bondSelection.clear();
    state.activeBondId = null;
    highlightSelection();
  });
  toggleSnapBtn?.addEventListener('click', () => {
    state.snapToGrid = !state.snapToGrid;
    highlightSelection();
  });
  fitViewBtn?.addEventListener('click', () => {
    updateArtboardExtents();
    centerViewOnContent();
  });
  clearBtn?.addEventListener('click', () => clearCanvas(true));
  exportBtn?.addEventListener('click', exportTopology);
  exportJpgBtn?.addEventListener('click', exportTopologyImage);
  importInput?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = JSON.parse(String(evt.target?.result || '{}'));
        loadTopology(data);
      } catch (err) {
        console.error(err);
        window.alert('Unable to parse topology file.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  function setupResizeWatcher() {
    if (window.ResizeObserver) {
      const observer = new ResizeObserver(() => requestFullRefresh());
      observer.observe(stage);
    }
    window.addEventListener('resize', requestFullRefresh);
  }

  applyArtboardSize();
  updateArtboardExtents();
  highlightSelection();
  setupResizeWatcher();
  refreshAllPositions();
  updateEmptyState();
})();
