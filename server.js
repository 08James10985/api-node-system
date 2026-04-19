const express = require('express');
const cors    = require('cors');
const db      = require('./db');

const app  = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// ── TEST ROUTE ─────────────────────────────────────────
app.get('/', (req, res) => {
    res.json({ 
        success: true, 
        message: 'Node.js API System 3 is running!',
        version: '2.0'
    });
});

// ── GET ALL PRODUCTS ───────────────────────────────────
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

// ── CHECK STOCK ────────────────────────────────────────
app.get('/api/products/:id/stock', async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT id, name, stock FROM products WHERE id = ?',
            [req.params.id]
        );
        if (rows.length === 0)
            return res.json({ success: false, message: 'Product not found' });

        const product = rows[0];
        res.json({
            success:    true,
            product_id: product.id,
            name:       product.name,
            stock:      product.stock,
            available:  product.stock > 0
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── DEDUCT STOCK ───────────────────────────────────────
app.post('/api/products/deduct', async (req, res) => {
    const { product_id, quantity, staff_id = 1 } = req.body;

    if (!product_id || !quantity || quantity <= 0)
        return res.json({ success: false, message: 'Invalid product_id or quantity' });

    try {
        // Check stock
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

        // Deduct stock
        await db.query(
            'UPDATE products SET stock = stock - ? WHERE id = ?',
            [quantity, product_id]
        );

        // Create order
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

// ── START SERVER ───────────────────────────────────────
app.listen(PORT, () => {
    console.log(`✅ Node.js API running at http://localhost:${PORT}`);
    console.log(`   Test: http://localhost:${PORT}/api/products`);
});