const express = require('express');
const cors    = require('cors');
const db      = require('./db');

const app  = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// ══════════════════════════════════════════════
// TEST ROUTE
// ══════════════════════════════════════════════
app.get('/', (req, res) => {
    res.json({ 
        success: true, 
        message: 'Node.js API System 3 is running!',
        version: '2.0',
        endpoints: [
            'GET  /api/products',
            'GET  /api/products/:id/stock',
            'POST /api/products/deduct',
            'GET  /api/patients',
            'GET  /api/patients/:id',
            'GET  /api/users',
            'GET  /api/categories',
            'GET  /api/orders',
            'GET  /api/treatments'
        ]
    });
});

// ══════════════════════════════════════════════
// PRODUCTS
// ══════════════════════════════════════════════
app.get('/api/products', async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT id, name, description, price, stock FROM products'
        );
        res.json({ success: true, products: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.get('/api/products/:id/stock', async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT id, name, stock FROM products WHERE id = ?',
            [req.params.id]
        );
        if (rows.length === 0)
            return res.json({ success: false, message: 'Product not found' });

        const p = rows[0];
        res.json({
            success:    true,
            product_id: p.id,
            name:       p.name,
            stock:      p.stock,
            available:  p.stock > 0
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/products/deduct', async (req, res) => {
    const { product_id, quantity, staff_id = 1 } = req.body;

    if (!product_id || !quantity || quantity <= 0)
        return res.json({ success: false, message: 'Invalid product_id or quantity' });

    try {
        const [rows] = await db.query(
            'SELECT id, name, price, stock FROM products WHERE id = ?',
            [product_id]
        );
        if (rows.length === 0)
            return res.json({ success: false, message: 'Product not found' });

        const product = rows[0];

        if (product.stock < quantity)
            return res.json({
                success:       false,
                message:       'Insufficient stock',
                current_stock: product.stock,
                requested:     quantity
            });

        await db.query(
            'UPDATE products SET stock = stock - ? WHERE id = ?',
            [quantity, product_id]
        );

        const total = product.price * quantity;
        const [order] = await db.query(
            'INSERT INTO orders (product_id, quantity, total_amount, staff_id, order_date) VALUES (?, ?, ?, ?, NOW())',
            [product_id, quantity, total, staff_id]
        );

        res.json({
            success:         true,
            message:         'Stock deducted successfully',
            order_id:        order.insertId,
            product:         product.name,
            deducted:        quantity,
            remaining_stock: product.stock - quantity,
            total_amount:    total
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ══════════════════════════════════════════════
// PATIENTS
// ══════════════════════════════════════════════
app.get('/api/patients', async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT id, studentid, firstname, lastname, course, age, sex FROM patient'
        );
        res.json({ success: true, patients: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.get('/api/patients/:id', async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT * FROM patient WHERE id = ?',
            [req.params.id]
        );
        if (rows.length === 0)
            return res.json({ success: false, message: 'Patient not found' });
        res.json({ success: true, patient: rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ══════════════════════════════════════════════
// USERS (clinic login)
// ══════════════════════════════════════════════
app.get('/api/users', async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT id, firstname, lastname, username FROM user'
        );
        res.json({ success: true, users: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/users/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const [rows] = await db.query(
            'SELECT id, firstname, lastname, username FROM user WHERE username = ? AND password = ?',
            [username, password]
        );
        if (rows.length === 0)
            return res.json({ success: false, message: 'Invalid credentials' });
        res.json({ success: true, user: rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ══════════════════════════════════════════════
// CATEGORIES
// ══════════════════════════════════════════════
app.get('/api/categories', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM category');
        res.json({ success: true, categories: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ══════════════════════════════════════════════
// ORDERS
// ══════════════════════════════════════════════
app.get('/api/orders', async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT o.id, o.order_date, o.total_amount, o.order_type,
                    s.full_name as staff_name
             FROM orders o
             LEFT JOIN staff s ON o.staff_id = s.id
             ORDER BY o.order_date DESC`
        );
        res.json({ success: true, orders: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ══════════════════════════════════════════════
// TREATMENTS
// ══════════════════════════════════════════════
app.get('/api/treatments', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM treatment');
        res.json({ success: true, treatments: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ══════════════════════════════════════════════
// DIAGNOSIS (dctd)
// ══════════════════════════════════════════════
app.get('/api/diagnosis', async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT d.id, d.date, d.complaints, d.category, 
                    d.treatment, d.doctor,
                    p.firstname, p.lastname, p.studentid
             FROM dctd d
             LEFT JOIN patient p ON d.id = p.id`
        );
        res.json({ success: true, diagnosis: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ══════════════════════════════════════════════
// START SERVER
// ══════════════════════════════════════════════
app.listen(PORT, () => {
    console.log(`✅ Node.js API System 3 running at http://localhost:${PORT}`);
    console.log(`   Products : http://localhost:${PORT}/api/products`);
    console.log(`   Patients : http://localhost:${PORT}/api/patients`);
    console.log(`   Users    : http://localhost:${PORT}/api/users`);
    console.log(`   Orders   : http://localhost:${PORT}/api/orders`);
});