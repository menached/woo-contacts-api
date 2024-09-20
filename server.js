require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const https = require('https');
const fs = require('fs');

// Create an Express app
const app = express();
app.use(cors()); // Enable CORS for frontend communication

// SSL certificates
const sslOptions = {
  key: fs.readFileSync('/etc/ssl/private/doap.com.key'),
  cert: fs.readFileSync('/etc/ssl/certs/doap.com.crt'),
  ca: fs.readFileSync('/etc/ssl/certs/doap-chain.crt') // Add the chain file here
};

// Create a connection to the database
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});

// Connect to the database
db.connect((err) => {
  if (err) {
    console.error('Error connecting to the database:', err);
    return;
  }
  console.log('Connected to the MySQL database');
});

const applyFilters = (req) => {
  const cities = req.query.city && req.query.city !== 'All' ? req.query.city.split(',') : null;
  const zipCodes = req.query.zipCode && req.query.zipCode !== 'All' ? req.query.zipCode.split(',') : null;
  const areaCodes = req.query.areaCode && req.query.areaCode !== 'All' ? req.query.areaCode.split(',') : null;
  const category = req.query.category && req.query.category !== 'All' ? req.query.category : null;
  const search = req.query.search ? `%${req.query.search}%` : null;

  return { cities, zipCodes, areaCodes, category, search };
};

//// Helper function to apply filters
//const applyFilters = (req) => {
  //const cities = req.query.city !== 'All' ? req.query.city.split(',') : null;
  //const zipCodes = req.query.zipCode !== 'All' ? req.query.zipCode.split(',') : null;
  //const areaCodes = req.query.areaCode !== 'All' ? req.query.areaCode.split(',') : null;
  //const category = req.query.category !== 'All' ? req.query.category : null;
  //const search = req.query.search ? `%${req.query.search}%` : null;

  //return { cities, zipCodes, areaCodes, category, search };
//};

// Helper function to build SQL WHERE clause based on filters
const buildFilterQuery = (filters, params) => {
  let query = 'WHERE 1=1'; // Base query

  if (filters.cities) {
    query += ` AND city IN (${filters.cities.map(() => '?').join(',')})`;
    params.push(...filters.cities);
  }

  if (filters.zipCodes) {
    query += ` AND zip_code IN (${filters.zipCodes.map(() => '?').join(',')})`;
    params.push(...filters.zipCodes);
  }

  if (filters.areaCodes) {
    query += ` AND (CASE 
                  WHEN LEFT(phone_number, 2) = '+1' THEN SUBSTRING(phone_number, 3, 3)
                  ELSE LEFT(phone_number, 3)
                END) IN (${filters.areaCodes.map(() => '?').join(',')})`;
    params.push(...filters.areaCodes);
  }

  if (filters.category) {
    query += ' AND category = ?';
    params.push(filters.category);
  }

  if (filters.search) {
    query += ' AND full_name LIKE ?';
    params.push(filters.search);
  }

  return query;
};

// Route to get contacts with pagination, sorting, and filters
app.get('/contacts', (req, res) => {
  const limit = parseInt(req.query.limit) || 10;
  const page = parseInt(req.query.page) || 1;
  const offset = (page - 1) * limit;

  const sortColumn = req.query.sortColumn || 'full_name'; // Default sort column
  const sortOrder = req.query.sortOrder || 'asc';         // Default sort order

  const filters = applyFilters(req);
  const params = [];
  let query = `SELECT * FROM contacts ${buildFilterQuery(filters, params)} ORDER BY ${sortColumn} ${sortOrder}`;

  query += ' LIMIT ? OFFSET ?';
  params.push(limit, offset);

  db.query(query, params, (err, results) => {
    if (err) return res.status(500).send(err);

    const countQuery = `SELECT COUNT(*) as count FROM contacts ${buildFilterQuery(filters, [])}`;
    db.query(countQuery, params.slice(0, -2), (err, countResults) => {
      if (err) return res.status(500).send(err);

      const totalContacts = countResults[0].count;
      const totalPages = Math.ceil(totalContacts / limit);

      res.json({
        contacts: results,
        totalPages,
        currentPage: page,
        totalContacts
      });
    });
  });
});

// Route to get unique cities, zip codes, area codes, and categories for dropdown filters
app.get('/filters', (req, res) => {
  const queries = {
    cityQuery: `SELECT DISTINCT city FROM contacts where city != '' ORDER BY city ASC`,
    zipCodeQuery: 'SELECT DISTINCT zip_code FROM contacts ORDER BY zip_code ASC',
    areaCodeQuery: `
      SELECT DISTINCT 
      CASE
        WHEN LEFT(phone_number, 2) = '+1' THEN SUBSTRING(phone_number, 3, 3)
        ELSE LEFT(phone_number, 3)
      END AS area_code 
      FROM contacts ORDER BY area_code ASC`,
    categoryQuery: 'SELECT DISTINCT category FROM contacts ORDER BY category ASC',
  };

  const filters = {};
  db.query(queries.cityQuery, (err, cityResults) => {
    if (err) return res.status(500).send(err);
    filters.cities = cityResults.map((result) => result.city);

    db.query(queries.zipCodeQuery, (err, zipResults) => {
      if (err) return res.status(500).send(err);
      filters.zipCodes = zipResults.map((result) => result.zip_code);

      db.query(queries.areaCodeQuery, (err, areaCodeResults) => {
        if (err) return res.status(500).send(err);
        filters.areaCodes = areaCodeResults.map((result) => result.area_code);

        db.query(queries.categoryQuery, (err, categoryResults) => {
          if (err) return res.status(500).send(err);
          filters.categories = categoryResults.map((result) => result.category);

          db.query('SELECT COUNT(*) as totalRecords FROM contacts', (err, countResult) => {
            if (err) return res.status(500).send(err);
            filters.totalRecords = countResult[0].totalRecords;
            res.json(filters);
          });
        });
      });
    });
  });
});

// Route to download contacts as CSV
app.get('/contacts/download', (req, res) => {
  const filters = applyFilters(req);
  const params = [];
  let query = `SELECT id, full_name, email, phone_number, street_address, city, zip_code 
               FROM contacts ${buildFilterQuery(filters, params)}`;

  db.query(query, params, (err, results) => {
    if (err) return res.status(500).send(err);

    let csvContent = 'id,full_name,email,phone_number,street_address,city,zip_code\n';
    results.forEach((row) => {
      csvContent += `${row.id},${row.full_name},${row.email},${row.phone_number},${row.street_address},${row.city},${row.zip_code}\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=goAutodial_campaign.csv');
    res.status(200).send(csvContent);
  });
});

// Start the server on HTTPS
const PORT = process.env.PORT || 5000;
https.createServer(sslOptions, app).listen(PORT, () => {
  console.log(`HTTPS Server running on port ${PORT}`);
});

