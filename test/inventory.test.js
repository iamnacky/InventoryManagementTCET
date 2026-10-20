'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { afterEach, beforeEach, test } = require('node:test');

const { createServer } = require('../server');

let temporaryDirectory;
let server;
let baseUrl;

function requestJson(route, options = {}) {
    return new Promise((resolve, reject) => {
        const body = options.body === undefined ? undefined : JSON.stringify(options.body);
        const request = http.request(`${baseUrl}${route}`, {
            method: options.method || 'GET',
            headers: body === undefined
                ? undefined
                : {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(body)
                }
        }, (response) => {
            let responseBody = '';
            response.setEncoding('utf8');
            response.on('data', (chunk) => { responseBody += chunk; });
            response.on('end', () => {
                let parsed;
                try {
                    parsed = responseBody ? JSON.parse(responseBody) : null;
                } catch (error) {
                    reject(error);
                    return;
                }
                resolve({ status: response.statusCode, body: parsed });
            });
        });
        request.on('error', reject);
        if (body !== undefined) request.write(body);
        request.end();
    });
}

beforeEach(async () => {
    temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'inventory-test-'));
    server = createServer({ filePath: path.join(temporaryDirectory, 'inventory.json') });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    baseUrl = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
});

test('creates and reads categories', async () => {
    const initial = await requestJson('/api/categories');
    assert.deepEqual(initial.body, ['Stationery', 'Electronics', 'Other']);

    const created = await requestJson('/api/categories', {
        method: 'POST',
        body: { name: 'Hardware' }
    });
    assert.equal(created.status, 201);
    assert.deepEqual(created.body, { name: 'Hardware' });

    const categories = await requestJson('/api/categories');
    assert.ok(categories.body.includes('Hardware'));
});

test('creates a product and reads it back', async () => {
    const created = await requestJson('/api/products', {
        method: 'POST',
        body: { id: 103, name: 'Pen', category: 'Stationery', price: 15, quantity: 25 }
    });
    assert.equal(created.status, 201);
    assert.deepEqual(created.body, {
        id: 103, name: 'Pen', category: 'Stationery', price: 15, quantity: 25
    });

    const products = await requestJson('/api/products');
    assert.ok(products.body.some((product) => product.id === 103 && product.quantity === 25));
});

test('purchases reduce stock and persist the change', async () => {
    const purchased = await requestJson('/api/products/101/purchase', {
        method: 'POST',
        body: { quantity: 3 }
    });
    assert.equal(purchased.status, 200);
    assert.equal(purchased.body.quantity, 17);

    const products = await requestJson('/api/products');
    assert.equal(products.body.find((product) => product.id === 101).quantity, 17);
});

test('updates and deletes a product', async () => {
    const updated = await requestJson('/api/products/102', {
        method: 'PUT',
        body: { price: 650, quantity: 8 }
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.price, 650);
    assert.equal(updated.body.quantity, 8);

    const deleted = await requestJson('/api/products/102', { method: 'DELETE' });
    assert.equal(deleted.status, 200);
    assert.equal(deleted.body.id, 102);
    assert.equal((await requestJson('/api/products')).body.some((product) => product.id === 102), false);
});

test('rejects duplicate and invalid requests', async () => {
    const duplicateProduct = await requestJson('/api/products', {
        method: 'POST',
        body: { id: 101, name: 'Another', category: 'Stationery', price: 1, quantity: 1 }
    });
    assert.equal(duplicateProduct.status, 409);

    const invalidProducts = [
        { id: 103, name: ' ', category: 'Stationery', price: 1, quantity: 1 },
        { id: 104, name: 'Valid', category: '', price: 1, quantity: 1 },
        { id: 105, name: 'Valid', category: 'Stationery', price: -1, quantity: 1 },
        { id: 106, name: 'Valid', category: 'Stationery', price: 1, quantity: -1 }
    ];
    for (const body of invalidProducts) {
        const response = await requestJson('/api/products', { method: 'POST', body });
        assert.equal(response.status, 400);
    }

    const duplicateCategory = await requestJson('/api/categories', {
        method: 'POST',
        body: { name: 'stationery' }
    });
    assert.equal(duplicateCategory.status, 409);

    const blankCategory = await requestJson('/api/categories', {
        method: 'POST',
        body: { name: '  ' }
    });
    assert.equal(blankCategory.status, 400);

    const invalidUpdate = await requestJson('/api/products/101', {
        method: 'PUT',
        body: { category: 'Missing category', price: -10 }
    });
    assert.equal(invalidUpdate.status, 400);
    const unchangedProduct = (await requestJson('/api/products')).body.find((product) => product.id === 101);
    assert.equal(unchangedProduct.category, 'Stationery');
    assert.equal(unchangedProduct.price, 50);

    const invalidPurchase = await requestJson('/api/products/101/purchase', {
        method: 'POST',
        body: { quantity: 0 }
    });
    assert.equal(invalidPurchase.status, 400);
});

test('rejects purchases larger than available stock', async () => {
    const response = await requestJson('/api/products/101/purchase', {
        method: 'POST',
        body: { quantity: 21 }
    });
    assert.equal(response.status, 409);
    assert.match(response.body.error, /insufficient stock/i);
});
