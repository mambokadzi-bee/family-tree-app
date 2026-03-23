(function () {
  'use strict';

  var STORAGE_KEY = 'familyTreeData';
  var MAX_GENERATIONS = 5;

  // ── Data ────────────────────────────────────────────
  var data = {
    members: {},
    rootId: null,
    familyName: 'Family Tree',
    createdBy: '',
    lastUpdated: null
  };

  function loadFromStorage() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed.members === 'object') {
          data = parsed;
          if (!data.familyName) data.familyName = 'Family Tree';
          if (!data.createdBy) data.createdBy = '';
          if (data.lastUpdated === undefined) data.lastUpdated = null;
          // Assign order to legacy members that don't have it
          assignMissingOrders();
        }
      }
    } catch (e) {
      console.warn('Could not load family tree data:', e);
    }
  }

  function assignMissingOrders() {
    var counterByParent = {};
    // Process generation by generation so parents are ordered first
    var byGen = {};
    for (var id in data.members) {
      var m = data.members[id];
      if (!byGen[m.generation]) byGen[m.generation] = [];
      byGen[m.generation].push(m);
    }
    var gens = Object.keys(byGen).map(Number).sort(function (a, b) { return a - b; });
    gens.forEach(function (g) {
      byGen[g].forEach(function (m) {
        if (m.order === undefined || m.order === null) {
          var pid = m.parentId || '__root__';
          if (!counterByParent[pid]) counterByParent[pid] = 0;
          counterByParent[pid]++;
          m.order = counterByParent[pid];
        }
      });
    });
  }

  function saveToStorage() {
    data.lastUpdated = new Date().toISOString();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('Could not save family tree data:', e);
    }
    updateLastUpdatedDisplay();
  }

  function generateId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  function getNextOrder(parentId) {
    var max = 0;
    for (var id in data.members) {
      var m = data.members[id];
      if (m.parentId === parentId && (m.order || 0) > max) {
        max = m.order;
      }
    }
    return max + 1;
  }

  // ── Tree helpers ─────────────────────────────────────
  function getChildren(parentId) {
    var result = [];
    for (var id in data.members) {
      if (data.members[id].parentId === parentId) result.push(data.members[id]);
    }
    result.sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    return result;
  }

  // Iterative ancestor check — avoids stack overflow and handles cycles
  function isDescendantOf(nodeId, potentialAncestorId) {
    var current = data.members[nodeId];
    var visited = {};
    while (current && current.parentId !== null) {
      if (visited[current.id]) break;
      visited[current.id] = true;
      if (current.parentId === potentialAncestorId) return true;
      current = data.members[current.parentId];
    }
    return false;
  }

  function getSubtreeDepth(memberId) {
    var children = getChildren(memberId);
    if (children.length === 0) return 1;
    var max = 0;
    children.forEach(function (c) {
      var d = getSubtreeDepth(c.id);
      if (d > max) max = d;
    });
    return 1 + max;
  }

  function updateGenerations(memberId, newGeneration) {
    var member = data.members[memberId];
    if (!member) return;
    member.generation = newGeneration;
    getChildren(memberId).forEach(function (c) {
      updateGenerations(c.id, newGeneration + 1);
    });
  }

  function deleteSubtree(memberId) {
    getChildren(memberId).forEach(function (c) { deleteSubtree(c.id); });
    delete data.members[memberId];
    if (data.rootId === memberId) data.rootId = null;
  }

  function deleteMember(memberId) {
    var member = data.members[memberId];
    if (!member) return;
    var desc = getSubtreeDepth(memberId) - 1; // depth - 1 = number of descendant levels
    var childCount = getChildren(memberId).length;
    if (childCount > 0) {
      var totalDesc = 0;
      (function count(id) {
        getChildren(id).forEach(function (c) { totalDesc++; count(c.id); });
      }(memberId));
      if (!confirm('Delete "' + member.name + '" and ' + totalDesc + ' descendant' + (totalDesc === 1 ? '' : 's') + '? This cannot be undone.')) return;
    }
    deleteSubtree(memberId);
    saveToStorage();
    renderTree();
  }

  function addRootMember(name, profession) {
    var id = generateId();
    data.members[id] = {
      id: id,
      name: name,
      profession: profession || '',
      parentId: null,
      generation: 1,
      order: getNextOrder(null)
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
      profession: profession || '',
      parentId: parentId,
      generation: parent.generation + 1,
      order: getNextOrder(parentId)
    };
    saveToStorage();
    renderTree();
  }

  // ── Ordering ─────────────────────────────────────────
  function getSiblings(member) {
    var result = [];
    for (var id in data.members) {
      var m = data.members[id];
      if (m.parentId === member.parentId) result.push(m);
    }
    result.sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    return result;
  }

  function moveMember(id, direction) {
    var member = data.members[id];
    if (!member) return;
    var siblings = getSiblings(member);
    var idx = -1;
    for (var i = 0; i < siblings.length; i++) {
      if (siblings[i].id === id) { idx = i; break; }
    }
    if (direction === 'left' && idx <= 0) return;
    if (direction === 'right' && idx >= siblings.length - 1) return;
    var swapIdx = direction === 'left' ? idx - 1 : idx + 1;
    var swapSibling = siblings[swapIdx];
    var tmp = member.order;
    member.order = swapSibling.order;
    swapSibling.order = tmp;
    saveToStorage();
    renderTree();
  }

  // ── Rendering ───────────────────────────────────────
  var treeRows = document.getElementById('tree-rows');
  var svg = document.getElementById('connector-svg');
  var treeContainer = document.getElementById('tree-container');

  // Recursively render a member and all its descendants as nested flex groups.
  // Children are placed directly below their parent and move with it automatically.
  function renderSubtree(memberId) {
    var member = data.members[memberId];

    var group = document.createElement('div');
    group.className = 'tree-node-group';

    var siblings = getSiblings(member);
    var sibIdx = -1;
    for (var i = 0; i < siblings.length; i++) {
      if (siblings[i].id === memberId) { sibIdx = i; break; }
    }
    group.appendChild(createNodeEl(member, sibIdx === 0, sibIdx === siblings.length - 1));

    var children = getChildren(memberId);
    if (children.length > 0) {
      var childRow = document.createElement('div');
      childRow.className = 'tree-children';
      children.forEach(function (child) {
        childRow.appendChild(renderSubtree(child.id));
      });
      group.appendChild(childRow);
    }

    return group;
  }

  function renderTree() {
    treeRows.innerHTML = '';
    svg.innerHTML = '';

    if (Object.keys(data.members).length === 0) {
      renderEmptyState();
      return;
    }

    if (data.rootId && data.members[data.rootId]) {
      treeRows.appendChild(renderSubtree(data.rootId));
    }

    var nodeEls = {};
    treeRows.querySelectorAll('.person-node').forEach(function (el) {
      nodeEls[el.dataset.id] = el;
    });

    requestAnimationFrame(function () {
      drawConnectors(nodeEls);
    });
  }

  // ── Drag & drop ──────────────────────────────────────
  var dragState = { memberId: null, dropType: null, dropTargetId: null };

  function clearDropIndicators() {
    treeRows.querySelectorAll('[data-drop-target]').forEach(function (el) {
      delete el.dataset.dropTarget;
    });
  }

  function performDrop(draggedId, targetId, dropType) {
    var dragged = data.members[draggedId];
    var target  = data.members[targetId];
    if (!dragged || !target) return;

    if (dropType === 'parent') {
      // Re-parent: dragged becomes a child of target
      dragged.parentId = target.id;
      dragged.order    = getNextOrder(target.id);
      updateGenerations(draggedId, target.generation + 1);
    } else {
      // Sibling reorder (before / after)
      var siblings = getSiblings(dragged); // sorted by order, includes dragged
      var draggedIdx = -1, targetIdx = -1;
      for (var i = 0; i < siblings.length; i++) {
        if (siblings[i].id === draggedId) draggedIdx = i;
        if (siblings[i].id === targetId)  targetIdx  = i;
      }
      if (draggedIdx === -1 || targetIdx === -1) return;

      var insertAfter = dropType === 'after';
      var newOrder = [];
      for (var j = 0; j < siblings.length; j++) {
        if (siblings[j].id === draggedId) continue;
        if (siblings[j].id === targetId) {
          if (!insertAfter) newOrder.push(dragged);
          newOrder.push(siblings[j]);
          if (insertAfter)  newOrder.push(dragged);
        } else {
          newOrder.push(siblings[j]);
        }
      }
      newOrder.forEach(function (s, idx) { data.members[s.id].order = idx; });
    }

    saveToStorage();
    renderTree();
  }

  function createNodeEl(member, isFirst, isLast) {
    var node = document.createElement('div');
    node.className = 'person-node gen-' + member.generation;
    node.dataset.id = member.id;

    // ── Drag source (root is not draggable — it has no parent to move away from) ──
    if (member.parentId !== null) {
      node.draggable = true;

      node.addEventListener('dragstart', function (e) {
        // Don't start drag when clicking a button or active input
        if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') {
          e.preventDefault();
          return;
        }
        if (node.querySelector('.inline-edit-input')) { e.preventDefault(); return; }
        dragState.memberId = member.id;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', member.id); // required for Firefox
        setTimeout(function () { node.classList.add('dragging'); }, 0);
      });

      node.addEventListener('dragend', function () {
        node.classList.remove('dragging');
        clearDropIndicators();
        dragState.memberId = null;
        dragState.dropType = null;
        dragState.dropTargetId = null;
      });
    }

    // ── Drop target ──────────────────────────────────
    node.addEventListener('dragover', function (e) {
      if (!dragState.memberId || dragState.memberId === member.id) return;
      var dragged = data.members[dragState.memberId];
      if (!dragged) return;
      // Can't drop onto own descendants
      if (isDescendantOf(member.id, dragged.id)) return;

      var dropType = null;
      if (dragged.parentId === member.parentId) {
        // Same parent → sibling reorder
        var rect = node.getBoundingClientRect();
        dropType = e.clientX < rect.left + rect.width / 2 ? 'before' : 'after';
      } else if (member.id !== dragged.parentId) {
        // Different parent → re-parent if subtree fits within MAX_GENERATIONS
        if (member.generation + getSubtreeDepth(dragged.id) <= MAX_GENERATIONS) {
          dropType = 'parent';
        }
      }

      if (dropType) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        clearDropIndicators();
        node.dataset.dropTarget = dropType;
        dragState.dropType = dropType;
        dragState.dropTargetId = member.id;
      }
    });

    node.addEventListener('dragleave', function (e) {
      if (!node.contains(e.relatedTarget)) {
        delete node.dataset.dropTarget;
      }
    });

    node.addEventListener('drop', function (e) {
      e.preventDefault();
      if (!dragState.memberId || !dragState.dropType) return;
      performDrop(dragState.memberId, member.id, dragState.dropType);
      clearDropIndicators();
      dragState.memberId = null;
      dragState.dropType = null;
      dragState.dropTargetId = null;
    });

    // ── Delete button ──────────────────────────────────
    var delBtn = document.createElement('button');
    delBtn.className = 'delete-btn';
    delBtn.title = 'Delete ' + member.name;
    delBtn.innerHTML = '&#x2715;';
    delBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      deleteMember(member.id);
    });
    node.appendChild(delBtn);

    // ── Move left / right buttons ──────────────────────
    var moveLeft = document.createElement('button');
    moveLeft.className = 'move-btn move-btn-left';
    moveLeft.title = 'Move left';
    moveLeft.innerHTML = '&#9664;';
    moveLeft.disabled = isFirst;
    moveLeft.addEventListener('click', function (e) {
      e.stopPropagation();
      moveMember(member.id, 'left');
    });

    var moveRight = document.createElement('button');
    moveRight.className = 'move-btn move-btn-right';
    moveRight.title = 'Move right';
    moveRight.innerHTML = '&#9654;';
    moveRight.disabled = isLast;
    moveRight.addEventListener('click', function (e) {
      e.stopPropagation();
      moveMember(member.id, 'right');
    });

    node.appendChild(moveLeft);
    node.appendChild(moveRight);

    // ── Name ──────────────────────────────────────────
    var nameEl = document.createElement('div');
    nameEl.className = 'node-name';
    nameEl.textContent = member.name;
    nameEl.title = 'Click to edit name';
    nameEl.addEventListener('click', function (e) {
      e.stopPropagation();
      startInlineEdit(nameEl, member, 'name', nodeEls_ref);
    });
    node.appendChild(nameEl);

    // ── Profession ────────────────────────────────────
    var profEl = document.createElement('div');
    profEl.className = 'node-profession' + (member.profession ? '' : ' placeholder');
    profEl.textContent = member.profession || 'Add profession…';
    profEl.title = 'Click to edit profession';
    profEl.addEventListener('click', function (e) {
      e.stopPropagation();
      startInlineEdit(profEl, member, 'profession', nodeEls_ref);
    });
    node.appendChild(profEl);

    // ── Add child button ───────────────────────────────
    if (member.generation < MAX_GENERATIONS) {
      var btn = document.createElement('button');
      btn.className = 'add-child-btn';
      btn.title = 'Add child of ' + member.name;
      btn.textContent = '+';
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        openModal(member.id);
      });
      node.appendChild(btn);
    }

    return node;
  }

  // Shared nodeEls reference so inline-edit redraw can access current nodes
  var nodeEls_ref = {};

  function startInlineEdit(el, member, field) {
    if (el.querySelector('input')) return; // already editing

    var currentVal = field === 'name' ? member.name : (member.profession || '');

    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'inline-edit-input';
    input.value = currentVal;
    input.placeholder = field === 'name' ? 'Enter name' : 'Enter profession';

    el.textContent = '';
    el.classList.add('editing');
    el.appendChild(input);
    input.focus();
    input.select();

    var committed = false;

    function commitEdit() {
      if (committed) return;
      committed = true;

      var newVal = input.value.trim();

      if (field === 'name') {
        if (!newVal) {
          // Revert — name cannot be empty
          el.textContent = member.name;
          el.classList.remove('editing');
          return;
        }
        member.name = newVal;
        el.textContent = member.name;
      } else {
        member.profession = newVal;
        el.classList.toggle('placeholder', !newVal);
        el.textContent = newVal || 'Add profession…';
      }

      el.classList.remove('editing');
      saveToStorage();
      // Redraw connectors in case node dimensions changed
      redrawConnectors();
    }

    input.addEventListener('blur', commitEdit);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.blur();
      }
      if (e.key === 'Escape') {
        committed = true; // prevent blur from committing
        el.textContent = field === 'name' ? member.name : (member.profession || 'Add profession…');
        el.classList.toggle('placeholder', field === 'profession' && !member.profession);
        el.classList.remove('editing');
      }
    });
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
      centerY: elRect.top - containerRect.top + treeContainer.scrollTop + elRect.height / 2
    };
  }

  function redrawConnectors() {
    var nodeEls = {};
    treeRows.querySelectorAll('.person-node').forEach(function (el) {
      nodeEls[el.dataset.id] = el;
    });
    requestAnimationFrame(function () {
      drawConnectors(nodeEls);
    });
  }

  function drawConnectors(nodeEls) {
    svg.innerHTML = '';
    svg.setAttribute('width', treeContainer.scrollWidth);
    svg.setAttribute('height', treeContainer.scrollHeight);

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

      var firstChildTop = childRects.reduce(function (min, r) { return Math.min(min, r.top); }, Infinity);
      var midY = parentRect.bottom + (firstChildTop - parentRect.bottom) / 2;

      var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      var d = 'M ' + parentRect.centerX + ' ' + parentRect.bottom +
              ' L ' + parentRect.centerX + ' ' + midY;

      if (children.length > 1) {
        var leftX = childRects.reduce(function (min, r) { return Math.min(min, r.centerX); }, Infinity);
        var rightX = childRects.reduce(function (max, r) { return Math.max(max, r.centerX); }, -Infinity);
        d += ' M ' + leftX + ' ' + midY + ' L ' + rightX + ' ' + midY;
      }

      childRects.forEach(function (cr) {
        d += ' M ' + cr.centerX + ' ' + midY + ' L ' + cr.centerX + ' ' + cr.top;
      });

      path.setAttribute('d', d);
      path.setAttribute('class', 'connector-line');
      svg.appendChild(path);
    }
  }

  // ── Header ───────────────────────────────────────────
  var familyNameEl = document.getElementById('family-name');
  var createdByInput = document.getElementById('created-by-input');
  var lastUpdatedDisplay = document.getElementById('last-updated-display');
  var createdByError = document.getElementById('created-by-error');

  function formatDate(isoString) {
    if (!isoString) return '—';
    var d = new Date(isoString);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) +
           ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }

  function updateLastUpdatedDisplay() {
    if (lastUpdatedDisplay) {
      lastUpdatedDisplay.textContent = formatDate(data.lastUpdated);
    }
  }

  function bindHeader() {
    // ── Family name ────────────────────────────────────
    familyNameEl.textContent = data.familyName || 'Family Tree';
    document.title = data.familyName || 'Family Tree';

    familyNameEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        familyNameEl.blur();
      }
    });

    familyNameEl.addEventListener('blur', function () {
      var val = familyNameEl.textContent.trim();
      if (!val) {
        familyNameEl.textContent = data.familyName || 'Family Tree';
        return;
      }
      if (val !== data.familyName) {
        data.familyName = val;
        document.title = val;
        saveToStorage();
      }
    });

    // Prevent paste from inserting HTML
    familyNameEl.addEventListener('paste', function (e) {
      e.preventDefault();
      var text = (e.clipboardData || window.clipboardData).getData('text/plain');
      document.execCommand('insertText', false, text);
    });

    // ── Created by ─────────────────────────────────────
    createdByInput.value = data.createdBy || '';

    createdByInput.addEventListener('input', function () {
      if (createdByInput.value.trim()) {
        createdByError.classList.add('hidden');
        createdByInput.classList.remove('invalid');
      }
    });

    createdByInput.addEventListener('blur', function () {
      var val = createdByInput.value.trim();
      if (!val) {
        createdByError.classList.remove('hidden');
        createdByInput.classList.add('invalid');
        return;
      }
      createdByError.classList.add('hidden');
      createdByInput.classList.remove('invalid');
      if (val !== data.createdBy) {
        data.createdBy = val;
        saveToStorage();
      }
    });

    // ── Last updated ───────────────────────────────────
    updateLastUpdatedDisplay();
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

    // Enforce "Created by" before any member can be added
    var cbVal = createdByInput.value.trim();
    if (!cbVal) {
      closeModal();
      createdByInput.classList.add('invalid');
      createdByError.classList.remove('hidden');
      createdByInput.focus();
      return;
    }
    if (cbVal !== data.createdBy) {
      data.createdBy = cbVal;
    }

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

  window.addEventListener('resize', redrawConnectors);

  // ── Boot ─────────────────────────────────────────────
  loadFromStorage();
  bindHeader();
  renderTree();

}());
