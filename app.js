(function () {
  'use strict';

  var STORAGE_KEY = 'familyTreeData';
  var MAX_GENERATIONS = 5;

  // ── Data ────────────────────────────────────────────
  var data = { members: {}, rootId: null };

  function loadFromStorage() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed.members === 'object') {
          data = parsed;
        }
      }
    } catch (e) {
      console.warn('Could not load family tree data:', e);
    }
  }

  function saveToStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('Could not save family tree data:', e);
    }
  }

  function generateId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    // Fallback for older browsers
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  function addRootMember(name, profession) {
    var id = generateId();
    data.members[id] = {
      id: id,
      name: name,
      profession: profession || 'Unknown',
      parentId: null,
      generation: 1
    };
    data.rootId = id;
    saveToStorage();
    renderTree();
  }

  function addMember(parentId, name, profession) {
    var parent = data.members[parentId];
    if (!parent) return;
    if (parent.generation >= MAX_GENERATIONS) return;

    var id = generateId();
    data.members[id] = {
      id: id,
      name: name,
      profession: profession || 'Unknown',
      parentId: parentId,
      generation: parent.generation + 1
    };
    saveToStorage();
    renderTree();
  }

  // ── Rendering ───────────────────────────────────────
  var treeRows = document.getElementById('tree-rows');
  var svg = document.getElementById('connector-svg');
  var treeContainer = document.getElementById('tree-container');

  function getMembersByGeneration() {
    var rows = {};
    var members = data.members;
    for (var id in members) {
      var m = members[id];
      var g = m.generation;
      if (!rows[g]) rows[g] = [];
      rows[g].push(m);
    }
    return rows;
  }

  function renderTree() {
    treeRows.innerHTML = '';
    svg.innerHTML = '';

    var memberIds = Object.keys(data.members);
    if (memberIds.length === 0) {
      renderEmptyState();
      return;
    }

    var byGen = getMembersByGeneration();
    var nodeEls = {}; // id -> DOM element

    // Sort generations
    var gens = Object.keys(byGen).map(Number).sort(function (a, b) { return a - b; });

    gens.forEach(function (g) {
      var row = document.createElement('div');
      row.className = 'generation-row';
      row.dataset.generation = g;

      // Order members: root first, then by parentId grouping
      var members = byGen[g].slice().sort(function (a, b) {
        if (a.parentId === b.parentId) return 0;
        if (!a.parentId) return -1;
        if (!b.parentId) return 1;
        // Group siblings together by sorting by parentId
        return a.parentId < b.parentId ? -1 : 1;
      });

      members.forEach(function (member) {
        var node = createNodeEl(member);
        row.appendChild(node);
        nodeEls[member.id] = node;
      });

      treeRows.appendChild(row);
    });

    // After DOM is painted, draw SVG lines
    requestAnimationFrame(function () {
      drawConnectors(nodeEls);
    });
  }

  function createNodeEl(member) {
    var node = document.createElement('div');
    node.className = 'person-node gen-' + member.generation;
    node.dataset.id = member.id;

    var nameEl = document.createElement('div');
    nameEl.className = 'node-name';
    nameEl.textContent = member.name;

    var profEl = document.createElement('div');
    profEl.className = 'node-profession';
    profEl.textContent = member.profession;

    node.appendChild(nameEl);
    node.appendChild(profEl);

    if (member.generation < MAX_GENERATIONS) {
      var btn = document.createElement('button');
      btn.className = 'add-child-btn';
      btn.title = 'Add child of ' + member.name;
      btn.textContent = '+';
      btn.dataset.parentId = member.id;
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        openModal(member.id);
      });
      node.appendChild(btn);
    }

    return node;
  }

  function renderEmptyState() {
    var empty = document.createElement('div');
    empty.id = 'empty-state';

    var p = document.createElement('p');
    p.textContent = 'Start your family tree';

    var btn = document.createElement('button');
    btn.id = 'add-root-btn';
    btn.textContent = 'Add Root Person';
    btn.addEventListener('click', function () {
      openModal(null);
    });

    empty.appendChild(p);
    empty.appendChild(btn);
    treeRows.appendChild(empty);
  }

  // ── SVG connectors ───────────────────────────────────
  function getRect(el) {
    var containerRect = treeContainer.getBoundingClientRect();
    var elRect = el.getBoundingClientRect();
    return {
      top: elRect.top - containerRect.top + treeContainer.scrollTop,
      left: elRect.left - containerRect.left + treeContainer.scrollLeft,
      bottom: elRect.bottom - containerRect.top + treeContainer.scrollTop,
      right: elRect.right - containerRect.left + treeContainer.scrollLeft,
      centerX: elRect.left - containerRect.left + treeContainer.scrollLeft + elRect.width / 2,
      centerY: elRect.top - containerRect.top + treeContainer.scrollTop + elRect.height / 2,
    };
  }

  function drawConnectors(nodeEls) {
    svg.innerHTML = '';

    // Update SVG size to match container
    var contRect = treeContainer.getBoundingClientRect();
    svg.setAttribute('width', treeContainer.scrollWidth);
    svg.setAttribute('height', treeContainer.scrollHeight);

    // Group children by parent
    var childrenByParent = {};
    for (var id in data.members) {
      var member = data.members[id];
      if (member.parentId) {
        if (!childrenByParent[member.parentId]) childrenByParent[member.parentId] = [];
        childrenByParent[member.parentId].push(member.id);
      }
    }

    for (var parentId in childrenByParent) {
      var parentEl = nodeEls[parentId];
      if (!parentEl) continue;
      var parentRect = getRect(parentEl);

      var children = childrenByParent[parentId];
      var childRects = children.map(function (cid) {
        var cel = nodeEls[cid];
        return cel ? getRect(cel) : null;
      }).filter(Boolean);

      if (childRects.length === 0) continue;

      // midY = halfway between parent bottom and first child top
      var firstChildTop = childRects.reduce(function (min, r) { return Math.min(min, r.top); }, Infinity);
      var midY = parentRect.bottom + (firstChildTop - parentRect.bottom) / 2;

      // Vertical drop from parent centre to midY
      var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      var d = 'M ' + parentRect.centerX + ' ' + parentRect.bottom +
              ' L ' + parentRect.centerX + ' ' + midY;

      if (children.length > 1) {
        // Horizontal bar across all children at midY
        var leftX = childRects.reduce(function (min, r) { return Math.min(min, r.centerX); }, Infinity);
        var rightX = childRects.reduce(function (max, r) { return Math.max(max, r.centerX); }, -Infinity);
        d += ' M ' + leftX + ' ' + midY + ' L ' + rightX + ' ' + midY;
      }

      // Vertical drops from midY to each child
      childRects.forEach(function (cr) {
        d += ' M ' + cr.centerX + ' ' + midY + ' L ' + cr.centerX + ' ' + cr.top;
      });

      path.setAttribute('d', d);
      path.setAttribute('class', 'connector-line');
      svg.appendChild(path);
    }
  }

  // ── Modal ────────────────────────────────────────────
  var overlay = document.getElementById('modal-overlay');
  var modalTitle = document.getElementById('modal-title');
  var modalSubtitle = document.getElementById('modal-subtitle');
  var form = document.getElementById('member-form');
  var inputName = document.getElementById('input-name');
  var inputProfession = document.getElementById('input-profession');
  var nameError = document.getElementById('name-error');
  var cancelBtn = document.getElementById('modal-cancel');

  var currentParentId = null;

  function openModal(parentId) {
    currentParentId = parentId;

    if (parentId === null) {
      modalTitle.textContent = 'Add Root Person';
      modalSubtitle.textContent = 'This will be generation 1 of your family tree.';
    } else {
      var parent = data.members[parentId];
      modalTitle.textContent = 'Add Family Member';
      modalSubtitle.textContent = 'Adding child of: ' + parent.name;
    }

    inputName.value = '';
    inputProfession.value = '';
    nameError.classList.add('hidden');
    overlay.classList.remove('hidden');

    // Auto-focus
    setTimeout(function () { inputName.focus(); }, 50);
  }

  function closeModal() {
    overlay.classList.add('hidden');
    currentParentId = null;
  }

  cancelBtn.addEventListener('click', closeModal);

  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) closeModal();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !overlay.classList.contains('hidden')) {
      closeModal();
    }
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    var name = inputName.value.trim();
    if (!name) {
      nameError.classList.remove('hidden');
      inputName.focus();
      return;
    }
    nameError.classList.add('hidden');

    var profession = inputProfession.value.trim();

    if (currentParentId === null) {
      addRootMember(name, profession);
    } else {
      addMember(currentParentId, name, profession);
    }

    closeModal();
  });

  // Redraw connectors on window resize
  window.addEventListener('resize', function () {
    var nodeEls = {};
    treeRows.querySelectorAll('.person-node').forEach(function (el) {
      nodeEls[el.dataset.id] = el;
    });
    drawConnectors(nodeEls);
  });

  // ── Boot ─────────────────────────────────────────────
  loadFromStorage();
  renderTree();

}());
