const DEFAULT_RECIPES = {
  "Outie Block": { icon: "🟩", ingredients: [
    { name: "Pastel Aqua Block", qty: 1 },
    { name: "Bubble Wrap", qty: 1 }
  ]},
  "Pastel Aqua Block": { icon: "🟦", ingredients: [] },
  "Bubble Wrap": { icon: "🔵", ingredients: [] }
};

let recipes = {};
try {
  const saved = localStorage.getItem("gt_recipes");
  recipes = saved ? JSON.parse(saved) : JSON.parse(JSON.stringify(DEFAULT_RECIPES));
} catch (e) {
  recipes = JSON.parse(JSON.stringify(DEFAULT_RECIPES));
}

function saveRecipes() {
  localStorage.setItem("gt_recipes", JSON.stringify(recipes));
}

const recipeSelect = document.getElementById("recipe-select");
const recipeQtyInput = document.getElementById("recipe-qty");
const treeOutput = document.getElementById("tree-output");
const shoppingWrap = document.getElementById("shopping-list-wrap");
const shoppingList = document.getElementById("shopping-list");
const recipeListExisting = document.getElementById("recipe-list-existing");
const editorPanel = document.getElementById("editor-panel");
const ingredientRows = document.getElementById("ingredient-rows");

function refreshRecipeSelect() {
  const current = recipeSelect.value;
  const names = Object.keys(recipes).sort();
  recipeSelect.innerHTML = names.map(n => `<option value="${n}">${n}</option>`).join("");
  if (current && names.includes(current)) {
    recipeSelect.value = current;
  }
}

function refreshRecipeListButtons() {
  const names = Object.keys(recipes).sort();
  recipeListExisting.innerHTML = names.map(n =>
    `<button type="button" data-name="${n}">${recipes[n].icon || "🌱"} ${n}</button>`
  ).join("");
  recipeListExisting.querySelectorAll("button").forEach(btn => {
    btn.addEventListener("click", () => loadRecipeIntoForm(btn.dataset.name));
  });
}

function buildNode(name, qty, ancestors = []) {
  const r = recipes[name];
  const isLeaf = !r || !r.ingredients || r.ingredients.length === 0;
  const icon = r ? (r.icon || "🌱") : "🌱";
  const isCycle = ancestors.includes(name);
  const note = r && r.note ? r.note : "";

  let childrenHTML = "";
  if (!isLeaf && !isCycle) {
    const nextAncestors = [...ancestors, name];
    childrenHTML = `<ul>${r.ingredients.map(ing =>
      `<li>${buildNode(ing.name, ing.qty * qty, nextAncestors)}</li>`
    ).join("")}</ul>`;
  }

  const hint = isCycle
    ? "⚠ muter balik ke atas"
    : (isLeaf ? "+ tambah bahan" : "✎ edit bahan");

  const noteFlag = note
    ? `<span class="n-note-flag" title="${note.replace(/"/g, "&quot;")}">📝 catatan</span>`
    : "";

  return `
    <div class="tree-node ${isLeaf || isCycle ? "leaf" : ""}">
      <div class="node-box" data-name="${name.replace(/"/g, "&quot;")}">
        <span class="n-icon">${icon}</span>
        <span class="n-name">${name}</span>
        <span class="n-qty">x${qty}</span>
        <span class="n-hint">${hint}</span>
        ${noteFlag}
      </div>
    </div>
    ${childrenHTML}
  `;
}

function collectLeaves(name, qty, acc, ancestors = []) {
  const r = recipes[name];
  const isLeaf = !r || !r.ingredients || r.ingredients.length === 0;
  const isCycle = ancestors.includes(name);
  if (isLeaf || isCycle) {
    acc[name] = (acc[name] || 0) + qty;
    return acc;
  }
  const nextAncestors = [...ancestors, name];
  r.ingredients.forEach(ing => collectLeaves(ing.name, ing.qty * qty, acc, nextAncestors));
  return acc;
}

// true if setting `name`'s ingredients to `ingredientNames` would create a cycle
function wouldCreateCycle(name, ingredientNames) {
  // can `name` be reached again starting from any of its proposed new ingredients?
  const visit = (current, target, seen) => {
    if (current === target) return true;
    if (seen.has(current)) return false;
    seen.add(current);
    const r = recipes[current];
    if (!r || !r.ingredients) return false;
    return r.ingredients.some(ing => visit(ing.name, target, seen));
  };
  return ingredientNames.some(ingName => ingName === name || visit(ingName, name, new Set()));
}

function renderTree() {
  const target = recipeSelect.value;
  const qty = Math.max(1, parseInt(recipeQtyInput.value) || 1);
  if (!target || !recipes[target]) {
    treeOutput.innerHTML = "";
    shoppingWrap.style.display = "none";
    return;
  }

  treeOutput.innerHTML = `<ul class="tree"><li>${buildNode(target, qty)}</li></ul>`;

  const leaves = collectLeaves(target, qty, {});
  const entries = Object.entries(leaves);
  if (entries.length === 0) {
    shoppingWrap.style.display = "none";
  } else {
    shoppingList.innerHTML = entries.map(([n, q]) =>
      `<li>🌱 ${n} <span class="amt">x${q}</span></li>`
    ).join("");
    shoppingWrap.style.display = "block";
  }
}

document.getElementById("btn-show-tree").addEventListener("click", renderTree);
recipeSelect.addEventListener("change", renderTree);

// ----- Inline node modal (click any node in the tree to add its ingredients) -----
const nodeModal = document.getElementById("node-modal");
const nodeModalTitle = document.getElementById("node-modal-title");
const nodeModalIcon = document.getElementById("node-modal-icon");
const nodeModalNote = document.getElementById("node-modal-note");
const nodeIngredientRows = document.getElementById("node-ingredient-rows");
let currentNodeName = null;

function addNodeIngredientRow(name = "", qty = 1) {
  const row = document.createElement("div");
  row.className = "ingredient-row";
  row.innerHTML = `
    <input type="text" name="ing-name" placeholder="Nama bahan" value="${name}">
    <input type="number" name="ing-qty" min="1" value="${qty}">
    <button type="button" class="rm-ing">✕</button>
  `;
  row.querySelector(".rm-ing").addEventListener("click", () => row.remove());
  nodeIngredientRows.appendChild(row);
}

document.getElementById("btn-node-add-ingredient").addEventListener("click", () => addNodeIngredientRow());

function openNodeModal(name) {
  currentNodeName = name;
  const r = recipes[name];
  nodeModalTitle.textContent = name;
  nodeModalIcon.value = r ? (r.icon || "🌱") : "🌱";
  nodeModalNote.value = r && r.note ? r.note : "";
  nodeIngredientRows.innerHTML = "";
  if (r && r.ingredients && r.ingredients.length > 0) {
    r.ingredients.forEach(ing => addNodeIngredientRow(ing.name, ing.qty));
  }
  nodeModal.classList.add("open");
}

function closeNodeModal() {
  nodeModal.classList.remove("open");
  currentNodeName = null;
}

document.getElementById("node-modal-close").addEventListener("click", closeNodeModal);
nodeModal.addEventListener("click", (e) => {
  if (e.target === nodeModal) closeNodeModal();
});

document.getElementById("btn-node-save").addEventListener("click", () => {
  if (!currentNodeName) return;
  const icon = nodeModalIcon.value.trim() || "🌱";
  const note = nodeModalNote.value.trim();
  const ingredients = [];
  nodeIngredientRows.querySelectorAll(".ingredient-row").forEach(row => {
    const iName = row.querySelector('[name="ing-name"]').value.trim();
    const iQty = Math.max(1, parseInt(row.querySelector('[name="ing-qty"]').value) || 1);
    if (iName) ingredients.push({ name: iName, qty: iQty });
  });

  if (wouldCreateCycle(currentNodeName, ingredients.map(i => i.name))) {
    alert(`Gak bisa disimpan: "${currentNodeName}" gak boleh butuh dirinya sendiri (langsung atau lewat item lain), nanti tree-nya muter terus.`);
    return;
  }

  recipes[currentNodeName] = { icon, ingredients, note };
  saveRecipes();
  refreshRecipeSelect();
  refreshRecipeListButtons();
  // keep the select value pointing at whatever it was (adding a child recipe
  // doesn't change the top-level target), just re-render the tree
  renderTree();
  closeNodeModal();
});

// clicking any node box inside the rendered tree opens the modal for that item
treeOutput.addEventListener("click", (e) => {
  const box = e.target.closest(".node-box");
  if (!box) return;
  openNodeModal(box.dataset.name);
});

function addIngredientRow(name = "", qty = 1) {
  const row = document.createElement("div");
  row.className = "ingredient-row";
  row.innerHTML = `
    <input type="text" name="ing-name" placeholder="Nama bahan" value="${name}">
    <input type="number" name="ing-qty" min="1" value="${qty}">
    <button type="button" class="rm-ing">✕</button>
  `;
  row.querySelector(".rm-ing").addEventListener("click", () => row.remove());
  ingredientRows.appendChild(row);
}

document.getElementById("btn-add-ingredient").addEventListener("click", () => addIngredientRow());

document.getElementById("btn-toggle-editor").addEventListener("click", () => {
  editorPanel.classList.toggle("open");
});

function clearForm() {
  document.getElementById("edit-item-name").value = "";
  document.getElementById("edit-item-icon").value = "🟩";
  document.getElementById("edit-item-note").value = "";
  ingredientRows.innerHTML = "";
}
document.getElementById("btn-clear-form").addEventListener("click", clearForm);

function loadRecipeIntoForm(name) {
  const r = recipes[name];
  if (!r) return;
  document.getElementById("edit-item-name").value = name;
  document.getElementById("edit-item-icon").value = r.icon || "🟩";
  document.getElementById("edit-item-note").value = r.note || "";
  ingredientRows.innerHTML = "";
  (r.ingredients || []).forEach(ing => addIngredientRow(ing.name, ing.qty));
  editorPanel.classList.add("open");
  editorPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

document.getElementById("btn-save-recipe").addEventListener("click", () => {
  const name = document.getElementById("edit-item-name").value.trim();
  const icon = document.getElementById("edit-item-icon").value.trim() || "🌱";
  const note = document.getElementById("edit-item-note").value.trim();
  if (!name) { alert("Isi nama item dulu ya."); return; }

  const ingredients = [];
  ingredientRows.querySelectorAll(".ingredient-row").forEach(row => {
    const iName = row.querySelector('[name="ing-name"]').value.trim();
    const iQty = Math.max(1, parseInt(row.querySelector('[name="ing-qty"]').value) || 1);
    if (iName) ingredients.push({ name: iName, qty: iQty });
  });

  if (wouldCreateCycle(name, ingredients.map(i => i.name))) {
    alert(`Gak bisa disimpan: "${name}" gak boleh butuh dirinya sendiri (langsung atau lewat item lain), nanti tree-nya muter terus.`);
    return;
  }

  recipes[name] = { icon, ingredients, note };
  saveRecipes();
  refreshRecipeSelect();
  refreshRecipeListButtons();
  recipeSelect.value = name;
  renderTree();
  alert(`Resep "${name}" disimpan!`);
});

document.getElementById("btn-delete-recipe").addEventListener("click", () => {
  const name = document.getElementById("edit-item-name").value.trim();
  if (!name || !recipes[name]) { alert("Item ini belum ada di daftar resep."); return; }
  if (!confirm(`Hapus resep "${name}"?`)) return;
  delete recipes[name];
  saveRecipes();
  refreshRecipeSelect();
  refreshRecipeListButtons();
  clearForm();
  treeOutput.innerHTML = "";
  shoppingWrap.style.display = "none";
});

refreshRecipeSelect();
refreshRecipeListButtons();
if (recipeSelect.options.length > 0) {
  recipeSelect.value = Object.keys(recipes).sort()[0];
  renderTree();
}
