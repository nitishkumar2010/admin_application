const express = require("express");
const router = express.Router();
const pool = require("../db");

// Get all reports
router.get("/", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, patient_name, report_type, report_date, status, pdf_url FROM reports ORDER BY id ASC"
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

// Add a new report
router.post("/", async (req, res) => {
  const { patient_name, report_type, report_date, status, pdf_url } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO reports (patient_name, report_type, report_date, status, pdf_url)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [patient_name, report_type, report_date, status || "pending", pdf_url]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

// Update report status
router.put("/:id/status", async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!["pending", "approved", "rejected"].includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }

  try {
    const result = await pool.query(
      "UPDATE reports SET status=$1 WHERE id=$2 RETURNING *",
      [status, id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

module.exports = router;
