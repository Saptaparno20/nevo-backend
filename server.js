// server.js
const express = require('express');
const admin = require('firebase-admin');
const { BigQuery } = require('@google-cloud/bigquery');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

// 1. SETUP GOOGLE SERVICES
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const bigquery = new BigQuery({ keyFilename: './serviceAccountKey.json' });

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname))); // Serves your index.html

// ==========================================
// API ENDPOINTS (The "Live" Features)
// ==========================================

// 1. MARK ATTENDANCE (Called by Student QR Scan)
app.post('/api/mark-attendance', async (req, res) => {
    try {
        const { studentId, courseId, location, timestamp } = req.body;
        
        // A. Save to Firestore (Real-time DB for App)
        const docRef = await db.collection('Attendance').add({
            studentId,
            courseId,
            status: 'Present',
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            location: location || 'Campus GPS'
        });

        // B. Stream to BigQuery (For AI Analytics)
        // Note: Ensure dataset 'nevo_analytics' exists in BigQuery
        const row = {
            student_id: studentId,
            course_id: courseId,
            scan_time: BigQuery.datetime(new Date().toISOString()),
            status: 'PRESENT'
        };
        
        // await bigquery.dataset('nevo_analytics').table('attendance_logs').insert([row]);
        // (Uncomment above line once BigQuery table is created)

        res.json({ success: true, message: `Attendance marked for ${courseId}` });
        console.log(`[✔] Attendance recorded: ${studentId} -> ${courseId}`);

    } catch (error) {
        console.error("Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 2. GET STUDENT STATS (Called by Student Dashboard)
app.get('/api/student-stats/:id', async (req, res) => {
    try {
        const studentId = req.params.id;
        
        // Fetch real-time stats from Firestore
        const attendanceSnap = await db.collection('Attendance')
            .where('studentId', '==', studentId).get();
            
        const totalClasses = 50; // Hardcoded for demo, or fetch from 'Classes' collection
        const attended = attendanceSnap.size;
        const percentage = Math.round((attended / totalClasses) * 100);

        res.json({
            attendance_pct: percentage,
            classes_attended: attended,
            kpi_status: percentage > 75 ? "Excellent" : "Needs Improvement"
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 3. CREATE CLASS SESSION (Called by Faculty)
app.post('/api/create-session', async (req, res) => {
    try {
        const { facultyId, courseName, room } = req.body;
        
        const sessionRef = await db.collection('ActiveSessions').add({
            facultyId,
            courseName,
            room,
            isActive: true,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        res.json({ success: true, sessionId: sessionRef.id, qrCodeData: `NEVO:${sessionRef.id}` });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 4. SERVE FRONTEND
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// START SERVER
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`\n🚀 NEVO Server is Live at http://localhost:${PORT}`);
    console.log(`📡 Connected to Firebase: ${serviceAccount.project_id}`);
});