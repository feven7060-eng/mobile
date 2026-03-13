import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pkg from 'pg';
import QRCode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';
import nodemailer from 'nodemailer';
import jwt from 'jsonwebtoken';

dotenv.config();
const { Pool } = pkg;
const app = express();
app.use(cors());
app.use(express.json());

// ─── Database ───────────────────────────────────────────────
const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });

const query = async (text, params) => {
    const client = await pool.connect();
    try {
        return await client.query(text, params);
    } finally {
        client.release();
    }
};

// Auto-create tables on startup
const initDb = async () => {
    await query(`
        CREATE TABLE IF NOT EXISTS applicants (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            role VARCHAR(50) NOT NULL,
            full_name VARCHAR(255) NOT NULL,
            email VARCHAR(255) UNIQUE NOT NULL,
            country VARCHAR(100) NOT NULL,
            organization VARCHAR(255),
            social_handle VARCHAR(255),
            status VARCHAR(20) DEFAULT 'pending',
            confirmation_number VARCHAR(20),
            qr_code TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS audit_logs (
            id SERIAL PRIMARY KEY,
            action TEXT NOT NULL,
            target_id UUID,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);
    console.log('[DB] Schema ready.');
};

// ─── Email Helper ────────────────────────────────────────────
const sendEmail = async (to, subject, html) => {
    const transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: parseInt(process.env.EMAIL_PORT),
        auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
    });
    await transporter.sendMail({ from: `"ASMIS" <${process.env.EMAIL_USER}>`, to, subject, html });
};

// ─── Theme Color Helper ───────────────────────────────────────
const getRoleColor = (role = '') => {
    const r = role.toLowerCase();
    if (r.includes('speaker')) return '#c29958';
    if (r.includes('vip')) return '#1a1a1a';
    if (r.includes('staff')) return '#1b2a4a';
    if (r.includes('attendee')) return '#f5f5f5';
    if (r.includes('media')) return '#757575';
    if (r.includes('sponsor')) return '#1b2a4a';
    if (r.includes('influencer')) return '#c29958';
    return '#c29958';
};

// ─── Middleware ──────────────────────────────────────────────
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ error: 'Access denied. No token provided.' });

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid or expired token.' });
        req.user = user;
        next();
    });
};

// ─── Routes ──────────────────────────────────────────────────

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date() }));

// Register
app.post('/api/register', async (req, res) => {
    const { role, full_name, email, country, organization, social_handle } = req.body;
    if (!role || !full_name || !email || !country) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    try {
        const result = await query(
            `INSERT INTO applicants (role, full_name, email, country, organization, social_handle)
             VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
            [role, full_name, email, country, organization || '', social_handle || '']
        );
        res.status(201).json({ message: 'Registration successful', id: result.rows[0].id });
    } catch (err) {
        if (err.code === '23505') return res.status(409).json({ error: 'Email already registered' });
        res.status(500).json({ error: 'Registration failed' });
    }
});

// Admin Login
app.post('/api/admin/login', async (req, res) => {
    const { username, password } = req.body;
    
    // In a real app, you'd check this against a database with hashed passwords
    if (username === 'admin' && password === 'asmis2026') {
        const token = jwt.sign({ username: 'admin', role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.json({ token });
    } else {
        res.status(401).json({ error: 'Invalid credentials' });
    }
});

// Get all applicants (admin)
app.get('/api/admin/applicants', authenticateToken, async (req, res) => {
    const result = await query('SELECT * FROM applicants ORDER BY created_at DESC');
    res.json(result.rows);
});

// Approve applicant
app.post('/api/admin/approve/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        const confNumber = Math.floor(100000 + Math.random() * 900000).toString();
        const verificationUrl = `https://asmis.example.com/verify?conf=${confNumber}`;
        const qrDataUrl = await QRCode.toDataURL(verificationUrl, { width: 300, margin: 2 });

        await query(
            `UPDATE applicants SET status='approved', confirmation_number=$1, qr_code=$2 WHERE id=$3`,
            [confNumber, qrDataUrl, id]
        );

        const applicant = (await query('SELECT * FROM applicants WHERE id=$1', [id])).rows[0];
        await query('INSERT INTO audit_logs(action, target_id) VALUES($1,$2)', [`Approved: ${applicant.full_name}`, id]);

        // Send approval email with QR code
        try {
            const transporter = nodemailer.createTransport({
                host: process.env.EMAIL_HOST,
                port: parseInt(process.env.EMAIL_PORT),
                auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
            });

            await transporter.sendMail({
                from: `"ASMIS" <${process.env.EMAIL_USER}>`,
                to: applicant.email,
                subject: 'ASMIS 2026 — You\'re Approved! 🎉',
                html: `
                    <div style="font-family: sans-serif; color: #333;">
                        <h2>Welcome, ${applicant.full_name}!</h2>
                        <p>Your registration as <strong>${applicant.role}</strong> has been approved.</p>
                        <p>Your confirmation code: <strong style="font-size:24px; color: #c29958;">${confNumber}</strong></p>
                        <p>Please present the QR code below at the event entrance to receive your badge:</p>
                        <div style="margin-top: 20px;">
                            <img src="cid:qrcode@asmis" alt="QR Code" style="width: 200px; height: 200px;"/>
                        </div>
                        <p style="font-size: 12px; color: #888; margin-top: 30px;">
                            If you cannot see the image, your code is: ${confNumber}
                        </p>
                    </div>
                `,
                attachments: [
                    {
                        filename: 'qrcode.png',
                        path: qrDataUrl,
                        cid: 'qrcode@asmis'
                    }
                ]
            });
        } catch (e) { 
            console.warn('Email failed:', e.message); 
        }

        res.json({ message: 'Approved', confirmation_number: confNumber });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Reject applicant
app.post('/api/admin/reject/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        await query(`UPDATE applicants SET status='rejected' WHERE id=$1`, [id]);
        const applicant = (await query('SELECT * FROM applicants WHERE id=$1', [id])).rows[0];
        await query('INSERT INTO audit_logs(action, target_id) VALUES($1,$2)', [`Rejected: ${applicant.full_name}`, id]);

        try {
            await sendEmail(applicant.email, 'ASMIS 2026 — Application Update',
                `<p>Dear ${applicant.full_name}, unfortunately your application was not approved at this time.</p>`
            );
        } catch (e) { console.warn('Email failed:', e.message); }

        res.json({ message: 'Rejected' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get badge by confirmation code
app.get('/api/badge/:conf', async (req, res) => {
    const { conf } = req.params;
    const result = await query('SELECT * FROM applicants WHERE confirmation_number=$1', [conf]);
    if (!result.rows.length) return res.status(404).json({ error: 'Invalid confirmation code' });
    const a = result.rows[0];
    if (a.status !== 'approved') return res.status(400).json({ error: 'Not approved' });
    res.json({ ...a, theme_color: getRoleColor(a.role) });
});

// Verify QR (scanner)
app.get('/api/verify/:conf', authenticateToken, async (req, res) => {
    const result = await query('SELECT full_name, role, status, country, confirmation_number FROM applicants WHERE confirmation_number=$1', [req.params.conf]);
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
});

// ─── Start ────────────────────────────────────────────────────
const PORT = process.env.PORT || 5001;
app.listen(PORT, '0.0.0.0', async () => {
    console.log(`ASMIS Mobile Backend running on port ${PORT}`);
    try { await initDb(); } catch (e) { console.warn('DB init failed:', e.message); }
});
