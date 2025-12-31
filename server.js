import express from "express";
import mysql from "mysql";
import cors from "cors";
import multer from "multer";
import path from "path";
import fs from "fs";

const app = express();
const port = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());
app.use('/images', express.static('images')); 
app.use(express.static('public'));
app.get('/', (req, res) => {
  res.send('Backend is running.');
});

// create MYSQL connection 
const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "",
  database: "car",
});

// Connect to database
db.connect((err) => {
  if (err) {
    console.error("Database connection failed:", err);
    return;
  }
  console.log("Connected to MySQL database");
});


const storage = multer.diskStorage({
  destination: (req, res ,cb) => {
    cb(null, 'images/')
  },
    filename:(req, file, cb)=>{
    cb(null,file.originalname + "_" + Date.now() + path.extname(file.originalname))
  }
})

const upload = multer(
  {
    storage:storage
  }
)


// GET all rentals - JOIN with cars table to get car info
app.get("/rentals", (req, res) => {
  const q = `SELECT 
    r.id,
    c.name AS customer_name,
    cars.name AS car_name,
    cars.priceday AS car_price,
    r.start_date,
    r.end_date,
    r.days,
    r.driver,
    r.total,
    r.created_at
  FROM rentals r
  JOIN customers c ON r.customer_id = c.id
  JOIN cars ON r.car_id = cars.id
  ORDER BY r.created_at DESC`;

  db.query(q, (err, data) => {
    if (err) {
      console.error("Error fetching rentals:", err);
      return res.status(500).json({ error: "Failed to fetch rentals" });
    }
    return res.json(data);
  });
});

// GET all cars
app.get("/cars", (req, res) => {
  const q = "SELECT * FROM cars";
  
  db.query(q, (err, data) => {
    if (err) return res.json(err);
    
    for (const d of data) {
      d.img = `http://localhost:5001/images/${d.img}`;
    }
    
    res.json(data);
  });
});

// POST new rental - receives car_id, gets name and price from cars table
app.post("/rentals", (req, res) => {
  const { name, car_id, start_date, end_date, days, driver, total } = req.body;
  
  // Get car info
  const getCarQuery = "SELECT name, priceday FROM cars WHERE id = ?";
  
  db.query(getCarQuery, [car_id], (err, carData) => {
    if (err || carData.length === 0) {
      return res.status(500).json({ error: "Car not found" });
    }
    
    const car_name = carData[0].name;
    const car_price = carData[0].priceday;
   // Insert customer
    const customerQuery = "INSERT INTO customers(`name`) VALUES (?)";
    
    db.query(customerQuery, [name], (err, customerResult) => {
      if (err) {
        console.error("Customer insert error:", err);
        return res.status(500).json({ error: "Failed to create customer", details: err.message });
      }
      
      const customer_id = customerResult.insertId;
      
      const driverValue = driver ? 1 : 0;
      
      // Insert rental
      const rentalQuery = `
        INSERT INTO rentals
        (customer_id, car_id, car_name, car_price, start_date, end_date, days, driver, total)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      db.query(rentalQuery, [customer_id, car_id, car_name, car_price, start_date, end_date, days, driverValue, total], (err, rentalResult) => {
        if (err) {
          console.error("Rental insert error:", err);
          console.error("SQL Message:", err.sqlMessage);
          return res.status(500).json({ error: "Failed to create rental", details: err.sqlMessage });
        }
        
        return res.json({ 
          success: true, 
          customer_id: customer_id,
          rental_id: rentalResult.insertId,
          message: "Rental created successfully" 
        });
      });
    });
  });
});




// DELETE one rental
app.delete("/rentals/:id", (req, res) => {
  const id = req.params.id;
  const q = "DELETE FROM rentals WHERE id = ?";

  db.query(q, [id], (err, data) => {
    if (err) {
      console.error("Error deleting rental:", err);
      return res.status(500).json({ error: "Failed to delete rental" });
    }
    return res.json({ success: true, message: "Rental deleted" });
  });
});

// DELETE all rentals
app.delete("/rentals", (req, res) => {
  const q = "DELETE FROM rentals";

  db.query(q, (err, data) => {
    if (err) {
      console.error("Error deleting all rentals:", err);
      return res.status(500).json({ error: "Failed to delete all rentals" });
    }
    return res.json({ success: true, message: "All rentals deleted" });
  });
});
// GET single car by ID - Add this BEFORE the DELETE route
app.get("/cars/:id", (req, res) => {
  const id = req.params.id;
  const q = "SELECT * FROM cars WHERE id = ?";
  
  db.query(q, [id], (err, data) => {
    if (err) {
      console.error("Error fetching car:", err);
      return res.status(500).json({ error: "Failed to fetch car" });
    }
    if (data.length === 0) {
      return res.status(404).json({ error: "Car not found" });
    }
    return res.json(data[0]);
  });
});

// PUT (update) car
app.put("/cars/:id", (req, res) => {
  const id = req.params.id;
  const { name, descrp, priceday, discount, img } = req.body;
  
  const q = "UPDATE cars SET `name`= ?, `descrp`= ?, `priceday`= ?, `discount`= ?, `img`= ? WHERE id = ?";
  
  db.query(q, [name, descrp, priceday, discount, img, id], (err, data) => {
    if (err) {
      console.error("Error updating car:", err);
      return res.status(500).json({ error: "Failed to update car" });
    }
    return res.json({ success: true, message: "Car updated successfully" });
  });
});

// DELETE car
app.delete("/cars/:id", (req, res) => {
  const id = req.params.id;
  const q = "DELETE FROM cars WHERE id = ?";

  db.query(q, [id], (err, data) => {
    if (err) {
      console.error("Error deleting car:", err);
      return res.status(500).json({ error: "Failed to delete car" });
    }
    return res.json({ success: true, message: "Car deleted successfully" });
  });
});
app.post("/cars", upload.single('image'), (req, res) => {  
  
  const name = req.body.name;
  const descrp = req.body.descrp;
  const priceday = req.body.priceday;
  const discount = req.body.discount;
  const img = req.file.filename;  

  const q = "INSERT INTO cars(`name`, `descrp`, `priceday`, `discount`, `img`) VALUES (?,?,?,?,?)";  

  db.query(q, [name, descrp, priceday, discount, img], (err, data) => { 
    if (err) return res.send(err);
    return res.json(data);
  });
});

app.listen(5001, () => {
  console.log("Backend server running on port 5001");
});