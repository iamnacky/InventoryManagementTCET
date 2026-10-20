let products = [];
let categories = [];

const form = document.getElementById("productForm");
const categoryForm = document.getElementById("categoryForm");
const table = document.getElementById("inventoryTable");
const totalValue = document.getElementById("totalValue");
const productCount = document.getElementById("productCount");
const searchInput = document.getElementById("searchInput");
const categoryFilter = document.getElementById("categoryFilter");
const productCategory = document.getElementById("productCategory");
const message = document.getElementById("message");
const categoryMessage = document.getElementById("categoryMessage");

function formatCurrency(value) {
    return "₹" + Number(value).toLocaleString("en-IN", {
        maximumFractionDigits: 2
    });
}

async function requestJson(url, options) {
    let response;

    try {
        response = await fetch(url, options);
    } catch (error) {
        throw new Error("Could not connect to the inventory server.");
    }

    let payload = null;
    try {
        payload = await response.json();
    } catch (error) {
        if (!response.ok) {
            throw new Error("The server returned an unexpected error.");
        }
    }

    if (!response.ok) {
        throw new Error(payload && payload.error ? payload.error : "The request failed.");
    }

    return payload;
}

function jsonOptions(method, body) {
    return {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
    };
}

async function loadData() {
    try {
        const results = await Promise.all([
            requestJson("/api/products"),
            requestJson("/api/categories")
        ]);

        products = Array.isArray(results[0]) ? results[0] : [];
        categories = Array.isArray(results[1]) ? results[1] : [];
        renderCategoryOptions();
        displayProducts();
        return true;
    } catch (error) {
        displayProducts();
        showMessage(error.message, true);
        return false;
    }
}

function renderCategoryOptions() {
    const selectedProductCategory = productCategory.value;
    const selectedFilter = categoryFilter.value;

    productCategory.replaceChildren();
    const productPlaceholder = document.createElement("option");
    productPlaceholder.value = "";
    productPlaceholder.textContent = "Select category";
    productPlaceholder.disabled = true;
    productCategory.appendChild(productPlaceholder);

    categoryFilter.replaceChildren();
    const filterPlaceholder = document.createElement("option");
    filterPlaceholder.value = "";
    filterPlaceholder.textContent = "All categories";
    categoryFilter.appendChild(filterPlaceholder);

    categories.forEach(function(category) {
        const productOption = document.createElement("option");
        productOption.value = category;
        productOption.textContent = category;
        productCategory.appendChild(productOption);

        const filterOption = document.createElement("option");
        filterOption.value = category;
        filterOption.textContent = category;
        categoryFilter.appendChild(filterOption);
    });

    productCategory.value = categories.includes(selectedProductCategory)
        ? selectedProductCategory
        : "";
    categoryFilter.value = categories.includes(selectedFilter)
        ? selectedFilter
        : "";
}

function filteredProducts() {
    const searchText = searchInput.value.trim().toLowerCase();
    const selectedCategory = categoryFilter.value;

    return products.filter(function(product) {
        const matchesSearch = !searchText ||
            product.name.toLowerCase().includes(searchText) ||
            String(product.id).includes(searchText);
        const matchesCategory = !selectedCategory || product.category === selectedCategory;
        return matchesSearch && matchesCategory;
    });
}

function appendCell(row, value) {
    const cell = document.createElement("td");
    cell.textContent = String(value);
    row.appendChild(cell);
    return cell;
}

function createActionButton(label, className, handler) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "action-btn " + className;
    button.textContent = label;
    button.addEventListener("click", handler);
    return button;
}

function displayProducts() {
    const visibleProducts = filteredProducts();
    table.replaceChildren();
    let total = 0;

    visibleProducts.forEach(function(product) {
        const stockValue = product.price * product.quantity;
        total += stockValue;

        const row = document.createElement("tr");
        appendCell(row, product.id);
        appendCell(row, product.name);
        appendCell(row, product.category);
        appendCell(row, formatCurrency(product.price));
        appendCell(row, product.quantity);
        appendCell(row, formatCurrency(stockValue));

        const actionsCell = document.createElement("td");
        actionsCell.appendChild(createActionButton("Purchase", "purchase-btn", function() {
            purchaseProduct(product.id);
        }));
        actionsCell.appendChild(createActionButton("Edit", "edit-btn", function() {
            editProduct(product.id);
        }));
        actionsCell.appendChild(createActionButton("Delete", "delete-btn", function() {
            deleteProduct(product.id);
        }));
        row.appendChild(actionsCell);
        table.appendChild(row);
    });

    productCount.textContent = "Products: " + visibleProducts.length;
    totalValue.textContent = "Total Stock Value: " + formatCurrency(total);
}

function showMessage(text, error) {
    message.textContent = text;
    message.className = "message " + (error ? "error" : "success");
}

function showCategoryMessage(text, error) {
    categoryMessage.textContent = text;
    categoryMessage.className = "message " + (error ? "error" : "success");
}

form.addEventListener("submit", async function(event) {
    event.preventDefault();

    const id = Number(document.getElementById("productId").value);
    const name = document.getElementById("productName").value.trim();
    const category = productCategory.value;
    const price = Number(document.getElementById("productPrice").value);
    const quantity = Number(document.getElementById("productQuantity").value);

    if (!Number.isInteger(id) || id <= 0 || !name || !category ||
        !Number.isFinite(price) || price < 0 ||
        !Number.isInteger(quantity) || quantity < 0) {
        showMessage("Enter valid product details.", true);
        return;
    }

    try {
        await requestJson("/api/products", jsonOptions("POST", {
            id,
            name,
            category,
            price,
            quantity
        }));
        form.reset();
        if (await loadData()) {
            showMessage("Product added successfully.", false);
        }
    } catch (error) {
        showMessage(error.message, true);
    }
});

categoryForm.addEventListener("submit", async function(event) {
    event.preventDefault();
    const input = document.getElementById("categoryName");
    const name = input.value.trim();

    if (!name) {
        showCategoryMessage("Enter a category name.", true);
        return;
    }

    try {
        await requestJson("/api/categories", jsonOptions("POST", { name }));
        input.value = "";
        if (await loadData()) {
            showCategoryMessage("Category added successfully.", false);
        }
    } catch (error) {
        showCategoryMessage(error.message, true);
    }
});

searchInput.addEventListener("input", displayProducts);
categoryFilter.addEventListener("change", displayProducts);

async function editProduct(id) {
    const product = products.find(function(item) {
        return item.id === id;
    });

    if (!product) return;

    const newName = prompt("Enter product name:", product.name);
    if (newName === null || newName.trim() === "") return;

    const newCategory = prompt("Enter category:", product.category);
    if (newCategory === null || newCategory.trim() === "") return;

    const newPriceText = prompt("Enter price:", product.price);
    const newQuantityText = prompt("Enter quantity:", product.quantity);
    if (newPriceText === null || newQuantityText === null) return;

    const newPrice = Number(newPriceText);
    const newQuantity = Number(newQuantityText);
    if (!Number.isFinite(newPrice) || newPrice < 0 ||
        !Number.isInteger(newQuantity) || newQuantity < 0) {
        showMessage("Invalid product details.", true);
        return;
    }

    try {
        await requestJson("/api/products/" + encodeURIComponent(id), jsonOptions("PUT", {
            name: newName.trim(),
            category: newCategory.trim(),
            price: newPrice,
            quantity: newQuantity
        }));
        if (await loadData()) {
            showMessage("Product updated successfully.", false);
        }
    } catch (error) {
        showMessage(error.message, true);
    }
}

async function deleteProduct(id) {
    const product = products.find(function(item) {
        return item.id === id;
    });

    if (!product || !confirm("Are you sure you want to delete " + product.name + "?")) {
        return;
    }

    try {
        await requestJson("/api/products/" + encodeURIComponent(id), { method: "DELETE" });
        if (await loadData()) {
            showMessage("Product deleted successfully.", false);
        }
    } catch (error) {
        showMessage(error.message, true);
    }
}

async function purchaseProduct(id) {
    const product = products.find(function(item) {
        return item.id === id;
    });

    if (!product) {
        showMessage("Product not found.", true);
        return;
    }

    const purchaseText = prompt("Enter quantity to purchase:");
    if (purchaseText === null) return;

    const purchaseQuantity = Number(purchaseText);
    if (!Number.isInteger(purchaseQuantity) || purchaseQuantity <= 0) {
        showMessage("Enter a valid quantity.", true);
        return;
    }

    try {
        await requestJson("/api/products/" + encodeURIComponent(id) + "/purchase", jsonOptions("POST", {
            quantity: purchaseQuantity
        }));
        if (await loadData()) {
            showMessage("Purchase successful. Total: " +
                formatCurrency(product.price * purchaseQuantity), false);
        }
    } catch (error) {
        showMessage(error.message, true);
    }
}

loadData();
