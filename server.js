const express = require('express');
const cors    = require('cors');
const db      = require('./db');

const app  = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// ══════════════════════════════════════════════════════════════
// SYSTEM 3 — Node.js REST API
// Serves BOTH System 1 (PHP) and System 2 (C#)
// All database operations go through THIS API ONLY
// ══════════════════════════════════════════════════════════════

app.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'Node.js API System 3 is running!',
        version: '2.0',
        architecture: {
            system1: 'PHP (ioms_web) → calls this API',
            system2: 'C# Desktop (clinic_desktop) → calls this API',
            system3: 'Node.js API (YOU ARE HERE) → owns api_db'
        }
    });
});

// ╔══════════════════════════════════════════════════════════════╗
// ║         SYSTEM 1 (PHP) ENDPOINTS                            ║
// ║  Used by: ioms_web/api/*.php                                ║
// ║  Purpose: Inventory & Order Management                      ║
// ╚══════════════════════════════════════════════════════════════╝

// ── PRODUCTS (System 1) ────────────────────────────────────────
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
                success: false, message: 'Insufficient stock',
                current_stock: product.stock, requested: quantity
            });

        // Deduct stock
        await db.query(
            'UPDATE products SET stock = stock - ? WHERE id = ?',
            [quantity, product_id]
        );

        const total = product.price * quantity;

        // Insert into orders (no product_id column in orders table)
        const [order] = await db.query(
            'INSERT INTO orders (total_amount, staff_id, order_type) VALUES (?, ?, ?)',
            [total, staff_id, 'sale']
        );
        const order_id = order.insertId;

        // Insert order detail
        await db.query(
            'INSERT INTO orderdetail (order_id, product_id, quantity, unit_price, subtotal) VALUES (?, ?, ?, ?, ?)',
            [order_id, product_id, quantity, product.price, total]
        );

        res.json({
            success:         true,
            message:         'Stock deducted successfully',
            order_id:        order_id,
            product:         product.name,
            deducted:        quantity,
            remaining_stock: product.stock - quantity,
            total_amount:    total
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
app.get('/api/products/:id', async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT * FROM products WHERE id = ?', [req.params.id]
        );
        if (rows.length === 0)
            return res.json({ success: false, message: 'Product not found' });
        res.json({ success: true, product: rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/products', async (req, res) => {
    const { name, description, price, stock, image_path } = req.body;
    try {
        const [result] = await db.query(
            'INSERT INTO products (name, description, price, stock, image_path) VALUES (?, ?, ?, ?, ?)',
            [name, description, price, stock, image_path]
        );
        res.json({ success: true, product_id: result.insertId });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.put('/api/products/:id', async (req, res) => {
    const { name, description, price, stock, image_path } = req.body;
    try {
        await db.query(
            'UPDATE products SET name=?, description=?, price=?, stock=?, image_path=? WHERE id=?',
            [name, description, price, stock, image_path, req.params.id]
        );
        res.json({ success: true, message: 'Product updated' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.delete('/api/products/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM orderdetail WHERE product_id = ?', [req.params.id]);
        await db.query('DELETE FROM products WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'Product deleted' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── ORDERS (System 1) ──────────────────────────────────────────
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

app.get('/api/orders/:id/details', async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT od.*, p.name as product_name
             FROM orderdetail od
             JOIN products p ON od.product_id = p.id
             WHERE od.order_id = ?`,
            [req.params.id]
        );
        res.json({ success: true, details: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/orders', async (req, res) => {
    const { staff_id = 1, items, order_type = 'sale' } = req.body;
    try {
        let total = 0;
        items.forEach(item => total += item.subtotal);
        const [order] = await db.query(
            'INSERT INTO orders (total_amount, staff_id, order_type) VALUES (?, ?, ?)',
            [total, staff_id, order_type]
        );
        const order_id = order.insertId;
        for (const item of items) {
            await db.query(
                'INSERT INTO orderdetail (order_id, product_id, quantity, unit_price, subtotal) VALUES (?, ?, ?, ?, ?)',
                [order_id, item.product_id, item.quantity, item.unit_price, item.subtotal]
            );
            if (order_type === 'sale') {
                await db.query('UPDATE products SET stock = stock - ? WHERE id = ?',
                    [item.quantity, item.product_id]);
            } else {
                await db.query('UPDATE products SET stock = stock + ? WHERE id = ?',
                    [item.quantity, item.product_id]);
            }
        }
        res.json({ success: true, order_id });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── STAFF LOGIN (System 1 - PHP) ───────────────────────────────
app.post('/api/staff/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const [rows] = await db.query(
            'SELECT id, username, full_name, password FROM staff WHERE username = ?',
            [username]
        );
        if (rows.length === 0)
            return res.json({ success: false, message: 'Invalid credentials' });
        const staff = rows[0];
        let valid = false;
        try {
            const bcrypt = require('bcryptjs');
            valid = await bcrypt.compare(password, staff.password);
        } catch (e) {
            valid = (password === staff.password);
        }
        if (!valid)
            return res.json({ success: false, message: 'Invalid credentials' });
        res.json({
            success: true,
            staff: { id: staff.id, username: staff.username, full_name: staff.full_name }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.get('/api/staff/test', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT id, username, full_name FROM staff');
        res.json({ success: true, staff: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ╔══════════════════════════════════════════════════════════════╗
// ║         SYSTEM 2 (C#) ENDPOINTS                             ║
// ║  Used by: NU_Clinic Windows Forms App                       ║
// ║  Purpose: Clinic Management (Patients, Diagnosis, Users)    ║
// ╚══════════════════════════════════════════════════════════════╝

// ── PATIENTS (System 2) ────────────────────────────────────────
app.get('/api/patients', async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT id, studentid, firstname, lastname, telno, course, age, sex FROM patient'
        );
        res.json({ success: true, patients: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.get('/api/patients/search', async (req, res) => {
    const { keyword } = req.query;
    try {
        const [rows] = await db.query(
            `SELECT id, studentid, firstname, lastname, telno, age, sex, course
             FROM patient
             WHERE firstname = ? OR lastname  = ?
             OR studentid   = ? OR course    = ?
             OR sex         = ? OR id        = ?`,
            [keyword, keyword, keyword, keyword, keyword, keyword]
        );
        res.json({ success: true, patients: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.get('/api/patients/by-course', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM patient_by_course');
        res.json({ success: true, courses: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.get('/api/patients/:id', async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT * FROM patient WHERE id = ?', [req.params.id]
        );
        if (rows.length === 0)
            return res.json({ success: false, message: 'Patient not found' });
        res.json({ success: true, patient: rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/patients', async (req, res) => {
    const { studentid, firstname, lastname, middlename, address,
            telno, age, course, birthday, sex, religion,
            nationality, status, person_incase, relation, person_telno } = req.body;
    try {
        const [result] = await db.query(
            `INSERT INTO patient(studentid,firstname,lastname,middlename,address,
             telno,age,course,birthday,sex,religion,naionality,status,
             person_incase,relation,person_telno)
             VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [studentid,firstname,lastname,middlename,address,
             telno,age,course,birthday,sex,religion,
             nationality,status,person_incase,relation,person_telno]
        );
        res.json({ success: true, patient_id: result.insertId });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.delete('/api/patients/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM dctd                 WHERE id = ?', [req.params.id]);
        await db.query('DELETE FROM medical_history      WHERE id = ?', [req.params.id]);
        await db.query('DELETE FROM physical_examination WHERE id = ?', [req.params.id]);
        await db.query('DELETE FROM patient              WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'Patient deleted' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── MEDICAL HISTORY (System 2) ─────────────────────────────────
app.get('/api/patients/:id/medical-history', async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT * FROM medical_history WHERE id = ?', [req.params.id]
        );
        if (rows.length === 0)
            return res.json({ success: false, message: 'Not found' });
        res.json({ success: true, medical_history: rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/patients/medical-history', async (req, res) => {
    const { id, HOPI, Allergy, TB, DM, HA, HPN, KD, GO, Smoker, Alcoholic } = req.body;
    try {
        await db.query(
            `INSERT INTO medical_history(id,HOPI,Allergy,TB,DM,HA,HPN,KD,GO,Smoker,Alcoholic)
             VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
            [id, HOPI, Allergy, TB, DM, HA, HPN, KD, GO, Smoker, Alcoholic]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── PHYSICAL EXAM (System 2) ───────────────────────────────────
app.get('/api/patients/:id/physical-exam', async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT * FROM physical_examination WHERE id = ?', [req.params.id]
        );
        if (rows.length === 0)
            return res.json({ success: false, message: 'Not found' });
        res.json({ success: true, physical_exam: rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/patients/physical-exam', async (req, res) => {
    const { id, BP, PR, Wt, Ht, Skin, Eyes, OD, OS, Ears, AD, AD1,
            Nose, Throat, Neck, Thorax, Heart, Lungs,
            Abdomen, Extremities, Deformities, Other } = req.body;
    try {
        await db.query(
            `INSERT INTO physical_examination(id,BP,PR,Wt,Ht,Skin,Eyes,OD,OS,
             Ears,AD,AD1,Nose,Throat,Neck,Thorax,Heart,Lungs,
             Abdomen,Extremities,Deformities,Other)
             VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [id,BP,PR,Wt,Ht,Skin,Eyes,OD,OS,AD,AD1,
             Nose,Throat,Neck,Thorax,Heart,Lungs,
             Abdomen,Extremities,Deformities,Other]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── DIAGNOSIS (System 2) ───────────────────────────────────────
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

app.get('/api/diagnosis/search', async (req, res) => {
    const { keyword } = req.query;
    try {
        const [rows] = await db.query(
            `SELECT d.id, d.date, d.complaints, d.category,
                    d.treatment, d.doctor,
                    p.firstname, p.lastname, p.studentid
             FROM dctd d
             LEFT JOIN patient p ON d.id = p.id
             WHERE d.category   = ? OR p.studentid = ?
             OR    p.firstname  = ? OR p.lastname  = ?
             OR    d.complaints = ?`,
            [keyword, keyword, keyword, keyword, keyword]
        );
        res.json({ success: true, diagnosis: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.delete('/api/diagnosis/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM dctd WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'Diagnosis deleted' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/patients/diagnosis', async (req, res) => {
    const { id, date, complaints, category, treatment, doctor } = req.body;
    try {
        await db.query(
            'INSERT INTO dctd(id,date,complaints,category,treatment,doctor) VALUES(?,?,?,?,?,?)',
            [id, date, complaints, category, treatment, doctor]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.get('/api/patients/:id/diagnosis', async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT date, complaints, treatment, doctor FROM dctd WHERE id = ? ORDER BY date DESC',
            [req.params.id]
        );
        res.json({ success: true, diagnosis: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── USERS / DOCTORS (System 2) ─────────────────────────────────
app.get('/api/users', async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT id, firstname, lastname, middlename, username FROM user'
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
            'SELECT id, firstname, lastname, middlename, username FROM user WHERE username = ? AND password = ?',
            [username, password]
        );
        if (rows.length === 0)
            return res.json({ success: false, message: 'Invalid credentials' });
        res.json({ success: true, user: rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/users', async (req, res) => {
    const { firstname, lastname, middlename, username, password } = req.body;
    try {
        const [result] = await db.query(
            'INSERT INTO user(firstname,lastname,middlename,username,password) VALUES(?,?,?,?,?)',
            [firstname, lastname, middlename, username, password]
        );
        res.json({ success: true, user_id: result.insertId });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.delete('/api/users/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM user WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'Doctor deleted' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── CATEGORIES (System 2) ──────────────────────────────────────
app.get('/api/categories', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM category');
        res.json({ success: true, categories: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/categories', async (req, res) => {
    const { complaints_cat } = req.body;
    try {
        const [result] = await db.query(
            'INSERT INTO category(complaints_cat) VALUES(?)', [complaints_cat]
        );
        res.json({ success: true, category_id: result.insertId });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/categories/increment', async (req, res) => {
    const { category } = req.body;
    try {
        await db.query(
            'UPDATE category SET number = number + 1 WHERE complaints_cat = ?', [category]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.delete('/api/categories/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM category WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'Category deleted' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── TREATMENTS (System 2) ──────────────────────────────────────
app.get('/api/treatments', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM treatment');
        res.json({ success: true, treatments: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── COURSES (System 2) ─────────────────────────────────────────
app.get('/api/courses', async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT id, course, course_name FROM patient_by_course'
        );
        res.json({ success: true, courses: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/courses', async (req, res) => {
    const { course, course_name } = req.body;
    try {
        const [result] = await db.query(
            'INSERT INTO patient_by_course(course, course_name) VALUES(?, ?)',
            [course, course_name]
        );
        res.json({ success: true, course_id: result.insertId });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/patients/increment-course', async (req, res) => {
    const { course } = req.body;
    try {
        await db.query(
            'UPDATE patient_by_course SET qty = qty + 1 WHERE course = ?', [course]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.delete('/api/courses/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM patient_by_course WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'Course deleted' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ══════════════════════════════════════════════════════════════
// START SERVER
// ══════════════════════════════════════════════════════════════
app.listen(PORT, () => {
    console.log(`✅ Node.js API System 3 running at http://localhost:${PORT}`);
    console.log(`   [System 1 PHP]  Products : http://localhost:${PORT}/api/products`);
    console.log(`   [System 1 PHP]  Orders   : http://localhost:${PORT}/api/orders`);
    console.log(`   [System 2 C#]   Patients : http://localhost:${PORT}/api/patients`);
    console.log(`   [System 2 C#]   Diagnosis: http://localhost:${PORT}/api/diagnosis`);
    console.log(`   [System 2 C#]   Users    : http://localhost:${PORT}/api/users`);
    console.log(`   [Both Systems]  Categories,Treatments,Courses`);
});