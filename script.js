const DEFAULT_RECIPES = {
  "Outie Block": { icon: "🟩", ingredients: [
    { name: "Pastel Aqua Block", qty: 1 },
    { name: "Bubble Wrap", qty: 1 }
  ], note: "", buyPrice: 0, sellPrice: 0 },
  "Pastel Aqua Block": { icon: "🟦", ingredients: [], note: "", buyPrice: 0, sellPrice: 0 },
  "Bubble Wrap": { icon: "🔵", ingredients: [], note: "", buyPrice: 0, sellPrice: 0 }
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

// One-time cleanup: if two items only differ by capitalization (e.g. "Hospital Bed"
// vs "Hospital bed"), that's almost always the same item saved twice by accident —
// merge them into a single entry (keeping whichever has real ingredients/data) and
// fix every recipe that referenced either casing so the tree points at one item.
function mergeCaseDuplicates() {
  const lowerMap = {};
  let changed = false;

  Object.keys(recipes).forEach(key => {
    const lower = key.toLowerCase();
    if (!(lower in lowerMap)) {
      lowerMap[lower] = key;
      return;
    }

    const keepKey = lowerMap[lower];
    const keepHasIngredients = recipes[keepKey].ingredients && recipes[keepKey].ingredients.length > 0;
    const currentHasIngredients = recipes[key].ingredients && recipes[key].ingredients.length > 0;

    // prefer whichever entry actually has ingredients/data instead of an empty auto-generated stub
    const winnerKey = (!keepHasIngredients && currentHasIngredients) ? key : keepKey;
    const loserKey = winnerKey === key ? keepKey : key;
    const winner = recipes[winnerKey];
    const loser = recipes[loserKey];

    recipes[winnerKey] = {
      icon: (winner.icon && winner.icon !== "🌱") ? winner.icon : (loser.icon || winner.icon || "🌱"),
      ingredients: (winner.ingredients && winner.ingredients.length > 0) ? winner.ingredients : (loser.ingredients || []),
      note: winner.note || loser.note || "",
      buyPrice: winner.buyPrice || loser.buyPrice || 0,
      sellPrice: winner.sellPrice || loser.sellPrice || 0
    };
    delete recipes[loserKey];
    lowerMap[lower] = winnerKey;
    changed = true;
  });

  if (changed) {
    // repoint every ingredient reference at the surviving casing
    Object.values(recipes).forEach(r => {
      if (r.ingredients) {
        r.ingredients.forEach(ing => {
          const canon = lowerMap[ing.name.toLowerCase()];
          if (canon) ing.name = canon;
        });
      }
    });
    saveRecipes();
  }
}
mergeCaseDuplicates();

// resolve a typed name to an already-existing item's exact casing (case-insensitive
// match), so re-typing "hospital bed" doesn't spawn a second, disconnected item.
function canonicalName(name) {
  const trimmed = name.trim();
  const existingKey = Object.keys(recipes).find(k => k.toLowerCase() === trimmed.toLowerCase());
  return existingKey || trimmed;
}

function formatNumber(n) {
  const num = Number(n) || 0;
  return num.toLocaleString("id-ID", { maximumFractionDigits: 2 });
}

// Whenever a recipe references ingredient names that don't exist yet in
// `recipes`, register them as bare "seed" stubs so they show up everywhere
// (dropdown, price table, edit list) even before anyone bothers to give
// them their own sub-recipe.
function registerIngredientStubs(ingredients) {
  ingredients.forEach(ing => {
    if (!recipes[ing.name]) {
      recipes[ing.name] = { icon: "🌱", ingredients: [], note: "", buyPrice: 0, sellPrice: 0 };
    }
  });
}

const recipeSelect = document.getElementById("recipe-select");
const recipeQtyInput = document.getElementById("recipe-qty");
const treeOutput = document.getElementById("tree-output");
const shoppingWrap = document.getElementById("shopping-list-wrap");
const shoppingList = document.getElementById("shopping-list");
const recipeListExisting = document.getElementById("recipe-list-existing");
const editorPanel = document.getElementById("editor-panel");
const ingredientRows = document.getElementById("ingredient-rows");
const priceTable = document.getElementById("price-table");

const profitPanel = document.getElementById("profit-panel");
const sellPriceInput = document.getElementById("sell-price-input");
const feePercentInput = document.getElementById("fee-percent-input");
const currencyUnitInput = document.getElementById("currency-unit");
const profitMissingNote = document.getElementById("profit-missing-note");

// restore global calc settings (fee % and currency label persist across items)
try {
  const savedFee = localStorage.getItem("gt_fee_percent");
  if (savedFee !== null) feePercentInput.value = savedFee;
  const savedUnit = localStorage.getItem("gt_currency_unit");
  if (savedUnit) currencyUnitInput.value = savedUnit;
} catch (e) { /* ignore */ }

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

// master editable table listing every known item (recipe or bare seed) with
// its buy / sell price. This is what makes "bahan yang belum punya resep
// sendiri" reachable and priceable, per user request.
function renderPriceTable() {
  const names = Object.keys(recipes).sort();
  priceTable.innerHTML = names.map(n => {
    const r = recipes[n];
    return `
      <div class="price-row" data-name="${n.replace(/"/g, "&quot;")}">
        <span class="price-row-name">${r.icon || "🌱"} ${n}</span>
        <label>Beli <input type="number" min="0" class="price-buy" value="${r.buyPrice || 0}"></label>
        <label>Jual <input type="number" min="0" class="price-sell" value="${r.sellPrice || 0}"></label>
      </div>
    `;
  }).join("");

  priceTable.querySelectorAll(".price-row").forEach(row => {
    const name = row.dataset.name;
    row.querySelector(".price-buy").addEventListener("input", (e) => {
      recipes[name].buyPrice = Math.max(0, parseFloat(e.target.value) || 0);
      saveRecipes();
      renderTree(); // refresh price tags on tree + modal calc, keeps this input's own focus intact
    });
    row.querySelector(".price-sell").addEventListener("input", (e) => {
      recipes[name].sellPrice = Math.max(0, parseFloat(e.target.value) || 0);
      saveRecipes();
      if (recipeSelect.value === name) {
        sellPriceInput.value = recipes[name].sellPrice;
      }
      renderTree();
    });
  });
}

function buildNode(name, qty, ancestors = []) {
  const r = recipes[name];
  const isLeaf = !r || !r.ingredients || r.ingredients.length === 0;
  const icon = r ? (r.icon || "🌱") : "🌱";
  const isCycle = ancestors.includes(name);
  const note = r && r.note ? r.note : "";
  const buyPrice = r && r.buyPrice ? r.buyPrice : 0;

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

  const priceFlag = (isLeaf && buyPrice > 0)
    ? `<span class="n-price-flag">💰 ${formatNumber(buyPrice)}</span>`
    : "";

  return `
    <div class="tree-node ${isLeaf || isCycle ? "leaf" : ""}">
      <div class="node-box" data-name="${name.replace(/"/g, "&quot;")}">
        <span class="n-icon">${icon}</span>
        <span class="n-name">${name}</span>
        <span class="n-qty">x${qty}</span>
        <span class="n-hint">${hint}</span>
        ${noteFlag}
        ${priceFlag}
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

// ----- Modal / profit calculation -----
function updateProfitCalc(target, qty, leaves) {
  if (!target || !recipes[target]) {
    profitPanel.style.display = "none";
    return;
  }

  let modal = 0;
  let missingPrice = false;
  Object.entries(leaves).forEach(([name, q]) => {
    const price = (recipes[name] && recipes[name].buyPrice) || 0;
    if (!recipes[name] || !recipes[name].buyPrice) missingPrice = true;
    modal += price * q;
  });

  const sellPrice = Math.max(0, parseFloat(sellPriceInput.value) || 0);
  const feePercent = Math.max(0, Math.min(100, parseFloat(feePercentInput.value) || 0));
  const unit = currencyUnitInput.value.trim() || "DL";

  const revenue = sellPrice * qty;
  const gross = revenue - modal;
  const feeAmount = revenue * (feePercent / 100);
  const net = gross - feeAmount;

  document.getElementById("profit-modal").textContent = `${formatNumber(modal)} ${unit}`;
  document.getElementById("profit-revenue").textContent = `${formatNumber(revenue)} ${unit}`;

  const grossEl = document.getElementById("profit-gross");
  grossEl.textContent = `${formatNumber(gross)} ${unit}`;
  grossEl.className = gross >= 0 ? "profit-positive" : "profit-negative";

  const netEl = document.getElementById("profit-net");
  netEl.textContent = `${formatNumber(net)} ${unit}`;
  netEl.className = net >= 0 ? "profit-positive" : "profit-negative";

  profitMissingNote.style.display = missingPrice ? "block" : "none";
  profitPanel.style.display = "block";

  try {
    localStorage.setItem("gt_fee_percent", feePercent);
    localStorage.setItem("gt_currency_unit", unit);
  } catch (e) { /* ignore */ }
}

function renderTree() {
  const target = recipeSelect.value;
  const qty = Math.max(1, parseInt(recipeQtyInput.value) || 1);
  if (!target || !recipes[target]) {
    treeOutput.innerHTML = "";
    shoppingWrap.style.display = "none";
    profitPanel.style.display = "none";
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

  // keep the sell-price field in sync with whatever's saved on the target item
  sellPriceInput.value = (recipes[target] && recipes[target].sellPrice) || 0;
  updateProfitCalc(target, qty, leaves);
}

document.getElementById("btn-show-tree").addEventListener("click", renderTree);
recipeSelect.addEventListener("change", renderTree);

sellPriceInput.addEventListener("input", () => {
  const target = recipeSelect.value;
  if (target && recipes[target]) {
    recipes[target].sellPrice = Math.max(0, parseFloat(sellPriceInput.value) || 0);
    saveRecipes();
  }
  const qty = Math.max(1, parseInt(recipeQtyInput.value) || 1);
  updateProfitCalc(target, qty, collectLeaves(target, qty, {}));
});

feePercentInput.addEventListener("input", () => {
  const target = recipeSelect.value;
  const qty = Math.max(1, parseInt(recipeQtyInput.value) || 1);
  updateProfitCalc(target, qty, collectLeaves(target, qty, {}));
});

currencyUnitInput.addEventListener("input", () => {
  const target = recipeSelect.value;
  const qty = Math.max(1, parseInt(recipeQtyInput.value) || 1);
  updateProfitCalc(target, qty, collectLeaves(target, qty, {}));
});

// ----- Inline node modal (click any node in the tree to add its ingredients) -----
const nodeModal = document.getElementById("node-modal");
const nodeModalTitle = document.getElementById("node-modal-title");
const nodeModalIcon = document.getElementById("node-modal-icon");
const nodeModalNote = document.getElementById("node-modal-note");
const nodeModalBuy = document.getElementById("node-modal-buy");
const nodeModalSell = document.getElementById("node-modal-sell");
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
  nodeModalBuy.value = r && r.buyPrice ? r.buyPrice : 0;
  nodeModalSell.value = r && r.sellPrice ? r.sellPrice : 0;
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
  const buyPrice = Math.max(0, parseFloat(nodeModalBuy.value) || 0);
  const sellPrice = Math.max(0, parseFloat(nodeModalSell.value) || 0);
  const ingredients = [];
  nodeIngredientRows.querySelectorAll(".ingredient-row").forEach(row => {
    const iName = canonicalName(row.querySelector('[name="ing-name"]').value.trim());
    const iQty = Math.max(1, parseInt(row.querySelector('[name="ing-qty"]').value) || 1);
    if (iName) ingredients.push({ name: iName, qty: iQty });
  });

  if (wouldCreateCycle(currentNodeName, ingredients.map(i => i.name))) {
    alert(`Gak bisa disimpan: "${currentNodeName}" gak boleh butuh dirinya sendiri (langsung atau lewat item lain), nanti tree-nya muter terus.`);
    return;
  }

  registerIngredientStubs(ingredients);
  recipes[currentNodeName] = { icon, ingredients, note, buyPrice, sellPrice };
  saveRecipes();
  refreshRecipeSelect();
  refreshRecipeListButtons();
  renderPriceTable();
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
  document.getElementById("edit-item-buy").value = 0;
  document.getElementById("edit-item-sell").value = 0;
  ingredientRows.innerHTML = "";
}
document.getElementById("btn-clear-form").addEventListener("click", clearForm);

function loadRecipeIntoForm(name) {
  const r = recipes[name];
  if (!r) return;
  document.getElementById("edit-item-name").value = name;
  document.getElementById("edit-item-icon").value = r.icon || "🟩";
  document.getElementById("edit-item-note").value = r.note || "";
  document.getElementById("edit-item-buy").value = r.buyPrice || 0;
  document.getElementById("edit-item-sell").value = r.sellPrice || 0;
  ingredientRows.innerHTML = "";
  (r.ingredients || []).forEach(ing => addIngredientRow(ing.name, ing.qty));
  editorPanel.classList.add("open");
  editorPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

document.getElementById("btn-save-recipe").addEventListener("click", () => {
  const name = canonicalName(document.getElementById("edit-item-name").value.trim());
  const icon = document.getElementById("edit-item-icon").value.trim() || "🌱";
  const note = document.getElementById("edit-item-note").value.trim();
  const buyPrice = Math.max(0, parseFloat(document.getElementById("edit-item-buy").value) || 0);
  const sellPrice = Math.max(0, parseFloat(document.getElementById("edit-item-sell").value) || 0);
  if (!name) { alert("Isi nama item dulu ya."); return; }

  const ingredients = [];
  ingredientRows.querySelectorAll(".ingredient-row").forEach(row => {
    const iName = canonicalName(row.querySelector('[name="ing-name"]').value.trim());
    const iQty = Math.max(1, parseInt(row.querySelector('[name="ing-qty"]').value) || 1);
    if (iName) ingredients.push({ name: iName, qty: iQty });
  });

  if (wouldCreateCycle(name, ingredients.map(i => i.name))) {
    alert(`Gak bisa disimpan: "${name}" gak boleh butuh dirinya sendiri (langsung atau lewat item lain), nanti tree-nya muter terus.`);
    return;
  }

  registerIngredientStubs(ingredients);
  recipes[name] = { icon, ingredients, note, buyPrice, sellPrice };
  saveRecipes();
  refreshRecipeSelect();
  refreshRecipeListButtons();
  renderPriceTable();
  recipeSelect.value = name;
  renderTree();
  alert(`Resep "${name}" disimpan!`);
});

document.getElementById("btn-delete-recipe").addEventListener("click", () => {
  const name = canonicalName(document.getElementById("edit-item-name").value.trim());
  if (!name || !recipes[name]) { alert("Item ini belum ada di daftar resep."); return; }
  if (!confirm(`Hapus resep "${name}"?`)) return;
  delete recipes[name];
  saveRecipes();
  refreshRecipeSelect();
  refreshRecipeListButtons();
  renderPriceTable();
  clearForm();
  treeOutput.innerHTML = "";
  shoppingWrap.style.display = "none";
  profitPanel.style.display = "none";
});

refreshRecipeSelect();
refreshRecipeListButtons();
renderPriceTable();
if (recipeSelect.options.length > 0) {
  recipeSelect.value = Object.keys(recipes).sort()[0];
  renderTree();
}
