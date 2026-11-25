(() => {
  "use strict";

  const STORAGE_KEY = "meal_planner_v1";

  const MEALS = [
    { key: "breakfast", label: "Завтрак" },
    { key: "lunch", label: "Обед" },
    { key: "dinner", label: "Ужин" }
  ];

  const DAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

  const MEAL_ORDER = { breakfast: 0, lunch: 1, dinner: 2 };

  const SEED_DISHES = [
    { name: "Овсяная каша", type: "breakfast", ingredients: ["овсянка", "молоко", "банан", "мёд"] },
    { name: "Омлет", type: "breakfast", ingredients: ["яйца", "молоко", "сыр"] },
    { name: "Сырники", type: "breakfast", ingredients: ["творог", "яйца", "мука"] },
    { name: "Куриный суп", type: "lunch", ingredients: ["курица", "картофель", "морковь"] },
    { name: "Гречка с котлетой", type: "lunch", ingredients: ["гречка", "фарш", "лук"] },
    { name: "Паста", type: "lunch", ingredients: ["паста", "томаты", "сыр"] },
    { name: "Салат", type: "dinner", ingredients: ["огурцы", "помидоры", "лук"] },
    { name: "Рыба", type: "dinner", ingredients: ["рыба", "лимон", "картофель"] },
    { name: "Плов", type: "dinner", ingredients: ["рис", "курица", "морковь"] }
  ];

  const state = {
    dishes: [],
    menu: {}
  };

  let editingDishId = null;
  let messageTimer = null;
  let modalResolve = null;

  const els = {
    statDishes: document.getElementById("statDishes"),
    statMeals: document.getElementById("statMeals"),
    statItems: document.getElementById("statItems"),
    dishForm: document.getElementById("dishForm"),
    dishName: document.getElementById("dishName"),
    dishType: document.getElementById("dishType"),
    dishIngredients: document.getElementById("dishIngredients"),
    formHint: document.getElementById("formHint"),
    submitBtn: document.getElementById("submitBtn"),
    cancelBtn: document.getElementById("cancelBtn"),
    dishList: document.getElementById("dishList"),
    randomBtn: document.getElementById("randomBtn"),
    clearBtn: document.getElementById("clearBtn"),
    message: document.getElementById("message"),
    menuGrid: document.getElementById("menuGrid"),
    shoppingCount: document.getElementById("shoppingCount"),
    shoppingList: document.getElementById("shoppingList"),
    modal: document.getElementById("modal"),
    modalTitle: document.getElementById("modalTitle"),
    modalText: document.getElementById("modalText"),
    modalCancel: document.getElementById("modalCancel"),
    modalConfirm: document.getElementById("modalConfirm")
  };

  function createId() {
    return "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => {
      const map = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      };
      return map[char];
    });
  }

  function mealLabel(key) {
    const meal = MEALS.find((item) => item.key === key);
    return meal ? meal.label : key;
  }

  function parseIngredients(raw) {
    const seen = new Set();

    return raw
      .split(/[,;\n]/)
      .map((item) => item.trim())
      .filter(Boolean)
      .filter((item) => {
        const key = item.toLowerCase();

        if (seen.has(key)) {
          return false;
        }

        seen.add(key);
        return true;
      });
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.warn("Не удалось сохранить данные", error);
    }
  }

  function load() {
    let raw = null;

    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch (error) {
      console.warn("localStorage недоступен", error);
    }

    if (raw === null) {
      state.dishes = SEED_DISHES.map((dish) => ({
        id: createId(),
        name: dish.name,
        type: dish.type,
        ingredients: dish.ingredients.slice()
      }));

      save();
      return;
    }

    try {
      const data = JSON.parse(raw);

      if (data && Array.isArray(data.dishes)) {
        state.dishes = data.dishes
          .filter((dish) => dish && typeof dish.id === "string" && typeof dish.name === "string")
          .map((dish) => ({
            id: dish.id,
            name: String(dish.name),
            type: MEALS.some((meal) => meal.key === dish.type) ? dish.type : "breakfast",
            ingredients: Array.isArray(dish.ingredients) ? dish.ingredients.map(String) : []
          }));
      }

      if (data && data.menu && typeof data.menu === "object") {
        state.menu = data.menu;
      }
    } catch (error) {
      console.warn("Повреждённые данные, начинаем заново", error);
    }
  }

  function confirmDialog(options) {
    return new Promise((resolve) => {
      modalResolve = resolve;
      els.modalTitle.textContent = options.title;
      els.modalText.textContent = options.text;
      els.modalConfirm.textContent = options.confirmLabel || "Удалить";
      els.modal.hidden = false;
      els.modalConfirm.focus();
    });
  }

  function closeModal(result) {
    if (els.modal.hidden) {
      return;
    }

    els.modal.hidden = true;

    const resolve = modalResolve;
    modalResolve = null;

    if (resolve) {
      resolve(result);
    }
  }

  els.modalCancel.addEventListener("click", () => closeModal(false));
  els.modalConfirm.addEventListener("click", () => closeModal(true));

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !els.modal.hidden) {
      closeModal(false);
    }
  });

  function updateStats() {
    els.statDishes.textContent = state.dishes.length;
    els.statMeals.textContent = Object.keys(state.menu).length;
    els.statItems.textContent = collectShoppingItems().length;
  }

  function renderDishes() {
    els.dishList.innerHTML = "";

    if (state.dishes.length === 0) {
      els.dishList.innerHTML = "<p>Каталог пуст</p>";
      updateStats();
      return;
    }

    const sorted = state.dishes.slice().sort((a, b) => {
      const orderA = MEAL_ORDER[a.type] !== undefined ? MEAL_ORDER[a.type] : 9;
      const orderB = MEAL_ORDER[b.type] !== undefined ? MEAL_ORDER[b.type] : 9;
      return orderA - orderB || a.name.localeCompare(b.name, "ru");
    });

    sorted.forEach((dish) => {
      const card = document.createElement("div");
      card.className = "dish";

      const ingredientsText = dish.ingredients.length
        ? dish.ingredients.map(escapeHtml).join(", ")
        : "<i>без ингредиентов</i>";

      card.innerHTML =
        "<p>" +
          "[" + escapeHtml(mealLabel(dish.type)) + "] " +
          "<b>" + escapeHtml(dish.name) + "</b> " +
          "<button type=\"button\" data-action=\"edit\" data-id=\"" + dish.id + "\">Редактировать</button> " +
          "<button type=\"button\" data-action=\"delete\" data-id=\"" + dish.id + "\">Удалить</button>" +
        "</p>" +
        "<p>" + ingredientsText + "</p>";

      els.dishList.appendChild(card);
    });

    updateStats();
  }

  function renderMenu() {
    els.menuGrid.innerHTML = "";

    const table = document.createElement("table");
    table.border = "1";

    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");

    headRow.appendChild(createCell("th", ""));
    MEALS.forEach((meal) => headRow.appendChild(createCell("th", meal.label)));

    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");

    DAYS.forEach((day, dayIndex) => {
      const row = document.createElement("tr");
      row.appendChild(createCell("th", day));

      MEALS.forEach((meal) => {
        const cellKey = dayIndex + "-" + meal.key;
        const td = document.createElement("td");

        const select = document.createElement("select");
        select.dataset.cell = cellKey;

        const emptyOption = document.createElement("option");
        emptyOption.value = "";
        emptyOption.textContent = "—";
        select.appendChild(emptyOption);

        const pool = state.dishes
          .filter((dish) => dish.type === meal.key)
          .sort((a, b) => a.name.localeCompare(b.name, "ru"));

        pool.forEach((dish) => {
          const option = document.createElement("option");
          option.value = dish.id;
          option.textContent = dish.name;
          select.appendChild(option);
        });

        const current = state.menu[cellKey];

        if (current && pool.some((dish) => dish.id === current)) {
          select.value = current;
        } else {
          select.value = "";

          if (current) {
            delete state.menu[cellKey];
          }
        }

        td.appendChild(select);
        row.appendChild(td);
      });

      tbody.appendChild(row);
    });

    table.appendChild(tbody);
    els.menuGrid.appendChild(table);

    updateStats();
  }

  function createCell(tag, text) {
    const el = document.createElement(tag);
    el.textContent = text;
    return el;
  }

  function collectShoppingItems() {
    const map = new Map();

    Object.keys(state.menu).forEach((cellKey) => {
      const dish = state.dishes.find((item) => item.id === state.menu[cellKey]);

      if (!dish) {
        return;
      }

      dish.ingredients.forEach((ingredient) => {
        const key = ingredient.toLowerCase();
        const existing = map.get(key);

        if (existing) {
          existing.count += 1;
        } else {
          map.set(key, { name: ingredient, count: 1 });
        }
      });
    });

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }

  function renderShopping() {
    const items = collectShoppingItems();
    els.shoppingList.innerHTML = "";
    els.shoppingCount.textContent = items.length;

    if (items.length === 0) {
      els.shoppingList.innerHTML = "<li>Список пуст</li>";
    } else {
      items.forEach((item) => {
        const li = document.createElement("li");
        li.innerHTML =
          escapeHtml(item.name) + " — × " + item.count;
        els.shoppingList.appendChild(li);
      });
    }

    updateStats();
  }

  function renderAll() {
    renderDishes();
    renderMenu();
    renderShopping();
    updateStats();
  }

  function showFormHint(text) {
    els.formHint.textContent = text;
    els.formHint.hidden = false;
  }

  function hideFormHint() {
    els.formHint.hidden = true;
    els.formHint.textContent = "";
  }

  function resetForm() {
    editingDishId = null;
    els.dishName.value = "";
    els.dishIngredients.value = "";
    els.submitBtn.textContent = "Добавить";
    els.cancelBtn.hidden = true;
    hideFormHint();
  }

  function startEditing(id) {
    const dish = state.dishes.find((item) => item.id === id);

    if (!dish) {
      return;
    }

    editingDishId = id;
    els.dishName.value = dish.name;
    els.dishType.value = dish.type;
    els.dishIngredients.value = dish.ingredients.join(", ");
    els.submitBtn.textContent = "Сохранить";
    els.cancelBtn.hidden = false;
    hideFormHint();
    els.dishName.focus();
  }

  els.dishForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const name = els.dishName.value.trim();

    if (!name) {
      showFormHint("Введите название блюда");
      els.dishName.focus();
      return;
    }

    const type = els.dishType.value;
    const ingredients = parseIngredients(els.dishIngredients.value);

    if (editingDishId) {
      const dish = state.dishes.find((item) => item.id === editingDishId);

      if (dish) {
        dish.name = name;
        dish.type = type;
        dish.ingredients = ingredients;
        cleanupMenu();
      }

      resetForm();
    } else {
      state.dishes.push({
        id: createId(),
        name: name,
        type: type,
        ingredients: ingredients
      });

      resetForm();
    }

    save();
    renderAll();
    els.dishName.focus();
  });

  els.cancelBtn.addEventListener("click", resetForm);

  els.dishList.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");

    if (!button) {
      return;
    }

    const id = button.dataset.id;

    if (button.dataset.action === "edit") {
      startEditing(id);
    } else if (button.dataset.action === "delete") {
      await deleteDish(id);
    }
  });

  async function deleteDish(id) {
    const dish = state.dishes.find((item) => item.id === id);

    if (!dish) {
      return;
    }

    const assignedCount = Object.values(state.menu).filter((value) => value === id).length;

    const text = assignedCount > 0
      ? "Блюдо «" + dish.name + "» назначено в меню " + assignedCount + " раз(а). Оно будет убрано из меню."
      : "Блюдо «" + dish.name + "» будет удалено из каталога.";

    const confirmed = await confirmDialog({ title: "Удалить блюдо?", text: text });

    if (!confirmed) {
      return;
    }

    state.dishes = state.dishes.filter((item) => item.id !== id);

    Object.keys(state.menu).forEach((key) => {
      if (state.menu[key] === id) {
        delete state.menu[key];
      }
    });

    if (editingDishId === id) {
      resetForm();
    }

    save();
    renderAll();
  }

  function cleanupMenu() {
    Object.keys(state.menu).forEach((key) => {
      const mealType = key.split("-")[1];
      const dish = state.dishes.find((item) => item.id === state.menu[key]);

      if (!dish || dish.type !== mealType) {
        delete state.menu[key];
      }
    });
  }

  els.menuGrid.addEventListener("change", (event) => {
    const select = event.target.closest("select[data-cell]");

    if (!select) {
      return;
    }

    const key = select.dataset.cell;

    if (select.value) {
      state.menu[key] = select.value;
    } else {
      delete state.menu[key];
    }

    save();
    renderShopping();
  });

  function showMessage(text, type) {
    els.message.textContent = text;
    els.message.hidden = false;

    clearTimeout(messageTimer);
    messageTimer = setTimeout(() => {
      els.message.hidden = true;
    }, 8000);
  }

  els.randomBtn.addEventListener("click", () => {
    if (state.dishes.length < 7) {
      showMessage(
        "В каталоге " + state.dishes.length + " блюд(а) — меньше 7. Добавьте больше блюд.",
        "warn"
      );
      return;
    }

    const byType = { breakfast: [], lunch: [], dinner: [] };

    state.dishes.forEach((dish) => {
      if (byType[dish.type]) {
        byType[dish.type].push(dish);
      }
    });

    const menu = {};
    let emptyCells = 0;

    DAYS.forEach((day, dayIndex) => {
      MEALS.forEach((meal) => {
        const pool = byType[meal.key];

        if (pool.length === 0) {
          emptyCells += 1;
          return;
        }

        menu[dayIndex + "-" + meal.key] = pool[Math.floor(Math.random() * pool.length)].id;
      });
    });

    state.menu = menu;
    save();
    renderMenu();
    renderShopping();

    if (emptyCells > 0) {
      showMessage(
        "Меню сформировано, но " + emptyCells + " ячеек остались пустыми.",
        "warn"
      );
    } else {
      showMessage("Случайное меню готово.", "ok");
    }
  });

  els.clearBtn.addEventListener("click", async () => {
    if (Object.keys(state.menu).length === 0) {
      showMessage("Меню уже пустое.", "warn");
      return;
    }

    const confirmed = await confirmDialog({
      title: "Очистить меню?",
      text: "Все блюда будут убраны из сетки недели.",
      confirmLabel: "Очистить"
    });

    if (!confirmed) {
      return;
    }

    state.menu = {};
    save();
    renderMenu();
    renderShopping();
    showMessage("Меню очищено.", "ok");
  });

  load();
  cleanupMenu();
  renderAll();
})();