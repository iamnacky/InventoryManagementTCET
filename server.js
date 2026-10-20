const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');

const dataFile = path.join(__dirname, 'data', 'inventory.json');

const starterData = {
    products: [
        { id: 101, name: 'Notebook', category: 'Stationery', price: 50, quantity: 20 },
        { id: 102, name: 'Keyboard', category: 'Electronics', price: 700, quantity: 10 }
    ],
    categories: ['Stationery', 'Electronics', 'Other']
};

class AppError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

function checkObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new AppError(400, 'Request body must be a JSON object.');
    }
}

function checkId(id) {
    if (!Number.isInteger(id) || id < 1) {
        throw new AppError(400, 'Product ID must be a positive integer.');
    }
}

function checkText(value, label) {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new AppError(400, `${label} must not be blank.`);
    }
    return value.trim();
}

function checkPrice(value) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        throw new AppError(400, 'Price must be a non-negative number.');
    }
    return value;
}

function checkQuantity(value, label = 'Quantity') {
    if (!Number.isInteger(value) || value < 0) {
        throw new AppError(400, `${label} must be a non-negative integer.`);
    }
    return value;
}

async function saveData(filePath, data) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function createInventoryStore(filePath = dataFile) {
    let data;
    let loading;

    async function getData() {
        if (data) return data;
        if (!loading) {
            loading = fs.readFile(filePath, 'utf8')
                .then((text) => JSON.parse(text))
                .catch(async (error) => {
                    if (error.code !== 'ENOENT') throw error;
                    data = JSON.parse(JSON.stringify(starterData));
                    await saveData(filePath, data);
                    return data;
                });
        }
        data = await loading;
        return data;
    }

    async function changeData(change) {
        const current = await getData();
        const result = await change(current);
        await saveData(filePath, current);
        return result;
    }

    return {
        async getProducts() {
            return (await getData()).products;
        },

        async getCategories() {
            return (await getData()).categories;
        },

        async createCategory(input) {
            return changeData((current) => {
                checkObject(input);
                const name = checkText(input.name, 'Category');
                const exists = current.categories.some((category) =>
                    category.toLowerCase() === name.toLowerCase());
                if (exists) throw new AppError(409, 'Category already exists.');
                current.categories.push(name);
                return name;
            });
        },

        async createProduct(input) {
            return changeData((current) => {
                checkObject(input);
                checkId(input.id);
                if (current.products.some((product) => product.id === input.id)) {
                    throw new AppError(409, 'Product ID already exists.');
                }

                const product = {
                    id: input.id,
                    name: checkText(input.name, 'Product name'),
                    category: checkText(input.category, 'Category'),
                    price: checkPrice(input.price),
                    quantity: checkQuantity(input.quantity)
                };

                if (!current.categories.includes(product.category)) {
                    throw new AppError(400, 'Category does not exist.');
                }
                current.products.push(product);
                return product;
            });
        },

        async updateProduct(id, input) {
            return changeData((current) => {
                checkId(id);
                checkObject(input);
                const product = current.products.find((item) => item.id === id);
                if (!product) throw new AppError(404, 'Product not found.');

                const nextProduct = { ...product };
                if ('name' in input) nextProduct.name = checkText(input.name, 'Product name');
                if ('category' in input) {
                    nextProduct.category = checkText(input.category, 'Category');
                    if (!current.categories.includes(nextProduct.category)) {
                        throw new AppError(400, 'Category does not exist.');
                    }
                }
                if ('price' in input) nextProduct.price = checkPrice(input.price);
                if ('quantity' in input) nextProduct.quantity = checkQuantity(input.quantity);
                Object.assign(product, nextProduct);
                return product;
            });
        },

        async deleteProduct(id) {
            return changeData((current) => {
                checkId(id);
                const index = current.products.findIndex((product) => product.id === id);
                if (index === -1) throw new AppError(404, 'Product not found.');
                return current.products.splice(index, 1)[0];
            });
        },

        async purchaseProduct(id, quantity) {
            return changeData((current) => {
                checkId(id);
                if (!Number.isInteger(quantity) || quantity < 1) {
                    throw new AppError(400, 'Purchase quantity must be a positive integer.');
                }
                const product = current.products.find((item) => item.id === id);
                if (!product) throw new AppError(404, 'Product not found.');
                if (quantity > product.quantity) throw new AppError(409, 'Insufficient stock.');
                product.quantity -= quantity;
                return product;
            });
        }
    };
}

function sendJson(response, status, value) {
    const body = JSON.stringify(value);
    response.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body)
    });
    response.end(body);
}

function sendError(response, error) {
    const status = error instanceof AppError ? error.status : 500;
    const message = status === 500 ? 'Internal server error.' : error.message;
    sendJson(response, status, { error: message });
}

function readBody(request) {
    return new Promise((resolve, reject) => {
        let text = '';
        request.setEncoding('utf8');
        request.on('data', (part) => { text += part; });
        request.on('end', () => {
            try {
                resolve(JSON.parse(text));
            } catch {
                reject(new AppError(400, 'Request body must be valid JSON.'));
            }
        });
        request.on('error', reject);
    });
}

function productId(value) {
    const id = Number(value);
    if (!/^\d+$/.test(value)) throw new AppError(400, 'Product ID must be a positive integer.');
    checkId(id);
    return id;
}

function createServer(options = {}) {
    const store = options.store || createInventoryStore(options.filePath);
    const publicDir = options.publicDir || __dirname;
    const files = {
        '/': ['index.html', 'text/html; charset=utf-8'],
        '/index.html': ['index.html', 'text/html; charset=utf-8'],
        '/script.js': ['script.js', 'application/javascript; charset=utf-8'],
        '/style.css': ['style.css', 'text/css; charset=utf-8']
    };

    return http.createServer(async (request, response) => {
        try {
            const url = new URL(request.url, 'http://localhost');
            const pathname = url.pathname;

            if (pathname === '/api/products' && request.method === 'GET') {
                sendJson(response, 200, await store.getProducts());
                return;
            }
            if (pathname === '/api/categories' && request.method === 'GET') {
                sendJson(response, 200, await store.getCategories());
                return;
            }
            if (pathname === '/api/products' && request.method === 'POST') {
                sendJson(response, 201, await store.createProduct(await readBody(request)));
                return;
            }
            if (pathname === '/api/categories' && request.method === 'POST') {
                const name = await store.createCategory(await readBody(request));
                sendJson(response, 201, { name });
                return;
            }

            const purchase = pathname.match(/^\/api\/products\/([^/]+)\/purchase$/);
            if (purchase) {
                if (request.method !== 'POST') {
                    sendJson(response, 405, { error: 'Method not allowed.' });
                    return;
                }
                const body = await readBody(request);
                checkObject(body);
                sendJson(response, 200, await store.purchaseProduct(productId(purchase[1]), body.quantity));
                return;
            }

            const product = pathname.match(/^\/api\/products\/([^/]+)$/);
            if (product) {
                const id = productId(product[1]);
                if (request.method === 'PUT') {
                    sendJson(response, 200, await store.updateProduct(id, await readBody(request)));
                } else if (request.method === 'DELETE') {
                    sendJson(response, 200, await store.deleteProduct(id));
                } else {
                    sendJson(response, 405, { error: 'Method not allowed.' });
                }
                return;
            }

            if (files[pathname]) {
                if (request.method !== 'GET') {
                    sendJson(response, 405, { error: 'Method not allowed.' });
                    return;
                }
                const [fileName, contentType] = files[pathname];
                const content = await fs.readFile(path.join(publicDir, fileName));
                response.writeHead(200, { 'Content-Type': contentType });
                response.end(content);
                return;
            }

            sendJson(response, 404, { error: 'Not found.' });
        } catch (error) {
            sendError(response, error);
        }
    });
}

if (require.main === module) {
    const port = Number(process.env.PORT) || 3000;
    createServer().listen(port, () => {
        console.log(`Inventory app is running at http://localhost:${port}`);
    });
}

module.exports = { createInventoryStore, createServer, AppError };
