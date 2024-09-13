require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');

const app = express();
app.use(cors()); // Enable CORS to allow React frontend to communicate with the backend


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



app.get('/contacts', (req, res) => {
  const limit = parseInt(req.query.limit) || 10;
  const page = parseInt(req.query.page) || 1;
  const offset = (page - 1) * limit;
  const city = req.query.city !== 'All' ? req.query.city : null;
  const zipCode = req.query.zipCode !== 'All' ? req.query.zipCode : null;
  const areaCode = req.query.areaCode !== 'All' ? req.query.areaCode : null;
  const category = req.query.category !== 'All' ? req.query.category : null;
  const search = req.query.search ? `%${req.query.search}%` : null; // Loose match for search

  let query = `SELECT * FROM contacts WHERE 1=1`;
  let params = [];

  // Apply filters for city, zip code, area code, and category
  if (city) {
    query += ` AND city = ?`;
    params.push(city);
  }

  if (zipCode) {
    query += ` AND zip_code = ?`;
    params.push(zipCode);
  }

  // Apply filters for city, zip code, area code, and category
  if (areaCode) {
    query += ` AND (CASE 
            WHEN LEFT(phone_number, 2) = '+1' THEN SUBSTRING(phone_number, 3, 3) 
            ELSE LEFT(phone_number, 3) 
            END) = ?`;
    params.push(areaCode);
  }

  //if (areaCode) {
    //query += ` AND LEFT(phone_number, 3) = ?`;
    //params.push(areaCode);
  //}

  if (category) {
    query += ` AND category = ?`;
    params.push(category);
  }

  // Apply the search query to filter by first name (loose match)
  if (search) {
    query += ` AND full_name LIKE ?`;
    params.push(search);
  }

  // Limit the results and apply pagination
  query += ` LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  db.query(query, params, (err, results) => {
    if (err) {
      return res.status(500).send(err);
    }

    // Count the total number of filtered results
    db.query('SELECT COUNT(*) as count FROM contacts WHERE 1=1', params, (err, countResults) => {
      if (err) {
        return res.status(500).send(err);
      }

      const totalContacts = countResults[0].count;
      const totalPages = Math.ceil(totalContacts / limit);

      res.json({
        contacts: results,
        totalPages: totalPages,
        currentPage: page,
        totalContacts: totalContacts
      });
    });
  });
});



// Route to get unique cities, zip codes, area codes, and categories for dropdown filters
app.get('/filters', (req, res) => {
  const cityQuery = 'SELECT DISTINCT city FROM contacts ORDER BY city ASC';
  const zipCodeQuery = 'SELECT DISTINCT zip_code FROM contacts ORDER BY zip_code ASC';
  const areaCodeQuery = `
    SELECT DISTINCT 
    CASE
      WHEN LEFT(phone_number, 2) = '+1' THEN SUBSTRING(phone_number, 3, 3)
      ELSE LEFT(phone_number, 3)
    END AS area_code 
    FROM contacts ORDER BY area_code ASC`;
  const categoryQuery = 'SELECT DISTINCT category FROM contacts ORDER BY category ASC';

  const filters = {};

  db.query(cityQuery, (err, cityResults) => {
    if (err) {
      return res.status(500).send(err);
    }
    filters.cities = cityResults.map((result) => result.city);

    db.query(zipCodeQuery, (err, zipResults) => {
      if (err) {
        return res.status(500).send(err);
      }
      filters.zipCodes = zipResults.map((result) => result.zip_code);

      db.query(areaCodeQuery, (err, areaCodeResults) => {
        if (err) {
          return res.status(500).send(err);
        }
        filters.areaCodes = areaCodeResults.map((result) => result.area_code);

        db.query(categoryQuery, (err, categoryResults) => {
          if (err) {
            return res.status(500).send(err);
          }
          filters.categories = categoryResults.map((result) => result.category);

          // Get total count of records
          db.query('SELECT COUNT(*) as totalRecords FROM contacts', (err, countResult) => {
            if (err) {
              return res.status(500).send(err);
            }
            filters.totalRecords = countResult[0].totalRecords;
            res.json(filters);
          });
        });
      });
    });
  });
});


// Route to get all filtered contacts for CSV download (without pagination)
app.get('/contacts/download', (req, res) => {
  const city = req.query.city !== 'All' ? req.query.city : null;
  const zipCode = req.query.zipCode !== 'All' ? req.query.zipCode : null;
  const areaCode = req.query.areaCode !== 'All' ? req.query.areaCode : null;
  const category = req.query.category !== 'All' ? req.query.category : null;
  const search = req.query.search ? `%${req.query.search}%` : null; // Loose match for search

  let query = `SELECT * FROM contacts WHERE 1=1`;
  let params = [];

  // Apply filters for city, zip code, area code, and category
  if (city) {
    query += ` AND city = ?`;
    params.push(city);
  }

  if (zipCode) {
    query += ` AND zip_code = ?`;
    params.push(zipCode);
  }

  // Apply filters for city, zip code, area code, and category
  if (areaCode) {
    query += ` AND (CASE 
            WHEN LEFT(phone_number, 2) = '+1' THEN SUBSTRING(phone_number, 3, 3) 
            ELSE LEFT(phone_number, 3) 
            END) = ?`;
    params.push(areaCode);
  }

  //if (areaCode) {
    //query += ` AND LEFT(phone_number, 3) = ?`;
    //params.push(areaCode);
  //}

  if (category) {
    query += ` AND category = ?`;
    params.push(category);
  }

  // Apply the search query to filter by first name (loose match)
  if (search) {
    query += ` AND full_name LIKE ?`;
    params.push(search);
  }

  db.query(query, params, (err, results) => {
    if (err) {
      return res.status(500).send(err);
    }
    res.json(results); // Return the filtered results
  });
});



// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

